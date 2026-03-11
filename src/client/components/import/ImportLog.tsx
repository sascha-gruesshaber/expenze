import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import type { ImportLogEntry } from '../../api/hooks';
import { useImportTransactions, useDeleteImport, type ImportTransaction } from '../../api/hooks';

interface ImportLogProps {
  imports: ImportLogEntry[];
}

export function ImportLog({ imports }: ImportLogProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!imports.length) {
    return <div className="text-text-3 text-[13px]">Noch keine Importe</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {imports.map((l) => (
        <ImportLogRow
          key={l.id}
          entry={l}
          isExpanded={expandedId === l.id}
          onToggle={() => setExpandedId(expandedId === l.id ? null : l.id)}
        />
      ))}
    </div>
  );
}

function ImportLogRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: ImportLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { data, isLoading } = useImportTransactions(isExpanded ? entry.id : null);
  const deleteImport = useDeleteImport();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-surface-2 rounded-xl overflow-hidden">
      {confirmDelete ? (
        <div className="flex items-center gap-3 px-4 py-3 text-[13px] bg-exp-red/6">
          <span className="text-exp-red font-medium flex-1">
            Import und {entry.records_imported} Transaktionen löschen?
          </span>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border-2 text-text-3 hover:text-text-2 hover:bg-surface-2 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              deleteImport.mutate(entry.id);
              setConfirmDelete(false);
            }}
            disabled={deleteImport.isPending}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-exp-red text-white hover:bg-exp-red/90 transition-colors disabled:opacity-50"
          >
            {deleteImport.isPending ? 'Lösche...' : 'Löschen'}
          </button>
        </div>
      ) : (
        <div className="flex items-center">
          <button
            onClick={onToggle}
            className="flex-1 grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-3 text-[13px] hover:bg-surface-3/50 transition-colors text-left cursor-pointer"
          >
            <div className="flex-shrink-0 text-text-3">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            <div className="text-text font-medium truncate">{entry.filename}</div>
            <div className="text-text-3 text-[12px] flex-shrink-0">
              {new Date(entry.imported_at).toLocaleString('de-DE')}
            </div>
            <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-medium bg-accent/8 text-accent flex-shrink-0">
              +{entry.records_imported}
            </span>
            <span className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-medium bg-exp-blue/8 text-exp-blue flex-shrink-0">
              ~{entry.records_skipped} skip
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="flex-shrink-0 p-2.5 mr-2 text-text-3 hover:text-exp-red transition-colors rounded-lg hover:bg-exp-red/8"
            title="Import löschen"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {isExpanded && !confirmDelete && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-text-3 text-[13px]">
              <Loader2 size={16} className="animate-spin" />
              Lade Transaktionen...
            </div>
          ) : data && data.transactions.length > 0 ? (
            <ImportTransactionTable transactions={data.transactions} />
          ) : (
            <div className="py-6 text-center text-text-3 text-[13px]">
              Keine Transaktionen gefunden
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImportTransactionTable({ transactions }: { transactions: ImportTransaction[] }) {
  const totalCredit = transactions.filter(tx => tx.direction === 'credit').reduce((sum, tx) => sum + tx.amount, 0);
  const totalDebit = transactions.filter(tx => tx.direction === 'debit').reduce((sum, tx) => sum + tx.amount, 0);
  const totalAmount = totalCredit - totalDebit;
  const creditCount = transactions.filter(tx => tx.direction === 'credit').length;
  const debitCount = transactions.filter(tx => tx.direction === 'debit').length;

  return (
    <div>
      {/* Summary bar */}
      <div className="px-4 py-2.5 bg-surface-3/30 flex items-center gap-4 text-[11px] text-text-3">
        <span>{transactions.length} Transaktionen</span>
        <span className="text-accent">+{creditCount} Eingänge</span>
        <span className="text-exp-red">-{debitCount} Ausgänge</span>
        <span className="ml-auto font-medium text-text-2">
          Saldo: <span className={totalAmount >= 0 ? 'text-accent' : 'text-exp-red'}>
            {totalAmount >= 0 ? '+' : ''}{totalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
        </span>
      </div>

      {/* Transaction rows */}
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-surface-2">
            <tr className="text-text-3 text-left">
              <th className="px-4 py-2 font-medium">Datum</th>
              <th className="px-4 py-2 font-medium">Empfänger</th>
              <th className="px-4 py-2 font-medium">Beschreibung</th>
              <th className="px-4 py-2 font-medium">Kategorie</th>
              <th className="px-4 py-2 font-medium text-right">Betrag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-surface-3/30 transition-colors">
                <td className="px-4 py-2 text-text-3 whitespace-nowrap">
                  {tx.bu_date ? new Date(tx.bu_date).toLocaleDateString('de-DE') : '–'}
                </td>
                <td className="px-4 py-2 text-text font-medium truncate max-w-[200px]">
                  {tx.counterparty || '–'}
                </td>
                <td className="px-4 py-2 text-text-3 truncate max-w-[250px]" title={tx.description}>
                  {tx.description || tx.purpose || '–'}
                </td>
                <td className="px-4 py-2">
                  <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-3 text-text-2">
                    {tx.category}
                  </span>
                </td>
                <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${
                  tx.direction === 'credit' ? 'text-accent' : 'text-exp-red'
                }`}>
                  {tx.direction === 'credit' ? '+' : ''}{tx.amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
