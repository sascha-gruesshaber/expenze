import { Loader2, Sparkles } from 'lucide-react';
import { useBatchContext } from '../../lib/batchContext';

export function BatchFloatingIndicator() {
  const { progress, dialogMode, openDialog } = useBatchContext();

  if (dialogMode !== 'minimized') return null;

  const isLoading = progress.status === 'loading';
  const pct = progress.totalGroups > 0
    ? Math.round((progress.completed / progress.totalGroups) * 100)
    : 0;

  return (
    <button
      onClick={openDialog}
      className="fixed bottom-16 right-6 z-40 flex items-center gap-3 px-4 py-3 bg-surface rounded-xl border border-border shadow-card-hover hover:border-accent/40 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer group"
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin text-accent shrink-0" />
      ) : (
        <Sparkles size={16} className="text-accent shrink-0" />
      )}

      <div className="flex flex-col items-start gap-1">
        <span className="text-[12px] font-medium text-text">
          {isLoading
            ? `Analysiere... ${progress.completed}/${progress.totalGroups}`
            : `${progress.suggestions.length} Gruppen analysiert`
          }
        </span>
        {isLoading && (
          <div className="w-32 h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <span className="text-[11px] text-text-3 group-hover:text-accent transition-colors ml-1">
        Öffnen
      </span>
    </button>
  );
}
