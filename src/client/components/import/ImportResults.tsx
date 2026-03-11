import { CheckCircle2 } from 'lucide-react';
import type { ImportResult } from '../../api/hooks';
import { BankLogo } from '../BankLogo';

interface ImportResultsProps {
  results: ImportResult[] | null;
}

export function ImportResults({ results }: ImportResultsProps) {
  if (!results) return null;

  return (
    <div className="flex flex-col gap-2.5 mt-4">
      {results.map((res) => (
        <div
          key={res.filename}
          className="px-5 py-4 bg-surface border border-border rounded-xl shadow-card flex justify-between items-center border-l-[3px] border-l-accent"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[14px] text-text">{res.filename}</span>
              {res.bank && (
                <BankLogo bank={res.bank} size={20} />
              )}
            </div>
            <div className="text-[12px] text-text-3 mt-0.5">
              {res.imported} importiert
              {res.duplicates > 0 && ` · ${res.duplicates} Duplikate übersprungen`}
              {' '}· {res.total} gesamt
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-accent text-[12px] font-medium">
            <CheckCircle2 size={15} />
            Fertig
          </div>
        </div>
      ))}
    </div>
  );
}
