import { createFileRoute, useSearch, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authClient, useSession } from '../lib/auth';
import {
  Fingerprint, Plus, Trash2, Loader2, AlertTriangle, Bot, Check,
  X, ChevronDown, Shield, Search, Key, Eye, EyeOff, FileCode2,
  User, Brain, ChevronUp, FlaskConical, Pencil,
} from 'lucide-react';
import {
  useApiKey, useSaveApiKey, useDeleteApiKey,
  useAiModel, useSetAiModel, useAddCustomModel, useRemoveCustomModel,
  useBankTemplates, useUpdateBankTemplate, useDeleteBankTemplate,
  useTestBankTemplate,
  useAiImportSetting, useSaveAiImportSetting,
} from '../api/hooks';
import type { BankTemplate } from '../api/hooks';
import { useToast } from '../components/layout/Toast';
import { ModelBrowserDialog } from '../components/layout/ModelBrowserDialog';
import ManualTemplateWizard from '../components/templates/ManualTemplateWizard';

const TABS = [
  { id: 'account', label: 'Konto', icon: User },
  { id: 'ai', label: 'KI', icon: Brain },
  { id: 'templates', label: 'Templates', icon: FileCode2 },
  { id: 'danger', label: 'Gefahrenzone', icon: AlertTriangle },
] as const;

type TabId = (typeof TABS)[number]['id'];

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
  }),
  component: SettingsPage,
});

// ── Passkey type ─────────────────────────────────────────────────────

interface PasskeyEntry {
  id: string;
  name: string | null;
  createdAt: string;
  deviceType: string;
}

// ══════════════════════════════════════════════════════════════════════
// Settings Page
// ══════════════════════════════════════════════════════════════════════

