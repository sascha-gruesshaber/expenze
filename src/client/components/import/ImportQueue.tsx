import { CheckCircle2, XCircle, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';

export type FileStatus = 'queued' | 'uploading' | 'done' | 'error' | 'conflict';

export interface FileImportState {
  id: string;
  file: File;
  status: FileStatus;
  result?: { filename: string; imported: number; skipped: number; total: number; bank: string };
  error?: string;
  matchingTemplates?: { id: string; name: string }[];
}

interface ImportQueueProps {
  files: FileImportState[];
  onClear: () => void;
  onSelectTemplate?: (fileId: string, templateId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportQueue({ files, onClear, onSelectTemplate }: ImportQueueProps) {
  const done = files.filter(f => f.status === 'done').length;
  const errors = files.filter(f => f.status === 'error').length;
  const conflicts = files.filter(f => f.status === 'conflict').length;
  const total = files.length;
  const allDone = done + errors === total && conflicts === 0;
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
            ) : (
              <span>{done + errors} von {total} {total === 1 ? 'Datei' : 'Dateien'} verarbeitet</span>
            )}
          </div>
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
          <FileCard key={file.id} file={file} index={index} onSelectTemplate={onSelectTemplate} />
        ))}
      </div>
    </div>
  );
}

function FileCard({ file, index, onSelectTemplate }: { file: FileImportState; index: number; onSelectTemplate?: (fileId: string, templateId: string) => void }) {
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
          {file.status === 'uploading' && (
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
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[13px] font-medium truncate ${
              file.status === 'queued' ? 'text-text-3' : 'text-text'
            }`}>
              {file.file.name}
            </span>
            {file.result?.bank && (
              <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                {file.result.bank}
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-3 mt-0.5">
            {file.status === 'queued' && 'Warte...'}
            {file.status === 'uploading' && 'Verarbeite...'}
            {file.status === 'done' && file.result && (
              <>{file.result.imported} importiert · {file.result.skipped} übersprungen · {file.result.total} gesamt</>
            )}
            {file.status === 'error' && (
              <span className="text-exp-red">{file.error}</span>
            )}
            {file.status === 'conflict' && (
              <span className="text-exp-amber">Mehrere Templates erkannt:</span>
            )}
          </div>
        </div>

        {/* File size */}
        <div className="flex-shrink-0 text-[11px] text-text-3">
          {formatFileSize(file.file.size)}
        </div>
      </div>

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
    </div>
  );
}
