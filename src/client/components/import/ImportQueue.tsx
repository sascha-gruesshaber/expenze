import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, RotateCcw, AlertTriangle, Eye, FileText, ChevronDown, ChevronRight, Brain, Pencil, Check, Zap } from 'lucide-react';
import type { ImportPreviewResponse } from '../../api/hooks';
import { BankLogo } from '../BankLogo';

export type FileStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error' | 'conflict' | 'preview' | 'ai-consent';

export interface FileImportState {
  id: string;
  file: File;
  status: FileStatus;
  importId?: string;
  progress?: { processed: number; total: number; imported: number; skipped: number; duplicates: number };
  result?: { filename: string; imported: number; skipped: number; total: number; bank: string; saldoWarning?: string };
  error?: string;
  matchingTemplates?: { id: string; name: string }[];
  saldoWarning?: string;
  preview?: ImportPreviewResponse;
  aiConsentReason?: 'pdf' | 'csv';
}

interface ImportQueueProps {
  files: FileImportState[];
  onClear: () => void;
  onSelectTemplate?: (fileId: string, templateId: string) => void;
  onConfirmPreview?: (fileId: string, bankName?: string) => void;
  onDiscardPreview?: (fileId: string) => void;
  onAiConsent?: (fileId: string, remember: boolean) => void;
  onAiConsentDismiss?: (fileId: string) => void;
  autoApprove?: boolean;
  onAutoApproveChange?: (value: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ImportQueue({ files, onClear, onSelectTemplate, onConfirmPreview, onDiscardPreview, onAiConsent, onAiConsentDismiss, autoApprove, onAutoApproveChange }: ImportQueueProps) {
  const done = files.filter(f => f.status === 'done').length;
  const errors = files.filter(f => f.status === 'error').length;
  const conflicts = files.filter(f => f.status === 'conflict').length;
  const previews = files.filter(f => f.status === 'preview').length;
  const processing = files.filter(f => f.status === 'processing').length;
  const aiConsents = files.filter(f => f.status === 'ai-consent').length;
  const total = files.length;
  const allDone = done + errors === total && conflicts === 0 && processing === 0 && previews === 0 && aiConsents === 0;
  const progress = total > 0 ? ((done + errors) / total) * 100 : 0;

  const totalImported = files.reduce((sum, f) => sum + (f.result?.imported || 0), 0);
  const totalSkipped = files.reduce((sum, f) => sum + (f.result?.skipped || 0), 0);

  return (
    <div className="bg-surface rounded-2xl shadow-card overflow-hidden">
      {/* Progress header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="font-heading font-semibold text-[15px]">
            {allDone ? (
              errors === 0 ? (
                <span className="text-accent">{total} {total === 1 ? 'Datei' : 'Dateien'} importiert</span>
              ) : (
                <span>{done} von {total} {total === 1 ? 'Datei' : 'Dateien'} importiert</span>
              )
            ) : previews > 0 ? (
              <span>{previews} {previews === 1 ? 'Datei' : 'Dateien'} zur Prüfung bereit</span>
            ) : (
              <span>{done + errors} von {total} {total === 1 ? 'Datei' : 'Dateien'} verarbeitet</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!allDone && onAutoApproveChange && (
              <button
                onClick={() => onAutoApproveChange(!autoApprove)}
                className={`flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
                  autoApprove
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-3 hover:text-text-2 hover:bg-surface-2'
                }`}
                title={autoApprove ? 'Auto-Import aktiv' : 'Auto-Import aktivieren'}
              >
                <Zap size={12} />
                Auto
              </button>
            )}
            {allDone && (
              <button
                onClick={onClear}
                className="text-[12px] text-text-3 hover:text-text-2 flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw size={12} />
                Zurücksetzen
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              allDone && errors === 0 ? 'bg-accent' : allDone ? 'bg-exp-amber' : 'bg-accent'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Summary when all done */}
        {allDone && (
          <div className="text-[12px] text-text-3 mt-2">
            {totalImported} Transaktionen importiert · {totalSkipped} übersprungen
            {errors > 0 && <span className="text-exp-red"> · {errors} {errors === 1 ? 'Fehler' : 'Fehler'}</span>}
          </div>
        )}
      </div>

      {/* File list */}
      <div className="divide-y divide-border">
        {files.map((file, index) => (
          <FileCard
            key={file.id}
            file={file}
            index={index}
            onSelectTemplate={onSelectTemplate}
            onConfirmPreview={onConfirmPreview}
            onDiscardPreview={onDiscardPreview}
            onAiConsent={onAiConsent}
            onAiConsentDismiss={onAiConsentDismiss}
            autoApprove={autoApprove}
          />
        ))}
      </div>
    </div>
  );
}

function FileCard({
  file,
  index,
  onSelectTemplate,
  onConfirmPreview,
  onDiscardPreview,
  onAiConsent,
  onAiConsentDismiss,
  autoApprove,
}: {
  file: FileImportState;
  index: number;
  onSelectTemplate?: (fileId: string, templateId: string) => void;
  onConfirmPreview?: (fileId: string, bankName?: string) => void;
  onDiscardPreview?: (fileId: string) => void;
  onAiConsent?: (fileId: string, remember: boolean) => void;
  onAiConsentDismiss?: (fileId: string) => void;
  autoApprove?: boolean;
}) {
  const autoApprovedRef = useRef(false);

  // Auto-approve: when preview arrives and autoApprove is on, confirm immediately
  useEffect(() => {
    if (autoApprove && file.status === 'preview' && file.preview && !autoApprovedRef.current) {
      autoApprovedRef.current = true;
      onConfirmPreview?.(file.id);
    }
  }, [autoApprove, file.status, file.preview, file.id, onConfirmPreview]);

  return (
    <div
      className="px-6 py-3.5 animate-fade-slide-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {file.status === 'queued' && (
            <div className="w-3 h-3 rounded-full border-2 border-border-2" />
          )}
          {(file.status === 'uploading' || file.status === 'processing') && (
            <Loader2 size={18} className="text-accent animate-spin" />
          )}
          {file.status === 'done' && (
            <CheckCircle2 size={18} className="text-accent" />
          )}
          {file.status === 'error' && (
            <XCircle size={18} className="text-exp-red" />
          )}
          {file.status === 'conflict' && (
            <AlertTriangle size={18} className="text-exp-amber" />
          )}
          {file.status === 'preview' && (
            <Eye size={18} className="text-exp-blue" />
          )}
          {file.status === 'ai-consent' && (
            <Brain size={18} className="text-exp-amber" />
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[13px] font-medium truncate ${
              file.status === 'queued' ? 'text-text-3' : 'text-text'
            }`}>
              {file.file.name}
            </span>
            {(file.result?.bank || file.preview?.bank) && (
              <BankLogo bank={(file.result?.bank || file.preview?.bank)!} size={20} />
            )}
          </div>
          <div className="text-[11px] text-text-3 mt-0.5">
            {file.status === 'queued' && 'Warte...'}
            {file.status === 'uploading' && (
              file.file.name.toLowerCase().endsWith('.pdf') ? 'KI-Analyse läuft...' : 'Wird analysiert...'
            )}
            {file.status === 'processing' && file.progress && (
              <>Verarbeite {file.progress.processed}/{file.progress.total} Transaktionen...</>
            )}
            {file.status === 'processing' && !file.progress && 'Verarbeite...'}
            {file.status === 'done' && file.result && (
              <>{file.result.imported} importiert · {file.result.skipped} übersprungen · {file.result.total} gesamt</>
            )}
            {file.status === 'error' && (
              <span className="text-exp-red">{file.error}</span>
            )}
            {file.status === 'conflict' && (
              <span className="text-exp-amber">Mehrere Templates erkannt:</span>
            )}
            {file.status === 'ai-consent' && (
              <span className="text-exp-amber">KI-Analyse erforderlich — Zustimmung benötigt</span>
            )}
            {file.status === 'preview' && file.preview && (
              <span className="text-exp-blue">
                {file.preview.total} Transaktionen erkannt{file.preview.aiGenerated ? ' (KI)' : ''} — Vorschau prüfen
              </span>
            )}
          </div>
        </div>

        {/* File size */}
        <div className="flex-shrink-0 text-[11px] text-text-3">
          {formatFileSize(file.file.size)}
        </div>
      </div>

      {/* Saldo warning for completed PDF imports */}
      {file.status === 'done' && file.result?.saldoWarning && (
        <div className="ml-8 mt-2 flex items-start gap-2 text-[12px] text-exp-amber bg-exp-amber/8 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{file.result.saldoWarning}</span>
        </div>
      )}

      {/* PDF Preview panel */}
      {file.status === 'preview' && file.preview && (
        <PreviewPanel
          preview={file.preview}
          pdfFile={file.file}
          onConfirm={(bankName) => onConfirmPreview?.(file.id, bankName)}
          onDiscard={() => onDiscardPreview?.(file.id)}
        />
      )}

      {/* Processing progress bar */}
      {file.status === 'processing' && file.progress && file.progress.total > 0 && (
        <div className="ml-8 mt-2">
          <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${(file.progress.processed / file.progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Template picker for conflicts */}
      {file.status === 'conflict' && file.matchingTemplates && (
        <div className="ml-8 mt-2 flex flex-wrap gap-2">
          {file.matchingTemplates.map(t => (
            <button
              key={t.id}
              onClick={() => onSelectTemplate?.(file.id, t.id)}
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border-2 bg-surface-2 text-text-2 hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* AI consent dialog */}
      {file.status === 'ai-consent' && <AiConsentPanel file={file} onConsent={onAiConsent} onDismiss={onAiConsentDismiss} />}
    </div>
  );
}

// ── AI Consent Panel ─────────────────────────────────────────────────

function AiConsentPanel({
  file,
  onConsent,
  onDismiss,
}: {
  file: FileImportState;
  onConsent?: (fileId: string, remember: boolean) => void;
  onDismiss?: (fileId: string) => void;
}) {
  const [remember, setRemember] = useState(true);
  const isPdf = file.aiConsentReason === 'pdf';

  return (
    <div className="ml-8 mt-2 border border-exp-amber/30 rounded-xl bg-exp-amber/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <Brain size={18} className="text-exp-amber flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-text-2 leading-relaxed">
          {isPdf ? (
            <>Für den Import dieser PDF-Datei wird der <span className="font-medium text-text">gesamte Inhalt</span> an einen KI-Dienst (OpenRouter) gesendet, um die Transaktionen zu extrahieren.</>
          ) : (
            <>Für diese CSV-Datei wurde kein passendes Template gefunden. Zur automatischen Erkennung werden die <span className="font-medium text-text">ersten Zeilen</span> an einen KI-Dienst (OpenRouter) gesendet.</>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="rounded border-border-2 text-accent focus:ring-accent/30"
        />
        <span className="text-[12px] text-text-3">Nicht erneut fragen</span>
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onDismiss?.(file.id)}
          className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border-2 text-text-3 hover:text-text-2 hover:bg-surface-2 transition-colors"
        >
          Abbrechen
        </button>
        <button
          onClick={() => onConsent?.(file.id, remember)}
          className="text-[12px] font-medium px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          KI-Analyse erlauben
        </button>
      </div>
    </div>
  );
}

// ── Preview Panel (side-by-side: PDF viewer + transactions) ──────

function PreviewPanel({
  preview,
  pdfFile,
  onConfirm,
  onDiscard,
}: {
  preview: ImportPreviewResponse;
  pdfFile: File;
  onConfirm: (bankName?: string) => void;
  onDiscard: () => void;
}) {
  const isPdf = pdfFile.name.toLowerCase().endsWith('.pdf');
  // #toolbar=0&navpanes=0 hides the browser PDF viewer's toolbar and sidebar
  const pdfUrl = `/api/import/preview/${preview.previewId}/pdf#toolbar=0&navpanes=0`;
  const [showPdf, setShowPdf] = useState(true);
  const [editingBank, setEditingBank] = useState(false);
  const [bankName, setBankName] = useState(preview.bank);

  const totalCredit = preview.transactions
    .filter(tx => tx.direction === 'credit')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalDebit = preview.transactions
    .filter(tx => tx.direction === 'debit')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const netAmount = totalCredit - totalDebit;

  const dates = preview.transactions
    .map(tx => tx.bu_date)
    .filter(Boolean)
    .sort();
  const dateRange = dates.length > 0
    ? `${new Date(dates[0]!).toLocaleDateString('de-DE')} – ${new Date(dates[dates.length - 1]!).toLocaleDateString('de-DE')}`
    : '–';

  return (
    <div className="mt-3 border border-border rounded-xl overflow-hidden bg-surface">
      {/* Side-by-side layout: PDF (1/3) + Transactions (2/3) on large screens */}
      <div className={isPdf && showPdf ? 'grid grid-cols-1 lg:grid-cols-[1fr_2fr]' : ''}>
        {/* PDF viewer — collapsible, hidden by default on small screens */}
        {isPdf && showPdf && (
          <div className="border-b lg:border-b-0 lg:border-r border-border bg-surface-2/30">
            <iframe
              src={pdfUrl}
              className="w-full h-[400px] lg:h-full lg:min-h-[500px]"
              title="PDF Vorschau"
            />
          </div>
        )}

        {/* Transaction preview */}
        <div className="flex flex-col min-h-0">
          {/* PDF toggle + account info bar */}
          {isPdf && (
            <button
              onClick={() => setShowPdf(!showPdf)}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12px] font-medium bg-exp-blue/8 text-exp-blue hover:bg-exp-blue/12 border-b border-border transition-colors cursor-pointer"
            >
              <FileText size={14} />
              <span>{showPdf ? 'PDF-Original ausblenden' : 'PDF-Original anzeigen'}</span>
              {showPdf ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}

          {/* Summary stats */}
          <div className="px-4 py-3 bg-surface-2/50 border-b border-border flex-shrink-0">
            {/* Bank name — always shown, editable */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2.5 text-[11px] text-text-3">
              {editingBank ? (
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingBank(false); if (e.key === 'Escape') { setBankName(preview.bank); setEditingBank(false); } }}
                    className="text-[12px] font-medium bg-surface border border-border rounded px-2 py-0.5 outline-none focus:border-accent text-text w-48"
                    autoFocus
                  />
                  <button onClick={() => setEditingBank(false)} className="p-0.5 text-accent hover:text-accent/80"><Check size={13} /></button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <BankLogo bank={bankName} size={18} />
                  <span className="text-text-2 font-medium">{bankName}</span>
                  <button onClick={() => setEditingBank(true)} className="p-0.5 text-text-3 hover:text-accent transition-colors" title="Bank umbenennen">
                    <Pencil size={11} />
                  </button>
                  {preview.aiGenerated && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">KI</span>}
                </span>
              )}
              {preview.accountInfo?.iban && <span>IBAN: {preview.accountInfo.iban}</span>}
              {preview.accountInfo?.accountNumber && !preview.accountInfo?.iban && (
                <span>Konto: {preview.accountInfo.accountNumber}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-text-3 mb-0.5">Zeitraum</div>
                <div className="text-text font-medium">{dateRange}</div>
              </div>
              <div>
                <div className="text-text-3 mb-0.5">Eingänge</div>
                <div className="text-accent font-medium">+{formatAmount(totalCredit)} €</div>
              </div>
              <div>
                <div className="text-text-3 mb-0.5">Ausgänge</div>
                <div className="text-exp-red font-medium">{formatAmount(totalDebit)} €</div>
              </div>
              <div>
                <div className="text-text-3 mb-0.5">Saldo</div>
                <div className={`font-medium ${netAmount >= 0 ? 'text-accent' : 'text-exp-red'}`}>
                  {netAmount >= 0 ? '+' : ''}{formatAmount(netAmount)} €
                </div>
              </div>
            </div>
            {preview.duplicateCount > 0 && (
              <div className="mt-2 text-[11px] text-text-3">
                {preview.newCount} neue · {preview.duplicateCount} Duplikate (übersprungen)
              </div>
            )}
          </div>

          {/* Saldo warning */}
          {preview.saldoWarning && (
            <div className="px-4 py-2.5 flex items-start gap-2 text-[12px] text-exp-amber bg-exp-amber/6 border-b border-border flex-shrink-0">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Saldo-Prüfung fehlgeschlagen</div>
                <div className="mt-0.5 text-exp-amber/80">{preview.saldoWarning}</div>
              </div>
            </div>
          )}

          {/* Transaction table — scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: showPdf ? '340px' : '350px' }}>
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="text-text-3 text-left">
                  <th className="px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 font-medium">Empfänger</th>
                  <th className="px-3 py-2 font-medium">Beschreibung</th>
                  <th className="px-3 py-2 font-medium text-right">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {preview.transactions.map((tx, i) => (
                  <tr
                    key={i}
                    className={`transition-colors ${
                      tx.isDuplicate ? 'opacity-40 line-through' : 'hover:bg-surface-2/50'
                    }`}
                  >
                    <td className="px-3 py-1.5 text-text-3 whitespace-nowrap">
                      {tx.bu_date ? new Date(tx.bu_date).toLocaleDateString('de-DE') : '–'}
                    </td>
                    <td className="px-3 py-1.5 text-text font-medium truncate max-w-[140px]">
                      {tx.counterparty || '–'}
                    </td>
                    <td className="px-3 py-1.5 text-text-3 truncate max-w-[160px]" title={tx.description}>
                      {tx.description || tx.purpose || '–'}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-medium whitespace-nowrap ${
                      tx.direction === 'credit' ? 'text-accent' : 'text-exp-red'
                    }`}>
                      {tx.direction === 'credit' ? '+' : ''}{formatAmount(tx.amount)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-surface-2/30 flex-shrink-0">
            <button
              onClick={onDiscard}
              className="text-[12px] font-medium px-4 py-2 rounded-lg border border-border-2 text-text-3 hover:text-text-2 hover:bg-surface-2 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={() => onConfirm(bankName !== preview.bank ? bankName : undefined)}
              className="text-[12px] font-medium px-5 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              {preview.newCount} Transaktionen importieren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
