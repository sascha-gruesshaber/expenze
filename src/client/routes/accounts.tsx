import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import {
  useAccounts, useUpdateAccount, useDeleteAccount,
  useAccountGroups, useCreateAccountGroup, useUpdateAccountGroup,
  useDeleteAccountGroup, useAddAccountsToGroup, useRemoveAccountFromGroup,
} from '../api/hooks';
import type { Account, AccountGroup, AccountGroupMember } from '../api/hooks';
import { Landmark, Trash2, EyeOff, Eye, Plus, X, FolderPlus, Pencil } from 'lucide-react';
import { BankLogo } from '../components/BankLogo';

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
});

const TYPE_LABELS: Record<string, string> = {
  checking: 'Girokonto',
  savings: 'Sparkonto',
  investment: 'Depot',
};

const TYPE_OPTIONS = ['checking', 'savings', 'investment'];

/* ─── Shared Dialog Backdrop ───────────────────────────────────────── */

function DialogBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        className="bg-surface rounded-2xl shadow-xl border border-border w-full max-w-md mx-4 animate-dropdown"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Field Components ─────────────────────────────────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5">{children}</label>;
}

function FieldInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-[13px] text-text outline-none focus:border-accent transition-colors"
    />
  );
}

function FieldSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-[13px] text-text outline-none focus:border-accent cursor-pointer transition-colors"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ─── Account Edit Dialog ──────────────────────────────────────────── */

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'GBP', label: 'GBP — Britisches Pfund' },
  { value: 'CHF', label: 'CHF — Schweizer Franken' },
  { value: 'PLN', label: 'PLN — Polnischer Zloty' },
  { value: 'CZK', label: 'CZK — Tschechische Krone' },
  { value: 'DKK', label: 'DKK — Dänische Krone' },
  { value: 'SEK', label: 'SEK — Schwedische Krone' },
  { value: 'NOK', label: 'NOK — Norwegische Krone' },
  { value: 'JPY', label: 'JPY — Japanischer Yen' },
];

