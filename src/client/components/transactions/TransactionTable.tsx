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
    <table className="w-full border-collapse">
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
  );
}