function SettingsPage() {
  const { tab: searchTab } = useSearch({ from: '/settings' });
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some(t => t.id === searchTab) ? (searchTab as TabId) : 'account'
  );
  const { toast } = useToast();

  // Sync URL search param with tab
  useEffect(() => {
    if (searchTab !== activeTab) {
      setActiveTab(TABS.some(t => t.id === searchTab) ? (searchTab as TabId) : 'account');
    }
  }, [searchTab]);

  function switchTab(id: TabId) {
    setActiveTab(id);
    navigate({ to: '/settings', search: { tab: id === 'account' ? undefined : id }, replace: true });
  }

  return (
    <div>
      <h1 className="text-xl font-heading font-bold text-text mb-6">Einstellungen</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 p-1 bg-surface-2 rounded-xl w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  isActive
                    ? 'bg-surface text-text shadow-sm'
                    : tab.id === 'danger'
                      ? 'text-text-3 hover:text-red-400'
                      : 'text-text-3 hover:text-text'
                }`}
              >
                <Icon size={15} strokeWidth={isActive ? 2 : 1.5} className={tab.id === 'danger' && isActive ? 'text-red-400' : ''} />
                {tab.label}
              </button>
            );
          })}
        </div>

      {/* Tab content */}
      {activeTab === 'account' && <AccountTab toast={toast} />}
      {activeTab === 'ai' && <AiTab toast={toast} />}
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'danger' && <DangerTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Account Tab
// ══════════════════════════════════════════════════════════════════════

function AccountTab({ toast }: { toast: (msg: string, type?: 'error') => void }) {
  const { data: session } = useSession();
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPasskeys = useCallback(async () => {
    try {
      const { data } = await authClient.passkey.listUserPasskeys();
      setPasskeys((data as PasskeyEntry[]) || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPasskeys(); }, [loadPasskeys]);

  async function handleAddPasskey() {
    setError(''); setSuccess(''); setAdding(true);
    try {
      const { error: addError } = await authClient.passkey.addPasskey({ authenticatorAttachment: 'platform' });
      if (addError) { setError(addError.message || 'Passkey konnte nicht hinzugefügt werden'); }
      else { setSuccess('Passkey erfolgreich hinzugefügt'); await loadPasskeys(); }
    } catch { setError('Passkey konnte nicht hinzugefügt werden'); }
    finally { setAdding(false); }
  }

  async function handleDeletePasskey(id: string) {
    setError(''); setSuccess(''); setDeleting(id);
    try { await authClient.passkey.deletePasskey({ id }); setSuccess('Passkey gelöscht'); await loadPasskeys(); }
    catch { setError('Passkey konnte nicht gelöscht werden'); }
    finally { setDeleting(null); }
  }

  return (
    <div className="space-y-8">
      {/* Account info */}
      <section>
        <h2 className="text-[13px] font-semibold text-text-2 uppercase tracking-wider mb-3">Konto</h2>
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-[13px] text-text-2">
            Angemeldet als <span className="text-text font-medium">{session?.user.email}</span>
          </div>
        </div>
      </section>

      {/* Passkeys */}
      <section>
        <h2 className="text-[13px] font-semibold text-text-2 uppercase tracking-wider mb-3">Passkeys</h2>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-[13px] text-text-2 mb-4">
            Passkeys ermöglichen eine sichere Anmeldung per Fingerabdruck, Gesichtserkennung oder Geräte-PIN.
          </p>

          {error && <p className="text-[12px] text-red-400 mb-3">{error}</p>}
          {success && <p className="text-[12px] text-green-400 mb-3">{success}</p>}

          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-text-3 py-4">
              <Loader2 size={14} className="animate-spin" /> Lade Passkeys...
            </div>
          ) : (
            <>
              {passkeys.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {passkeys.map(pk => (
                    <div key={pk.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface-2 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Fingerprint size={16} className="text-accent flex-shrink-0" />
                        <div>
                          <div className="text-[13px] text-text font-medium">{pk.name || 'Passkey'}</div>
                          <div className="text-[11px] text-text-3">
                            {pk.deviceType === 'singleDevice' ? 'Einzelgerät' : 'Multi-Gerät'} &middot; Erstellt {new Date(pk.createdAt).toLocaleDateString('de-DE')}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePasskey(pk.id)}
                        disabled={deleting === pk.id}
                        className="text-text-3 hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Passkey löschen"
                      >
                        {deleting === pk.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-text-3 mb-4">Noch keine Passkeys registriert.</p>
              )}
              <button
                onClick={handleAddPasskey}
                disabled={adding}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-[13px] font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {adding ? 'Warte auf Gerät...' : 'Passkey hinzufügen'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// AI Tab
// ══════════════════════════════════════════════════════════════════════

function AiTab({ toast }: { toast: (msg: string, type?: 'error') => void }) {
  // ── API Key ───────────────────────────────────────────────────────
  const { data: apiKeyStatus } = useApiKey();
  const saveApiKey = useSaveApiKey();
  const deleteApiKey = useDeleteApiKey();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [editingApiKey, setEditingApiKey] = useState(false);

  function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed.startsWith('sk-')) { toast('API-Key muss mit "sk-" beginnen', 'error'); return; }
    saveApiKey.mutate(trimmed, {
      onSuccess: () => { toast('API-Key gespeichert'); setApiKeyInput(''); setEditingApiKey(false); },
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  }

  function handleDeleteApiKey() {
    deleteApiKey.mutate(undefined, {
      onSuccess: () => toast('API-Key entfernt'),
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  }

  // ── AI Model ──────────────────────────────────────────────────────
  const { data: modelData } = useAiModel();
  const setModel = useSetAiModel();
  const addCustom = useAddCustomModel();
  const removeCustom = useRemoveCustomModel();

  const [showBrowser, setShowBrowser] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  // ── AI Import Setting ───────────────────────────────────────────
  const { data: aiImportData } = useAiImportSetting();
  const saveAiImport = useSaveAiImportSetting();

  const zdrSet = useMemo(() => new Set(modelData?.zdrModelIds), [modelData?.zdrModelIds]);
  const availableSet = useMemo(() => new Set(modelData?.availableModelIds), [modelData?.availableModelIds]);

  const allModels = modelData ? [
    { id: modelData.freeModel.id, label: modelData.freeModel.label, removable: false },
    ...(modelData.hasApiKey ? modelData.presets.map(p => ({ id: p.id, label: p.label, removable: false })) : []),
    ...modelData.custom.map(m => ({ id: m, label: m, removable: true })),
  ] : [];

  const currentModelLabel = modelData
    ? (allModels.find(m => m.id === modelData.current)?.label || modelData.current.split('/').pop() || modelData.current)
    : '...';

  function handleSelectModel(modelId: string) {
    if (modelId === modelData?.current) return;
    setModel.mutate(modelId, {
      onSuccess: () => toast(`Modell gewechselt: ${modelId.split('/').pop()}`),
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  }

  function handleAddCustomModel() {
    const trimmed = customInput.trim();
    if (!trimmed || !trimmed.includes('/')) { toast('Format: provider/model-name', 'error'); return; }
    addCustom.mutate(trimmed, {
      onSuccess: () => { handleSelectModel(trimmed); setCustomInput(''); setAddingCustom(false); },
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  }

  function handleRemoveCustomModel(modelId: string) {
    removeCustom.mutate(modelId);
    if (modelData?.current === modelId) handleSelectModel(modelData.freeModel.id);
  }

  return (
    <div className="space-y-8">
      {/* OpenRouter API Key */}
      <section>
        <h2 className="text-[13px] font-semibold text-text-2 uppercase tracking-wider mb-3">OpenRouter API-Key</h2>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-[13px] text-text-2 mb-4 leading-relaxed">
            Für KI-Funktionen (Kategorisierung, Chat, Template-Erkennung) benötigst du einen eigenen{' '}
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">OpenRouter API-Key</a>.
            Erstelle ein kostenloses Konto und generiere einen Key.
          </p>

          {apiKeyStatus?.hasKey && !editingApiKey ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 px-3 py-2 bg-surface-2 rounded-lg">
                <Key size={14} className="text-accent shrink-0" />
                <span className="text-[13px] text-text font-mono">{apiKeyStatus.maskedKey}</span>
              </div>
              <button onClick={() => setEditingApiKey(true)} className="px-3 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors">Ändern</button>
              <button onClick={handleDeleteApiKey} className="px-3 py-2 text-[13px] font-medium rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">Entfernen</button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
                    placeholder="sk-or-v1-..."
                    className="w-full px-3 py-2 pr-9 text-[13px] bg-surface-2 border border-border rounded-lg text-text placeholder:text-text-3 focus:outline-none focus:border-accent font-mono"
                    autoFocus={editingApiKey}
                  />
                  <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text transition-colors">
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim() || saveApiKey.isPending}
                  className="px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveApiKey.isPending ? 'Speichere...' : 'Speichern'}
                </button>
                {editingApiKey && (
                  <button onClick={() => { setEditingApiKey(false); setApiKeyInput(''); }} className="px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors">Abbrechen</button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AI Model Selection */}
      <section>
        <h2 className="text-[13px] font-semibold text-text-2 uppercase tracking-wider mb-3">KI-Modell</h2>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-[13px] text-text-2 mb-4 leading-relaxed">
            Wähle das KI-Modell für Kategorisierung und Chat.
            {!modelData?.hasApiKey && (
              <span className="text-amber-400"> Hinterlege zuerst einen API-Key um Premium-Modelle freizuschalten.</span>
            )}
          </p>

          {/* Current model + dropdown */}
          <div className="mb-4">
            <button
              ref={modelBtnRef}
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="flex items-center gap-2 w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-[13px] text-text hover:border-accent/50 transition-colors"
            >
              <Bot size={15} strokeWidth={1.5} className="shrink-0 text-accent" />
              <span className="truncate flex-1 text-left font-medium">{currentModelLabel}</span>
              {modelData && zdrSet.has(modelData.current) && <Shield size={12} className="text-accent shrink-0" />}
              <ChevronDown size={13} className={`shrink-0 text-text-3 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                <div
                  className="fixed bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden"
                  style={(() => {
                    const rect = modelBtnRef.current?.getBoundingClientRect();
                    if (!rect) return {};
                    return { top: rect.bottom + 4, left: rect.left, width: rect.width };
                  })()}
                >
                  <div className="max-h-[320px] overflow-y-auto py-1">
                    {allModels.map(m => {
                      const unavailable = availableSet.size > 0 && !availableSet.has(m.id) && m.id !== modelData?.freeModel.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            if (unavailable) { toast('Modell nicht verfügbar — prüfe deine OpenRouter Datenschutz-Einstellungen', 'error'); return; }
                            handleSelectModel(m.id); setModelDropdownOpen(false);
                          }}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors group ${unavailable ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-2'}`}
                        >
                          <div className="w-4 shrink-0">{modelData?.current === m.id && <Check size={13} className="text-accent" />}</div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-[12px] text-text truncate ${unavailable ? 'line-through' : ''}`}>{m.label}</div>
                            {m.id !== m.label && <div className="text-[10px] text-text-3 truncate">{m.id}</div>}
                          </div>
                          {zdrSet.has(m.id) && <Shield size={11} className="text-accent/60 shrink-0" title="Zero Data Retention" />}
                          {m.removable && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveCustomModel(m.id); }}
                              className="p-0.5 opacity-0 group-hover:opacity-100 text-text-3 hover:text-red-400 transition-all"
                            ><X size={12} /></button>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-border px-3 py-2 space-y-2">
                    <button onClick={() => { setShowBrowser(true); setModelDropdownOpen(false); }} className="flex items-center gap-1.5 text-[12px] text-accent hover:text-accent/80 transition-colors">
                      <Search size={13} /> Alle Modelle durchsuchen
                    </button>
                    {addingCustom ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text" value={customInput} onChange={(e) => setCustomInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomModel(); if (e.key === 'Escape') { setAddingCustom(false); setCustomInput(''); } }}
                          placeholder="provider/model-name" autoFocus
                          className="flex-1 min-w-0 text-[12px] bg-surface-2 border border-border rounded px-2 py-1.5 outline-none text-text placeholder:text-text-3 focus:border-accent"
                        />
                        <button onClick={handleAddCustomModel} className="p-1.5 text-accent hover:text-accent/80 transition-colors"><Check size={14} /></button>
                        <button onClick={() => { setAddingCustom(false); setCustomInput(''); }} className="p-1.5 text-text-3 hover:text-text transition-colors"><X size={14} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingCustom(true)} className="flex items-center gap-1.5 text-[12px] text-text-3 hover:text-text transition-colors">
                        <Plus size={13} /> Eigenes Modell hinzufügen
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="text-[11px] text-text-3 leading-relaxed">
            <Shield size={10} className="inline text-accent mr-1" />
            Modelle mit dem Schild-Symbol unterstützen Zero Data Retention — der KI-Anbieter speichert keine Daten.
          </div>
        </div>
      </section>

      {/* AI Import Consent */}
      <section>
        <h2 className="text-[13px] font-semibold text-text-2 uppercase tracking-wider mb-3">KI-gestützter Import</h2>
        <button
          onClick={() => saveAiImport.mutate(!aiImportData?.allowed)}
          disabled={saveAiImport.isPending}
          className={`w-full text-left rounded-xl p-5 border transition-colors cursor-pointer ${
            aiImportData?.allowed
              ? 'bg-accent/5 border-accent/30 hover:bg-accent/8'
              : 'bg-surface border-border hover:bg-surface-2/50'
          } ${saveAiImport.isPending ? 'opacity-50' : ''}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Brain size={15} className={aiImportData?.allowed ? 'text-accent' : 'text-text-3'} />
                <p className="text-[13px] text-text font-medium">KI-gestützte Imports erlauben</p>
              </div>
              <p className="text-[12px] text-text-3 leading-relaxed">
                Bei PDF-Dateien und unbekannten CSV-Formaten werden Daten an den KI-Dienst (OpenRouter) zur Analyse gesendet.
                PDFs werden vollständig übermittelt, bei CSVs nur die ersten Zeilen.
              </p>
            </div>
            <div
              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
                aiImportData?.allowed ? 'bg-accent' : 'bg-border-2'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  aiImportData?.allowed ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </button>
      </section>

      <ModelBrowserDialog open={showBrowser} onClose={() => setShowBrowser(false)} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Templates Tab (moved from templates route)
// ══════════════════════════════════════════════════════════════════════

function columnSummary(columns: Record<string, any>): string[] {
  return Object.entries(columns)
    .filter(([, v]) => v)
    .map(([key, mapping]) => {
      const col = mapping.column || mapping.joinColumns?.join('+') || `[${mapping.fallbackIndex}]`;
      return `${key} → ${col}`;
    });
}

function TemplateCard({ template, readOnly }: { template: BankTemplate; readOnly?: boolean }) {
  const updateTemplate = useUpdateBankTemplate();
  const deleteTemplate = useDeleteBankTemplate();
  const testTemplate = useTestBankTemplate();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testCsv, setTestCsv] = useState('');
  const [testResult, setTestResult] = useState<{ transactions: any[]; total: number } | null>(null);
  const [testError, setTestError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(template.name);

  const config = template.config;
  const cols = columnSummary(config.columns || {});

  function handleRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === template.name) { setRenaming(false); return; }
    updateTemplate.mutate({ id: template.id, name: trimmed }, {
      onSuccess: () => setRenaming(false),
    });
  }

  return (
    <div className="bg-surface rounded-2xl shadow-card border border-border hover:shadow-card-hover transition-shadow">
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-accent/8">
              <FileCode2 size={18} className="text-accent" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-text-3 flex items-center gap-2">
                {template.is_builtin && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold">Built-in</span>
                )}
                {template.is_ai_generated && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-semibold">KI-generiert</span>
                )}
                {!template.is_builtin && !template.is_ai_generated && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-3 font-semibold">Manuell</span>
                )}
                {template.created_at && (
                  <span className="text-[10px] text-text-3">{new Date(template.created_at).toLocaleDateString('de-DE')}</span>
                )}
              </div>
              {renaming ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
                    className="text-[14px] font-heading font-semibold bg-surface-2 border border-border rounded px-2 py-0.5 outline-none focus:border-accent text-text"
                    autoFocus
                  />
                  <button onClick={handleRename} className="p-1 text-accent hover:text-accent/80"><Check size={14} /></button>
                  <button onClick={() => setRenaming(false)} className="p-1 text-text-3 hover:text-text"><X size={14} /></button>
                </div>
              ) : (
                <div className="font-heading font-semibold text-[14px] text-text">{template.name}</div>
              )}
            </div>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setRenaming(true); setRenameValue(template.name); }}
                className="p-1.5 rounded-lg text-text-3 hover:text-accent hover:bg-accent/10 transition-colors"
                title="Umbenennen"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => { if (!confirmDelete) { setConfirmDelete(true); return; } deleteTemplate.mutate(template.id); }}
                onBlur={() => setConfirmDelete(false)}
                className={`p-1.5 rounded-lg transition-colors ${confirmDelete ? 'bg-red-500/10 text-red-500' : 'text-text-3 hover:text-red-500 hover:bg-red-500/10'}`}
                title={confirmDelete ? 'Nochmal klicken' : 'Löschen'}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {confirmDelete && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
            Template löschen? Nochmal klicken zum Bestätigen.
          </div>
        )}

        <div className="space-y-1.5 text-[12px]">
          {config._format && config._format !== 'csv' ? (
            <>
              <div className="flex justify-between"><span className="text-text-3">Format</span><span className="text-text font-mono">{config._format === 'mt940' ? 'MT940 / SWIFT' : config._format === 'camt052' ? 'CAMT.052 / ISO 20022' : config._format === 'pdf' ? 'PDF (KI-Extraktion)' : config._format}</span></div>
              <div className="flex justify-between"><span className="text-text-3">Dateitypen</span><span className="text-text font-mono">{config._format === 'mt940' ? '.mta, .sta' : config._format === 'pdf' ? '.pdf' : '.xml'}</span></div>
              <div className="flex justify-between"><span className="text-text-3">Erkennung</span><span className="text-text font-mono">{config._format === 'mt940' ? 'Auto (:20: Tag)' : config._format === 'pdf' ? 'Auto (PDF)' : 'Auto (camt.052 XML)'}</span></div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-2"><span className="text-text-3 shrink-0">Erkennung</span><span className="text-text font-mono truncate" title={config.detection?.headerStartsWith}>{config.detection?.headerStartsWith ? `"${config.detection.headerStartsWith.slice(0, 50)}${config.detection.headerStartsWith.length > 50 ? '…' : ''}"` : '–'}</span></div>
              <div className="flex justify-between"><span className="text-text-3">Trennzeichen</span><span className="text-text font-mono">{config.csv?.delimiter === 'auto' ? 'auto' : `"${config.csv?.delimiter}"`}</span></div>
              <div className="flex justify-between"><span className="text-text-3">Beschreibung</span><span className="text-text font-mono truncate max-w-[180px]" title={config.descriptionTemplate}>{config.descriptionTemplate || '–'}</span></div>
            </>
          )}
        </div>

        {/* Usage stats */}
        {template.matchedAccounts && template.matchedAccounts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-text-3">Konten:</span>
              {template.matchedAccounts.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-text-2 font-medium">
                  {a.name}
                  <span className="text-text-3 font-normal">({a.txCount})</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {template.txCount === 0 && !template.is_builtin && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <span className="text-[11px] text-text-3">Noch keine Transaktionen importiert</span>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-[12px] font-medium text-text-3 hover:text-text-2 transition-colors"
          >
            <span>{expanded ? 'Details ausblenden' : 'Details anzeigen'}</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expanded && (
            <div className="px-5 pb-5 space-y-4">
              <div>
                <div className="text-[12px] font-semibold text-text-2 mb-2">Spalten-Mapping</div>
                <div className="space-y-1">
                  {cols.map(c => <div key={c} className="text-[12px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1">{c}</div>)}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-text-2 mb-2">Hash-Felder</div>
                <div className="flex flex-wrap gap-1.5">
                  {(config.hashFields || []).map((f: string) => <span key={f} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent/8 text-accent">{f}</span>)}
                </div>
              </div>
              {config.typeMap && Object.keys(config.typeMap).length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-text-2 mb-2">Typ-Zuordnung</div>
                  <div className="space-y-1">
                    {Object.entries(config.typeMap).map(([k, v]) => <div key={k} className="text-[12px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1">{k} → {v as string}</div>)}
                  </div>
                </div>
              )}
              {config.fallbacks && config.fallbacks.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-text-2 mb-2">Fallback-Regeln</div>
                  <div className="space-y-1">
                    {config.fallbacks.map((fb: any, i: number) => <div key={i} className="text-[12px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1">wenn {fb.field} leer → kopiere {fb.copyFrom}</div>)}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[12px] font-semibold text-text-2 mb-2 flex items-center gap-1.5"><FlaskConical size={13} /> Template testen</div>
                <textarea
                  value={testCsv} onChange={(e) => setTestCsv(e.target.value)}
                  placeholder="CSV-Inhalt hier einfügen (Header + ein paar Zeilen)…"
                  className="w-full h-24 text-[12px] font-mono bg-surface-2 border border-border rounded-lg p-3 outline-none focus:border-accent resize-y placeholder:text-text-3"
                />
                <button
                  onClick={() => {
                    if (!testCsv.trim()) return;
                    setTestError(''); setTestResult(null);
                    testTemplate.mutate(
                      { config: template.config, csvText: testCsv, bankName: template.name },
                      { onSuccess: (data) => setTestResult(data), onError: (err: any) => setTestError(err.message || 'Fehler') },
                    );
                  }}
                  disabled={testTemplate.isPending || !testCsv.trim()}
                  className="mt-2 px-4 py-1.5 text-[12px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
                >
                  {testTemplate.isPending ? 'Teste…' : 'Testen'}
                </button>
                {testError && <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">{testError}</div>}
                {testResult && (
                  <div className="mt-2">
                    <div className="text-[12px] text-text-2 mb-1">{testResult.total} Transaktionen erkannt (zeige max. 20)</div>
                    <div className="max-h-48 overflow-auto rounded-lg border border-border">
                      <table className="w-full text-[11px]">
                        <thead><tr className="bg-surface-2 text-text-3"><th className="text-left px-2 py-1.5 font-medium">Datum</th><th className="text-left px-2 py-1.5 font-medium">Empfänger</th><th className="text-right px-2 py-1.5 font-medium">Betrag</th><th className="text-left px-2 py-1.5 font-medium">Beschreibung</th></tr></thead>
                        <tbody>
                          {testResult.transactions.map((tx: any, i: number) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2 py-1.5 text-text-2 whitespace-nowrap">{tx.bu_date}</td>
                              <td className="px-2 py-1.5 text-text truncate max-w-[140px]">{tx.counterparty}</td>
                              <td className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${tx.direction === 'debit' ? 'text-exp-red' : 'text-accent'}`}>
                                {tx.direction === 'debit' ? '−' : '+'}{tx.amount?.toFixed(2)} €
                              </td>
                              <td className="px-2 py-1.5 text-text-2 truncate max-w-[200px]" title={tx.description}>{tx.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TemplatesTab() {
  const { data: templates = [] } = useBankTemplates();
  const [showManualWizard, setShowManualWizard] = useState(false);

  const builtins = templates.filter(t => t.is_builtin);
  const aiGenerated = templates.filter(t => !t.is_builtin && t.is_ai_generated);
  const manual = templates.filter(t => !t.is_builtin && !t.is_ai_generated);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-[13px] text-text-3">{templates.length} Template{templates.length !== 1 ? 's' : ''} installiert</p>
        <button onClick={() => setShowManualWizard(true)} className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors">
          <Plus size={15} /> Manuelle CSV-Vorlage erstellen
        </button>
      </div>

      <div className="space-y-6">
        {builtins.length > 0 && (
          <div>
            <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">Integrierte Parser</div>
            <div className="grid grid-cols-2 gap-4">
              {builtins.map(t => <TemplateCard key={t.id} template={t} readOnly />)}
            </div>
          </div>
        )}
        {aiGenerated.length > 0 && (
          <div>
            <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">KI-generierte CSV Parser</div>
            <div className="grid grid-cols-2 gap-4">
              {aiGenerated.map(t => <TemplateCard key={t.id} template={t} />)}
            </div>
          </div>
        )}
        {manual.length > 0 && (
          <div>
            <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">Manuelle CSV Vorlagen</div>
            <div className="grid grid-cols-2 gap-4">
              {manual.map(t => <TemplateCard key={t.id} template={t} />)}
            </div>
          </div>
        )}
      </div>

      {showManualWizard && <ManualTemplateWizard onClose={() => setShowManualWizard(false)} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Danger Tab
// ══════════════════════════════════════════════════════════════════════

function DangerAction({ title, description, buttonLabel, confirmLabel, onConfirm, successMessage, redirect }: {
  title: string;
  description: string;
  buttonLabel: string;
  confirmLabel: string;
  onConfirm: () => Promise<Response>;
  successMessage?: string;
  redirect?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await onConfirm();
      if (res.ok) {
        if (redirect) { window.location.href = redirect; }
        else { toast(successMessage || 'Erledigt'); setOpen(false); setConfirm(''); }
      } else {
        toast('Aktion fehlgeschlagen', 'error');
      }
    } catch { toast('Aktion fehlgeschlagen', 'error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-surface border border-red-500/20 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] text-text font-medium mb-1">{title}</p>
          <p className="text-[13px] text-text-2 leading-relaxed">{description}</p>
        </div>
      </div>
      {!open ? (
        <button onClick={() => setOpen(true)} className="px-4 py-2.5 text-[13px] font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
          {buttonLabel}
        </button>
      ) : (
        <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
          <label className="block text-[13px] text-text-2 mb-2">
            Tippe <span className="font-mono font-semibold text-red-400">{confirmLabel}</span> zum Bestätigen
          </label>
          <input
            type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && confirm.toLowerCase() === confirmLabel.toLowerCase()) handleConfirm(); }}
            placeholder={confirmLabel} autoFocus
            className="w-full px-3 py-2 text-[13px] bg-surface border border-border rounded-lg text-text placeholder:text-text-3 focus:outline-none focus:border-red-500/50 mb-3"
          />
          <div className="flex gap-3">
            <button onClick={() => { setOpen(false); setConfirm(''); }} disabled={loading} className="px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors">Abbrechen</button>
            <button
              onClick={handleConfirm}
              disabled={confirm.toLowerCase() !== confirmLabel.toLowerCase() || loading}
              className="px-4 py-2 text-[13px] font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Lösche...' : buttonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DangerTab() {
  return (
    <div className="space-y-4">
      <DangerAction
        title="Transaktionen zurücksetzen"
        description="Alle importierten Transaktionen und Importprotokolle werden gelöscht. Bankkonten, Kategorien und Templates bleiben erhalten."
        buttonLabel="Transaktionen löschen..."
        confirmLabel="löschen"
        onConfirm={() => fetch('/api/reset/transactions', { method: 'POST', credentials: 'include' })}
        successMessage="Alle Transaktionen wurden gelöscht"
      />
      <DangerAction
        title="Konten zurücksetzen"
        description="Alle Bankkonten, Kontogruppen und deren Transaktionen werden gelöscht. Kategorien und Templates bleiben erhalten."
        buttonLabel="Konten löschen..."
        confirmLabel="löschen"
        onConfirm={() => fetch('/api/reset/accounts', { method: 'POST', credentials: 'include' })}
        successMessage="Alle Konten wurden gelöscht"
      />
      <DangerAction
        title="Templates zurücksetzen"
        description="Alle eigenen und KI-generierten CSV-Templates werden gelöscht. Integrierte Parser (MT940, CAMT.052) bleiben erhalten."
        buttonLabel="Templates löschen..."
        confirmLabel="löschen"
        onConfirm={() => fetch('/api/reset/templates', { method: 'POST', credentials: 'include' })}
        successMessage="Alle eigenen Templates wurden gelöscht"
      />
      <DangerAction
        title="Konto unwiderruflich löschen"
        description="Alle Transaktionen, Konten, Kategorien, Regeln, Importprotokolle und dein Benutzerkonto werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        buttonLabel="Konto endgültig löschen"
        confirmLabel="löschen"
        onConfirm={() => fetch('/api/account', { method: 'DELETE', credentials: 'include' })}
        redirect="/login"
      />
    </div>
  );
}