function AccountEditDialog({ account, groups, onClose }: {
  account: Account;
  groups: AccountGroup[];
  onClose: () => void;
}) {
  const updateAccount = useUpdateAccount();
  const addToGroup = useAddAccountsToGroup();
  const removeFromGroup = useRemoveAccountFromGroup();

  const [name, setName] = useState(account.name);
  const [bank, setBank] = useState(account.bank);
  const [accountType, setAccountType] = useState(account.account_type);
  const [groupId, setGroupId] = useState<string>(account.group_id ? String(account.group_id) : '');
  const [iban, setIban] = useState(account.iban || '');
  const [accountNumber, setAccountNumber] = useState(account.account_number || '');
  const [bic, setBic] = useState(account.bic || '');
  const [holder, setHolder] = useState(account.holder || '');
  const [currency, setCurrency] = useState(account.currency || 'EUR');
  const [notes, setNotes] = useState(account.notes || '');

  const hasChanges =
    name !== account.name ||
    bank !== account.bank ||
    accountType !== account.account_type ||
    groupId !== (account.group_id ? String(account.group_id) : '') ||
    iban !== (account.iban || '') ||
    accountNumber !== (account.account_number || '') ||
    bic !== (account.bic || '') ||
    holder !== (account.holder || '') ||
    currency !== (account.currency || 'EUR') ||
    notes !== (account.notes || '');

  const handleSave = () => {
    const data: any = { id: account.id };
    if (name.trim() && name !== account.name) data.name = name.trim();
    if (bank.trim() && bank !== account.bank) data.bank = bank.trim();
    if (accountType !== account.account_type) data.account_type = accountType;
    if (iban !== (account.iban || '')) data.iban = iban.trim();
    if (accountNumber !== (account.account_number || '')) data.account_number = accountNumber.trim();
    if (bic !== (account.bic || '')) data.bic = bic.trim();
    if (holder !== (account.holder || '')) data.holder = holder.trim();
    if (currency !== (account.currency || 'EUR')) data.currency = currency;
    if (notes !== (account.notes || '')) data.notes = notes.trim();

    if (Object.keys(data).length > 1) {
      updateAccount.mutate(data);
    }

    // Handle group change
    const newGroupId = groupId ? parseInt(groupId) : null;
    const oldGroupId = account.group_id;

    if (newGroupId !== oldGroupId) {
      if (oldGroupId && !newGroupId) {
        removeFromGroup.mutate({ groupId: oldGroupId, accountId: account.id });
      } else if (newGroupId) {
        addToGroup.mutate({ groupId: newGroupId, accountIds: [account.id] });
      }
    }

    onClose();
  };

  return (
    <DialogBackdrop onClose={onClose}>
      <div className="px-6 pt-5 pb-2 flex items-center gap-3 border-b border-border">
        <BankLogo bank={bank || account.bank} size={36} />
        <div>
          <div className="text-[11px] font-medium text-text-3 uppercase tracking-wide">Konto bearbeiten</div>
          <div className="font-heading font-semibold text-[15px] text-text">{account.name}</div>
        </div>
      </div>

      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Core info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Kontoname</FieldLabel>
            <FieldInput value={name} onChange={setName} placeholder="z.B. Girokonto" />
          </div>
          <div>
            <FieldLabel>Bank</FieldLabel>
            <FieldInput value={bank} onChange={setBank} placeholder="z.B. Sparkasse" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Kontotyp</FieldLabel>
            <FieldSelect
              value={accountType}
              onChange={setAccountType}
              options={TYPE_OPTIONS.map(t => ({ value: t, label: TYPE_LABELS[t] }))}
            />
          </div>
          <div>
            <FieldLabel>Kontogruppe</FieldLabel>
            <FieldSelect
              value={groupId}
              onChange={setGroupId}
              options={[
                { value: '', label: 'Keine Gruppe' },
                ...groups.map(g => ({ value: String(g.id), label: g.name })),
              ]}
            />
          </div>
        </div>

        {/* Bank details */}
        <div className="pt-3 border-t border-border">
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-3">Bankverbindung</div>
          <div className="space-y-3">
            <div>
              <FieldLabel>IBAN</FieldLabel>
              <FieldInput value={iban} onChange={setIban} placeholder="DE89 3704 0044 0532 0130 00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>BIC / SWIFT</FieldLabel>
                <FieldInput value={bic} onChange={setBic} placeholder="COBADEFFXXX" />
              </div>
              <div>
                <FieldLabel>Kontonummer</FieldLabel>
                <FieldInput value={accountNumber} onChange={setAccountNumber} placeholder="0532013000" />
              </div>
            </div>
          </div>
        </div>

        {/* Additional info */}
        <div className="pt-3 border-t border-border">
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-3">Weitere Angaben</div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Kontoinhaber</FieldLabel>
                <FieldInput value={holder} onChange={setHolder} placeholder="Max Mustermann" />
              </div>
              <div>
                <FieldLabel>Wahrung</FieldLabel>
                <FieldSelect value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
              </div>
            </div>
            <div>
              <FieldLabel>Notizen</FieldLabel>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Freitext-Notizen zum Konto..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-[13px] text-text outline-none focus:border-accent transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="pt-3 border-t border-border">
          <div className="flex justify-between text-[12px]">
            <span className="text-text-3">Buchungen</span>
            <span className="text-text font-medium">{account.transaction_count}</span>
          </div>
        </div>
      </div>

      <div className="px-6 pb-5 pt-3 flex justify-end gap-2 border-t border-border">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-[13px] font-medium text-text-2 hover:bg-surface-2 transition-colors"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !bank.trim() || !hasChanges}
          className="px-4 py-2 rounded-xl text-[13px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Speichern
        </button>
      </div>
    </DialogBackdrop>
  );
}

/* ─── Group Edit Dialog ────────────────────────────────────────────── */

