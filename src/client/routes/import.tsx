import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSummary, useSaveAiImportSetting } from '../api/hooks';
import { fetchImportStatus, uploadForPreview, confirmImport, discardPreview } from '../api/hooks';
import { DropZone } from '../components/import/DropZone';
import { ImportQueue } from '../components/import/ImportQueue';
import type { FileImportState } from '../components/import/ImportQueue';
import { ImportLog } from '../components/import/ImportLog';

export const Route = createFileRoute('/import')({
  component: ImportPage,
});

function ImportPage() {
  const { data: summary } = useSummary();
  const qc = useQueryClient();
  const [fileStates, setFileStates] = useState<FileImportState[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const processingRef = useRef(false);
  const queueRef = useRef<FileImportState[]>([]);
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const saveAiImport = useSaveAiImportSetting();

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      for (const interval of pollIntervalsRef.current.values()) {
        clearInterval(interval);
      }
      pollIntervalsRef.current.clear();
    };
  }, []);

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['summary'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['monthly'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['categoryList'] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  }, [qc]);

  const startPolling = useCallback((fileId: string, importId: string, saldoWarning?: string) => {
    // Avoid duplicate intervals
    if (pollIntervalsRef.current.has(fileId)) return;

    const interval = setInterval(async () => {
      try {
        const status = await fetchImportStatus(importId);
        setFileStates(prev =>
          prev.map(f => {
            if (f.id !== fileId) return f;
            if (status.status === 'done') {
              return {
                ...f,
                status: 'done' as const,
                progress: undefined,
                result: {
                  filename: status.filename,
                  imported: status.imported,
                  skipped: status.skipped + status.duplicates,
                  total: status.total,
                  bank: status.bank,
                  saldoWarning: f.saldoWarning,
                },
              };
            }
            if (status.status === 'error') {
              return {
                ...f,
                status: 'error' as const,
                progress: undefined,
                error: status.error || 'Unbekannter Fehler',
              };
            }
            // Still processing — update progress
            return {
              ...f,
              progress: {
                processed: status.processed,
                total: status.total,
                imported: status.imported,
                skipped: status.skipped,
                duplicates: status.duplicates,
              },
            };
          })
        );

        if (status.status === 'done' || status.status === 'error') {
          clearInterval(interval);
          pollIntervalsRef.current.delete(fileId);
          invalidateAll();
        }
      } catch {
        // Network error — keep polling, will retry next interval
      }
    }, 1000);

    pollIntervalsRef.current.set(fileId, interval);
  }, [invalidateAll]);

  // Shared logic: handle preview response and update file state
  const handlePreviewResponse = useCallback((fileId: string, preview: Awaited<ReturnType<typeof uploadForPreview>>) => {
    if (preview.conflict && preview.matchingTemplates) {
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'conflict' as const, matchingTemplates: preview.matchingTemplates }
            : f
        )
      );
    } else if (preview.requiresAiConsent) {
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'ai-consent' as const, aiConsentReason: preview.reason }
            : f
        )
      );
    } else {
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'preview' as const, preview }
            : f
        )
      );
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;

      // Mark as uploading
      setFileStates(prev =>
        prev.map(f => f.id === next.id ? { ...f, status: 'uploading' as const } : f)
      );

      try {
        const preview = await uploadForPreview(next.file);
        handlePreviewResponse(next.id, preview);
      } catch (e: any) {
        setFileStates(prev =>
          prev.map(f =>
            f.id === next.id
              ? { ...f, status: 'error' as const, error: e.message || 'Unbekannter Fehler' }
              : f
          )
        );
      }
    }

    processingRef.current = false;

    // If new items were added while finishing up, restart
    if (queueRef.current.length > 0) {
      processQueue();
    }
  }, [handlePreviewResponse]);

  const handleFiles = useCallback((files: FileList) => {
    const newStates: FileImportState[] = Array.from(files).map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: 'queued' as const,
    }));

    // Add to both display state and processing queue
    queueRef.current.push(...newStates);
    setFileStates(prev => [...prev, ...newStates]);
    processQueue();
  }, [processQueue]);

  const handleTemplateSelect = useCallback(async (fileId: string, templateId: string) => {
    const fileState = fileStates.find(f => f.id === fileId);
    if (!fileState) return;

    setFileStates(prev =>
      prev.map(f => f.id === fileId ? { ...f, status: 'uploading' as const, matchingTemplates: undefined } : f)
    );

    try {
      const preview = await uploadForPreview(fileState.file, templateId);
      handlePreviewResponse(fileId, preview);
    } catch (e: any) {
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error' as const, error: e.message || 'Unbekannter Fehler' }
            : f
        )
      );
    }
  }, [fileStates, handlePreviewResponse]);

  // AI consent: user allows AI analysis, optionally saving the preference
  const handleAiConsent = useCallback(async (fileId: string, remember: boolean) => {
    const fileState = fileStates.find(f => f.id === fileId);
    if (!fileState) return;

    // Save the setting (always or just for this session)
    if (remember) {
      saveAiImport.mutate(true);
    } else {
      // One-time: just save the setting so the next request goes through,
      // but it will persist (there's no "session-only" mode — always saves)
      saveAiImport.mutate(true);
    }

    // Retry the upload now that consent is given
    setFileStates(prev =>
      prev.map(f => f.id === fileId ? { ...f, status: 'uploading' as const, aiConsentReason: undefined } : f)
    );

    try {
      const preview = await uploadForPreview(fileState.file);
      handlePreviewResponse(fileId, preview);
    } catch (e: any) {
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error' as const, error: e.message || 'Unbekannter Fehler' }
            : f
        )
      );
    }
  }, [fileStates, saveAiImport, handlePreviewResponse]);

  // AI consent dismissed: remove the file
  const handleAiConsentDismiss = useCallback((fileId: string) => {
    setFileStates(prev => prev.filter(f => f.id !== fileId));
  }, []);

  // Preview: confirm import (optionally with a bank name override)
  const handleConfirmPreview = useCallback(async (fileId: string, bankName?: string) => {
    const fileState = fileStates.find(f => f.id === fileId);
    if (!fileState?.preview) return;

    const saldoWarning = fileState.preview.saldoWarning;

    setFileStates(prev =>
      prev.map(f => f.id === fileId ? { ...f, status: 'processing' as const, saldoWarning, preview: undefined, progress: { processed: 0, total: f.preview?.total || 0, imported: 0, skipped: 0, duplicates: 0 } } : f)
    );

    try {
      const result = await confirmImport(fileState.preview.previewId, bankName);
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, importId: result.importId }
            : f
        )
      );
      startPolling(fileId, result.importId, saldoWarning);
    } catch (e: any) {
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error' as const, error: e.message || 'Unbekannter Fehler' }
            : f
        )
      );
    }
  }, [fileStates, startPolling]);

  // Preview: discard
  const handleDiscardPreview = useCallback(async (fileId: string) => {
    const fileState = fileStates.find(f => f.id === fileId);
    if (fileState?.preview) {
      discardPreview(fileState.preview.previewId).catch(() => {});
    }
    setFileStates(prev => prev.filter(f => f.id !== fileId));
  }, [fileStates]);

  const handleClear = useCallback(() => {
    // Discard any active previews
    for (const f of fileStates) {
      if (f.preview) {
        discardPreview(f.preview.previewId).catch(() => {});
      }
    }
    // Stop any active polling
    for (const interval of pollIntervalsRef.current.values()) {
      clearInterval(interval);
    }
    pollIntervalsRef.current.clear();
    setFileStates([]);
  }, [fileStates]);

  const hasFiles = fileStates.length > 0;

  return (
    <>
      <DropZone onFiles={handleFiles} compact={hasFiles} />
      {hasFiles && (
        <ImportQueue
          files={fileStates}
          onClear={handleClear}
          onSelectTemplate={handleTemplateSelect}
          onConfirmPreview={handleConfirmPreview}
          onDiscardPreview={handleDiscardPreview}
          onAiConsent={handleAiConsent}
          onAiConsentDismiss={handleAiConsentDismiss}
          autoApprove={autoApprove}
          onAutoApproveChange={setAutoApprove}
        />
      )}
      <div className="bg-surface rounded-2xl shadow-card overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-border">
          <div className="font-heading font-semibold text-[15px]">Import-Verlauf</div>
        </div>
        <div className="p-6">
          <ImportLog imports={summary?.imports || []} />
        </div>
      </div>
    </>
  );
}
