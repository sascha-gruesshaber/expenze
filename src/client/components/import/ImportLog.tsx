import type { ImportLogEntry } from '../../api/hooks';

interface ImportLogProps {
  imports: ImportLogEntry[];
}

export function ImportLog({ imports }: ImportLogProps) {
  if (!imports.length) {
    return <div className="text-text-3 text-[13px]">Noch keine Importe</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {imports.map((l) => (
        <div
          key={l.id}
          className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 bg-surface-2 rounded-xl text-[13px]"
        >
          <div className="text-text font-medium">{l.filename}</div>
          <div className="text-text-3 text-[12px]">
            {new Date(l.imported_at).toLocaleString('de-DE')}
          </div>
          <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-medium bg-accent/8 text-accent">
            +{l.records_imported}
          </span>
          <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-medium bg-exp-blue/8 text-exp-blue">
            ~{l.records_skipped} skip
          </span>
        </div>
      ))}
    </div>
  );
}
