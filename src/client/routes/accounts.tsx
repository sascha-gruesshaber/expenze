import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useAccounts, useUpdateAccount, useDeleteAccount } from '../api/hooks';
import type { Account } from '../api/hooks';
import { Landmark, Trash2, EyeOff, Eye } from 'lucide-react';

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
  const deleteAccount = useDeleteAccount();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(account.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleNameSave = () => {
    if (name.trim() && name !== account.name) {
      updateAccount.mutate({ id: account.id, name: name.trim() });
    }
    setEditingName(false);
  };

  const handleTypeChange = (newType: string) => {
    updateAccount.mutate({ id: account.id, account_type: newType });
  };

  const handleToggleActive = () => {
    updateAccount.mutate({ id: account.id, is_active: !account.is_active });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteAccount.mutate(account.id);
  };

  return (
    <div className={`bg-surface rounded-2xl shadow-card p-6 border border-border transition-shadow ${account.is_active ? 'hover:shadow-card-hover' : 'opacity-60'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${account.is_active ? 'bg-accent/8' : 'bg-surface-2'}`}>
            <Landmark size={20} className={account.is_active ? 'text-accent' : 'text-text-3'} />
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
        <div className="flex items-center gap-2">
          <select
            value={account.account_type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="text-[12px] font-medium px-2.5 py-1 rounded-lg bg-surface-2 border border-border text-text-2 outline-none focus:border-accent cursor-pointer"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <button
            onClick={handleToggleActive}
            className={`p-1.5 rounded-lg transition-colors ${
              account.is_active
                ? 'text-text-3 hover:text-amber-500 hover:bg-amber-500/10'
                : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
            }`}
            title={account.is_active ? 'Konto ausblenden' : 'Konto einblenden'}
          >
            {account.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            className={`p-1.5 rounded-lg transition-colors ${
              confirmDelete
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'text-text-3 hover:text-red-500 hover:bg-red-500/10'
            }`}
            title={confirmDelete ? 'Nochmal klicken zum Löschen' : 'Konto löschen'}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
          Konto und {account.transaction_count} Buchungen löschen? Nochmal klicken zum Bestätigen.
        </div>
      )}
      {!account.is_active && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-600 dark:text-amber-400">
          Ausgeblendet — Buchungen werden in Auswertungen nicht berücksichtigt.
        </div>
      )}
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

  const active = accounts.filter((a) => a.is_active !== false);
  const inactive = accounts.filter((a) => a.is_active === false);

  return (
    <div>
      {accounts.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-card p-12 text-center">
          <Landmark size={40} className="text-text-3 mx-auto mb-3" />
          <div className="font-heading font-semibold text-[15px] text-text mb-1">Keine Konten</div>
          <div className="text-[13px] text-text-3">Konten werden automatisch beim Import erstellt.</div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {active.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>

          {inactive.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">
                Ausgeblendete Konten
              </div>
              <div className="grid grid-cols-2 gap-4">
                {inactive.map((account) => (
                  <AccountCard key={account.id} account={account} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