function GroupEditDialog({ group, onClose }: {
  group: AccountGroup;
  onClose: () => void;
}) {
  const updateGroup = useUpdateAccountGroup();

  const [name, setName] = useState(group.name);
  const [accountType, setAccountType] = useState(group.account_type);

  const hasChanges = name !== group.name || accountType !== group.account_type;

  const handleSave = () => {
    const data: { id: number; name?: string; account_type?: string } = { id: group.id };
    if (name.trim() && name !== group.name) data.name = name.trim();
    if (accountType !== group.account_type) data.account_type = accountType;

    if (Object.keys(data).length > 1) {
      updateGroup.mutate(data);
    }
    onClose();
  };

  return (
    <DialogBackdrop onClose={onClose}>
      <div className="px-6 pt-5 pb-2 flex items-center gap-3 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-accent/8 flex items-center justify-center">
          <FolderPlus size={18} className="text-accent" />
        </div>
        <div>
          <div className="text-[11px] font-medium text-text-3 uppercase tracking-wide">Gruppe bearbeiten</div>
          <div className="font-heading font-semibold text-[15px] text-text">{group.name}</div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <FieldLabel>Gruppenname</FieldLabel>
          <FieldInput value={name} onChange={setName} placeholder="z.B. OLB Konten" />
        </div>
        <div>
          <FieldLabel>Kontotyp</FieldLabel>
          <FieldSelect
            value={accountType}
            onChange={setAccountType}
            options={TYPE_OPTIONS.map(t => ({ value: t, label: TYPE_LABELS[t] }))}
          />
          <div className="text-[11px] text-text-3 mt-1.5">
            Wird auf alle {group.accounts.length} Konten in der Gruppe angewendet.
          </div>
        </div>

        {/* Member overview */}
        {group.accounts.length > 0 && (
          <div className="pt-2 border-t border-border">
            <FieldLabel>Konten in dieser Gruppe</FieldLabel>
            <div className="space-y-1.5 mt-1">
              {group.accounts.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-[12px]">
                  <BankLogo bank={a.bank} size={20} />
                  <span className="text-text">{a.name}</span>
                  <span className="text-text-3 ml-auto">{a.transaction_count} Buch.</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 pb-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-[13px] font-medium text-text-2 hover:bg-surface-2 transition-colors"
        >
          Abbrechen
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || !hasChanges}
          className="px-4 py-2 rounded-xl text-[13px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Speichern
        </button>
      </div>
    </DialogBackdrop>
  );
}

/* ─── Account Card ─────────────────────────────────────────────────── */

function AccountCard({ account, groups }: { account: Account; groups: AccountGroup[] }) {
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  return (
    <>
      <div className={`bg-surface rounded-2xl shadow-card p-6 border border-border transition-shadow ${account.is_active ? 'hover:shadow-card-hover' : 'opacity-60'}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <BankLogo bank={account.bank} />
            <div>
              <div className="text-[11px] font-medium text-text-3 uppercase tracking-wide">
                {account.bank}
              </div>
              <div className="font-heading font-semibold text-[15px] text-text">
                {account.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEdit(true)}
              className="p-1.5 rounded-lg text-text-3 hover:text-accent hover:bg-accent/10 transition-colors"
              title="Konto bearbeiten"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => updateAccount.mutate({ id: account.id, is_active: !account.is_active })}
              className={`p-1.5 rounded-lg transition-colors ${
                account.is_active
                  ? 'text-text-3 hover:text-amber-500 hover:bg-amber-500/10'
                  : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
              }`}
              title={account.is_active ? 'Konto ausblenden' : 'Konto einblenden'}
            >
              {account.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                deleteAccount.mutate(account.id);
              }}
              onBlur={() => setConfirmDelete(false)}
              className={`p-1.5 rounded-lg transition-colors ${
                confirmDelete
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'text-text-3 hover:text-red-500 hover:bg-red-500/10'
              }`}
              title={confirmDelete ? 'Nochmal klicken zum Löschen' : 'Konto löschen'}
            >
              <Trash2 size={14} />
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
          <div className="flex justify-between">
            <span className="text-text-3">Typ</span>
            <span className="text-text font-medium">{TYPE_LABELS[account.account_type] || account.account_type}</span>
          </div>
          {account.holder && (
            <div className="flex justify-between">
              <span className="text-text-3">Inhaber</span>
              <span className="text-text text-[12px]">{account.holder}</span>
            </div>
          )}
          {account.iban && (
            <div className="flex justify-between">
              <span className="text-text-3">IBAN</span>
              <span className="text-text font-mono text-[12px]">{account.iban}</span>
            </div>
          )}
          {account.bic && (
            <div className="flex justify-between">
              <span className="text-text-3">BIC</span>
              <span className="text-text font-mono text-[12px]">{account.bic}</span>
            </div>
          )}
          {account.account_number && (
            <div className="flex justify-between">
              <span className="text-text-3">Kontonummer</span>
              <span className="text-text font-mono text-[12px]">{account.account_number}</span>
            </div>
          )}
          {account.currency && account.currency !== 'EUR' && (
            <div className="flex justify-between">
              <span className="text-text-3">Währung</span>
              <span className="text-text font-medium">{account.currency}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-3">Buchungen</span>
            <span className="text-text font-medium">{account.transaction_count}</span>
          </div>
          {account.notes && (
            <div className="pt-1 border-t border-border">
              <span className="text-text-3 text-[11px]">{account.notes}</span>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <AccountEditDialog account={account} groups={groups} onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

/* ─── Group Member Row ─────────────────────────────────────────────── */

function GroupMemberRow({ member, groupId, groups, allAccounts }: {
  member: AccountGroupMember;
  groupId: number;
  groups: AccountGroup[];
  allAccounts: Account[];
}) {
  const removeFromGroup = useRemoveAccountFromGroup();
  const [showEdit, setShowEdit] = useState(false);

  // Build a full Account object from the member for the edit dialog
  const fullAccount: Account | undefined = allAccounts.find(a => a.id === member.id);

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-2 group/row">
        <BankLogo bank={member.bank} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-text-3 uppercase tracking-wide font-medium leading-tight">
            {member.bank}
          </div>
          <div className="text-[13px] font-semibold text-text truncate leading-tight">
            {member.name}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-text-3">{member.transaction_count} Buch.</span>
          <button
            onClick={() => setShowEdit(true)}
            className="p-1 rounded-md text-text-3 hover:text-accent hover:bg-accent/10 transition-colors opacity-0 group-hover/row:opacity-100"
            title="Bearbeiten"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => removeFromGroup.mutate({ groupId, accountId: member.id })}
            className="p-1 rounded-md text-text-3 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover/row:opacity-100"
            title="Aus Gruppe entfernen"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showEdit && fullAccount && (
        <AccountEditDialog account={fullAccount} groups={groups} onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

/* ─── Group Card ───────────────────────────────────────────────────── */

function GroupCard({ group, groups, allAccounts }: { group: AccountGroup; groups: AccountGroup[]; allAccounts: Account[] }) {
  const updateGroup = useUpdateAccountGroup();
  const deleteGroup = useDeleteAccountGroup();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  return (
    <>
      <div className={`bg-surface rounded-2xl shadow-card p-6 border border-border transition-shadow ${group.is_active ? 'hover:shadow-card-hover' : 'opacity-60'}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${group.is_active ? 'bg-accent/8' : 'bg-surface-2'}`}>
              <FolderPlus size={20} className={group.is_active ? 'text-accent' : 'text-text-3'} />
            </div>
            <div>
              <div className="text-[11px] font-medium text-text-3 uppercase tracking-wide">
                {TYPE_LABELS[group.account_type] || 'Kontogruppe'}
              </div>
              <div className="font-heading font-semibold text-[15px] text-text">
                {group.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEdit(true)}
              className="p-1.5 rounded-lg text-text-3 hover:text-accent hover:bg-accent/10 transition-colors"
              title="Gruppe bearbeiten"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => updateGroup.mutate({ id: group.id, is_active: !group.is_active })}
              className={`p-1.5 rounded-lg transition-colors ${
                group.is_active
                  ? 'text-text-3 hover:text-amber-500 hover:bg-amber-500/10'
                  : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
              }`}
              title={group.is_active ? 'Gruppe ausblenden' : 'Gruppe einblenden'}
            >
              {group.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={() => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                deleteGroup.mutate(group.id);
              }}
              onBlur={() => setConfirmDelete(false)}
              className={`p-1.5 rounded-lg transition-colors ${
                confirmDelete
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'text-text-3 hover:text-red-500 hover:bg-red-500/10'
              }`}
              title={confirmDelete ? 'Nochmal klicken zum Löschen' : 'Gruppe löschen (Konten bleiben erhalten)'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
            Gruppe löschen? Konten und Buchungen bleiben erhalten. Nochmal klicken zum Bestätigen.
          </div>
        )}
        {!group.is_active && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-600 dark:text-amber-400">
            Ausgeblendet — Buchungen werden in Auswertungen nicht berücksichtigt.
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-text-3 font-medium">
            {group.accounts.length} Konten · {group.transaction_count} Buchungen
          </span>
        </div>
        <div className="space-y-2">
          {group.accounts.map(a => (
            <GroupMemberRow key={a.id} member={a} groupId={group.id} groups={groups} allAccounts={allAccounts} />
          ))}
          {group.accounts.length === 0 && (
            <div className="text-[12px] text-text-3 text-center py-2">
              Keine Konten zugewiesen
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <GroupEditDialog group={group} onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────── */

function AccountsPage() {
  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useAccountGroups();
  const createGroup = useCreateAccountGroup();
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);

  const ungroupedActive = accounts.filter(a => a.is_active !== false && !a.group_id);
  const ungroupedInactive = accounts.filter(a => a.is_active === false && !a.group_id);
  const activeGroups = groups.filter(g => g.is_active);
  const inactiveGroups = groups.filter(g => !g.is_active);

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    createGroup.mutate({ name: newGroupName.trim() }, {
      onSuccess: () => { setNewGroupName(''); setShowNewGroup(false); },
    });
  };

  return (
    <div>
      {accounts.length === 0 && groups.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-card p-12 text-center">
          <Landmark size={40} className="text-text-3 mx-auto mb-3" />
          <div className="font-heading font-semibold text-[15px] text-text mb-1">Keine Konten</div>
          <div className="text-[13px] text-text-3">Konten werden automatisch beim Import erstellt.</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Groups */}
          {activeGroups.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">
                Kontogruppen
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {activeGroups.map(group => (
                  <GroupCard key={group.id} group={group} groups={groups} allAccounts={accounts} />
                ))}
              </div>
            </div>
          )}

          {/* New group button */}
          <div>
            {showNewGroup ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                  placeholder="Gruppenname..."
                  className="text-[13px] px-3 py-2 rounded-xl bg-surface border border-border text-text outline-none focus:border-accent"
                />
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim() || createGroup.isPending}
                  className="px-3 py-2 rounded-xl text-[13px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Erstellen
                </button>
                <button
                  onClick={() => { setShowNewGroup(false); setNewGroupName(''); }}
                  className="p-2 rounded-xl text-text-3 hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewGroup(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-semibold bg-accent text-white hover:bg-accent/90 shadow-sm transition-colors cursor-pointer"
              >
                <FolderPlus size={18} />
                Neue Gruppe erstellen
              </button>
            )}
          </div>

          {/* Ungrouped accounts */}
          {ungroupedActive.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">
                {groups.length > 0 ? 'Nicht gruppierte Konten' : 'Konten'}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {ungroupedActive.map((account) => (
                  <AccountCard key={account.id} account={account} groups={groups} />
                ))}
              </div>
            </div>
          )}

          {/* Hidden */}
          {(inactiveGroups.length > 0 || ungroupedInactive.length > 0) && (
            <div>
              <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">
                Ausgeblendet
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {inactiveGroups.map(group => (
                  <GroupCard key={group.id} group={group} groups={groups} allAccounts={accounts} />
                ))}
                {ungroupedInactive.map((account) => (
                  <AccountCard key={account.id} account={account} groups={groups} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
