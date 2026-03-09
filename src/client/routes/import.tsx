import { createFileRoute } from '@tanstack/react-router';
import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSummary } from '../api/hooks';
import { apiPost } from '../api/client';
import type { ImportResult } from '../api/hooks';
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
  const processingRef = useRef(false);
  const queueRef = useRef<FileImportState[]>([]);

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['summary'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['monthly'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['categoryList'] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  }, [qc]);

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
        const fd = new FormData();
        fd.append('files', next.file);
        const data = await apiPost<{ success: boolean; results: ImportResult[] }>('/import', fd);
        const result = data.results[0];
        if (result.conflict && result.matchingTemplates) {
          setFileStates(prev =>
            prev.map(f =>
              f.id === next.id
                ? { ...f, status: 'conflict' as const, matchingTemplates: result.matchingTemplates }
                : f
            )
          );
        } else {
          setFileStates(prev =>
            prev.map(f =>
              f.id === next.id ? { ...f, status: 'done' as const, result } : f
            )
          );
        }
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
    invalidateAll();

    // If new items were added while finishing up, restart
    if (queueRef.current.length > 0) {
      processQueue();
    }
  }, [invalidateAll]);

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
      const fd = new FormData();
      fd.append('files', fileState.file);
      fd.append('templateId', templateId);
      const data = await apiPost<{ success: boolean; results: ImportResult[] }>('/import', fd);
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId ? { ...f, status: 'done' as const, result: data.results[0] } : f
        )
      );
      invalidateAll();
    } catch (e: any) {
      setFileStates(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error' as const, error: e.message || 'Unbekannter Fehler' }
            : f
        )
      );
    }
  }, [fileStates, invalidateAll]);

  const handleClear = useCallback(() => {
    setFileStates([]);
  }, []);

  const hasFiles = fileStates.length > 0;

  return (
    <>
      <DropZone onFiles={handleFiles} compact={hasFiles} />
      {hasFiles && <ImportQueue files={fileStates} onClear={handleClear} onSelectTemplate={handleTemplateSelect} />}
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
