import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useAccounts, useUpdateAccount } from '../api/hooks';
import type { Account } from '../api/hooks';
import { Landmark } from 'lucide-react';

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
});

const TYPE_LABELS: Record<string, string> = {
  checking: 'Girokonto',
  savings: 'Sparkonto',
  investment: 'Depot',
};

const TYPE_OPTIONS = ['checking', 'savings', 'investment'];

function AccountCard({ account }: { account: Account }) {
  const updateAccount = useUpdateAccount();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(account.name);

  const handleNameSave = () => {
    if (name.trim() && name !== account.name) {
      updateAccount.mutate({ id: account.id, name: name.trim() });
    }
    setEditingName(false);
  };

  const handleTypeChange = (newType: string) => {
    updateAccount.mutate({ id: account.id, account_type: newType });
  };

  return (
    <div className="bg-surface rounded-2xl shadow-card p-6 border border-border hover:shadow-card-hover transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/8 flex items-center justify-center">
            <Landmark size={20} className="text-accent" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-text-3 uppercase tracking-wide">
              {account.bank}
            </div>
            {editingName ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                className="font-heading font-semibold text-[15px] text-text bg-transparent border-b border-accent outline-none"
              />
            ) : (
              <div
                className="font-heading font-semibold text-[15px] text-text cursor-pointer hover:text-accent transition-colors"
                onClick={() => setEditingName(true)}
              >
                {account.name}
              </div>
            )}
          </div>
        </div>
        <select
          value={account.account_type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="text-[12px] font-medium px-2.5 py-1 rounded-lg bg-surface-2 border border-border text-text-2 outline-none focus:border-accent cursor-pointer"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2 text-[13px]">
        {account.iban && (
          <div className="flex justify-between">
            <span className="text-text-3">IBAN</span>
            <span className="text-text font-mono text-[12px]">{account.iban}</span>
          </div>
        )}
        {account.account_number && (
          <div className="flex justify-between">
            <span className="text-text-3">Kontonummer</span>
            <span className="text-text font-mono text-[12px]">{account.account_number}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-text-3">Buchungen</span>
          <span className="text-text font-medium">{account.transaction_count}</span>
        </div>
      </div>
    </div>
  );
}

function AccountsPage() {
  const { data: accounts = [] } = useAccounts();

  return (
    <div>
      {accounts.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-card p-12 text-center">
          <Landmark size={40} className="text-text-3 mx-auto mb-3" />
          <div className="font-heading font-semibold text-[15px] text-text mb-1">Keine Konten</div>
          <div className="text-[13px] text-text-3">Konten werden automatisch beim Import erstellt.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
