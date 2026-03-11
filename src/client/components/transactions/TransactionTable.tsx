import { fmtDate, fmt } from '../../lib/format';
import { CategoryTag } from './CategoryTag';
import type { Transaction } from '../../api/hooks';

interface TransactionTableProps {
  transactions: Transaction[];
}

export function TransactionTable({ transactions }: TransactionTableProps) {
  if (!transactions.length) {
    return (
      <div className="text-center py-16 text-text-3">
        <div className="text-3xl mb-3 opacity-40">&#9675;</div>
        <div className="text-[14px]">Keine Transaktionen gefunden</div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <table className="w-full border-collapse hidden md:table">
        <thead>
          <tr>
            <th className="text-left text-[11px] uppercase tracking-wider text-text-3 font-semibold px-4 py-3 border-b border-border whitespace-nowrap">
              Datum
            </th>
            <th className="text-left text-[11px] uppercase tracking-wider text-text-3 font-semibold px-4 py-3 border-b border-border whitespace-nowrap">
              Typ
            </th>
            <th className="text-left text-[11px] uppercase tracking-wider text-text-3 font-semibold px-4 py-3 border-b border-border whitespace-nowrap">
              Gegenkonto / Beschreibung
            </th>
            <th className="text-left text-[11px] uppercase tracking-wider text-text-3 font-semibold px-4 py-3 border-b border-border whitespace-nowrap">
              Kategorie
            </th>
            <th className="text-right text-[11px] uppercase tracking-wider text-text-3 font-semibold px-4 py-3 border-b border-border whitespace-nowrap">
              Betrag
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-surface-2/50 transition-colors">
              <td className="px-4 py-3 border-b border-border/60 text-[13px] text-text-2 whitespace-nowrap">
                {fmtDate(tx.bu_date)}
              </td>
              <td className="px-4 py-3 border-b border-border/60 text-[13px]">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] tracking-wide font-medium ${
                    tx.direction === 'credit'
                      ? 'bg-accent/8 text-accent'
                      : 'bg-exp-red/8 text-exp-red'
                  }`}
                >
                  {tx.type}
                </span>
              </td>
              <td className="px-4 py-3 border-b border-border/60 text-[13px]">
                <div className="font-medium text-text">{tx.counterparty || '\u2014'}</div>
                {tx.counterparty_iban && (
                  <div className="text-[11px] text-text-3 font-mono tracking-wide">{tx.counterparty_iban}</div>
                )}
                <div className="text-[12px] text-text-3 max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {tx.description || ''}
                </div>
              </td>
              <td className="px-4 py-3 border-b border-border/60 text-[13px]">
                <CategoryTag transaction={tx} />
              </td>
              <td
                className={`px-4 py-3 border-b border-border/60 text-[13px] text-right whitespace-nowrap font-semibold ${
                  tx.direction === 'credit' ? 'text-accent' : 'text-exp-red'
                }`}
              >
                {tx.direction === 'credit' ? '+' : '\u2212'} {fmt(tx.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-border/60">
        {transactions.map((tx) => (
          <div key={tx.id} className="px-4 py-3">
            {/* Row 1: Counterparty + Amount */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-text truncate">
                  {tx.counterparty || '\u2014'}
                </div>
              </div>
              <span
                className={`text-[14px] font-semibold whitespace-nowrap shrink-0 ${
                  tx.direction === 'credit' ? 'text-accent' : 'text-exp-red'
                }`}
              >
                {tx.direction === 'credit' ? '+' : '\u2212'} {fmt(tx.amount)}
              </span>
            </div>
            {/* Row 2: Description (if present) */}
            {tx.description && (
              <div className="text-[12px] text-text-3 truncate mt-0.5">
                {tx.description}
              </div>
            )}
            {/* Row 3: Date + Type + Category */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[11px] text-text-3">{fmtDate(tx.bu_date)}</span>
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-[10px] tracking-wide font-medium ${
                  tx.direction === 'credit'
                    ? 'bg-accent/8 text-accent'
                    : 'bg-exp-red/8 text-exp-red'
                }`}
              >
                {tx.type}
              </span>
              <CategoryTag transaction={tx} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
