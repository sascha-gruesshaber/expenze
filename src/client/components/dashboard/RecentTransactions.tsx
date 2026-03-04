import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { fmt, fmtDate } from '../../lib/format';
import type { Transaction } from '../../api/hooks';

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  if (!transactions.length) {
    return <div className="text-text-3 text-sm text-center py-10">Keine Transaktionen</div>;
  }

  return (
    <div className="flex flex-col">
      {transactions.slice(0, 8).map((tx) => {
        const isCredit = tx.direction === 'credit';
        return (
          <div
            key={tx.id}
            className="flex items-center gap-3 py-3 border-b border-border/60 last:border-0"
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isCredit ? 'bg-accent/8 text-accent' : 'bg-exp-red/8 text-exp-red'
              }`}
            >
              {isCredit ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-text font-medium truncate">
                {tx.counterparty || tx.description || 'Unbekannt'}
              </div>
              <div className="text-[11px] text-text-3 flex items-center gap-1.5">
                <span>{fmtDate(tx.bu_date)}</span>
                {tx.category && (
                  <>
                    <span className="text-border-2">·</span>
                    <span>{tx.category}</span>
                  </>
                )}
              </div>
            </div>
            <div
              className={`text-[13px] font-semibold ${
                isCredit ? 'text-accent' : 'text-exp-red'
              }`}
            >
              {isCredit ? '+' : '-'}{fmt(Math.abs(tx.amount || 0))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
