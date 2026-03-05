import { useState, useMemo } from 'react';
import { Bot, Check, Plus, X, ChevronDown, HelpCircle, Shield, Search } from 'lucide-react';
import {
  useAiModel,
  useSetAiModel,
  useAddCustomModel,
  useRemoveCustomModel,
} from '../../api/hooks';
import { useToast } from './Toast';
import { ModelBrowserDialog } from './ModelBrowserDialog';

export function AiModelSwitcher() {
  const { data } = useAiModel();
  const setModel = useSetAiModel();
  const addCustom = useAddCustomModel();
  const removeCustom = useRemoveCustomModel();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const zdrSet = useMemo(() => new Set(data?.zdrModelIds), [data?.zdrModelIds]);
  const availableSet = useMemo(() => new Set(data?.availableModelIds), [data?.availableModelIds]);

  if (!data) return null;

  const current = data.current;
  const custom = data.custom;
  const hasKey = data.hasApiKey;

  // Build quick-select list: free model at top, then presets (if API key), then custom
  const allModels = [
    { id: data.freeModel.id, label: data.freeModel.label, removable: false },
    ...(hasKey ? data.presets.map(p => ({ id: p.id, label: p.label, removable: false })) : []),
    ...custom.map(m => ({ id: m, label: m, removable: true })),
  ];

  const currentLabel =
    allModels.find(m => m.id === current)?.label
    || current.split('/').pop()
    || current;

  const handleSelect = (modelId: string) => {
    if (modelId === current) return;
    setModel.mutate(modelId, {
      onSuccess: () => toast(`Modell gewechselt: ${modelId.split('/').pop()}`),
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed || !trimmed.includes('/')) {
      toast('Format: provider/model-name', 'error');
      return;
    }
    addCustom.mutate(trimmed, {
      onSuccess: () => {
        handleSelect(trimmed);
        setCustomInput('');
        setAddingCustom(false);
      },
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  };

  const handleRemoveCustom = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeCustom.mutate(modelId);
    if (current === modelId) {
      handleSelect(data.freeModel.id);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] text-text-3 hover:text-text hover:bg-surface-2 transition-colors"
      >
        <Bot size={15} strokeWidth={1.5} className="shrink-0" />
        <span className="truncate flex-1 text-left">{currentLabel}</span>
        {zdrSet.has(current) && <Shield size={11} className="text-accent shrink-0" />}
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 w-[280px] bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-dropdown">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wider">KI-Modell</div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
                className="p-0.5 text-text-3 hover:text-accent transition-colors"
                title="Was ist das?"
              >
                <HelpCircle size={13} />
              </button>
            </div>

            {/* API key warning */}
            {!hasKey && (
              <div className="mx-2 mt-2 px-2.5 py-2 bg-amber-400/10 border border-amber-400/20 rounded-lg">
                <p className="text-[11px] text-amber-500 font-medium">Kein API-Key konfiguriert</p>
                <p className="text-[10px] text-text-3 mt-0.5">
                  Setze <code className="text-[10px] bg-surface-2 px-1 rounded">OPENROUTER_API_KEY</code> in deiner .env
                  {' '}&mdash;{' '}
                  <button onClick={() => setShowInfo(true)} className="text-accent hover:underline">Anleitung</button>
                </p>
              </div>
            )}

            {/* Model list */}
            <div className="max-h-[320px] overflow-y-auto py-1">
              {allModels.map(m => {
                // availableSet is empty when no API key (public /models was used) — don't mark anything unavailable
                const unavailable = availableSet.size > 0 && !availableSet.has(m.id) && m.id !== data.freeModel.id;
                return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (unavailable) {
                      toast('Modell nicht verfügbar — prüfe deine OpenRouter Datenschutz-Einstellungen', 'error');
                      return;
                    }
                    handleSelect(m.id); setOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors group ${
                    unavailable ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="w-4 shrink-0">
                    {current === m.id && <Check size={13} className="text-accent" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12px] text-text truncate ${unavailable ? 'line-through' : ''}`}>{m.label}</div>
                    {m.id !== m.label && (
                      <div className="text-[10px] text-text-3 truncate">{m.id}</div>
                    )}
                  </div>
                  {zdrSet.has(m.id) && (
                    <Shield size={11} className="text-accent/60 shrink-0" title="Zero Data Retention" />
                  )}
                  {m.removable && (
                    <button
                      onClick={(e) => handleRemoveCustom(m.id, e)}
                      className="p-0.5 opacity-0 group-hover:opacity-100 text-text-3 hover:text-exp-red transition-all"
                    >
                      <X size={12} />
                    </button>
                  )}
                </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-3 py-2 space-y-2">
              {/* Browse all models button */}
              <button
                onClick={() => { setShowBrowser(true); setOpen(false); }}
                className="flex items-center gap-1.5 text-[12px] text-accent hover:text-accent/80 transition-colors"
              >
                <Search size={13} /> Alle Modelle durchsuchen
              </button>

              {/* Custom model input */}
              {addingCustom ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCustom();
                      if (e.key === 'Escape') { setAddingCustom(false); setCustomInput(''); }
                    }}
                    placeholder="provider/model-name"
                    autoFocus
                    className="flex-1 min-w-0 text-[12px] bg-surface-2 border border-border rounded px-2 py-1.5 outline-none text-text placeholder:text-text-3 focus:border-accent"
                  />
                  <button onClick={handleAddCustom} className="p-1.5 text-accent hover:text-accent/80 transition-colors">
                    <Check size={14} />
                  </button>
                  <button onClick={() => { setAddingCustom(false); setCustomInput(''); }} className="p-1.5 text-text-3 hover:text-text transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCustom(true)}
                  className="flex items-center gap-1.5 text-[12px] text-text-3 hover:text-text transition-colors"
                >
                  <Plus size={13} /> Eigenes Modell hinzufügen
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Model browser dialog */}
      <ModelBrowserDialog open={showBrowser} onClose={() => setShowBrowser(false)} />

      {/* Info dialog */}
      {showInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setShowInfo(false)}>
          <div
            className="bg-surface rounded-2xl shadow-card-hover border border-border w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="font-heading font-semibold text-[14px] text-text">KI-Kategorisierung</h3>
              <button onClick={() => setShowInfo(false)} className="p-1 rounded-lg hover:bg-surface-2 text-text-3 hover:text-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 text-[13px] text-text-2 leading-relaxed">
              <div>
                <h4 className="font-medium text-text text-[13px] mb-1">Was ist das?</h4>
                <p>
                  expenze nutzt KI-Modelle um deine Transaktionen automatisch zu kategorisieren.
                  Die KI analysiert Empfänger und Beschreibungen und schlägt passende Kategorien vor.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-text text-[13px] mb-1">OpenRouter</h4>
                <p>
                  Wir nutzen <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">OpenRouter</a> als
                  Gateway — ein einziger API-Key gibt dir Zugang zu hunderten KI-Modellen
                  von Google, Meta, Anthropic, DeepSeek und vielen mehr.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-text text-[13px] mb-1">So startest du</h4>
                <ol className="list-decimal list-inside space-y-1 text-[12px]">
                  <li>
                    Erstelle ein kostenloses Konto auf{' '}
                    <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">openrouter.ai</a>
                  </li>
                  <li>
                    Gehe zu{' '}
                    <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Einstellungen &rarr; Keys</a>
                    {' '}und erstelle einen API-Key
                  </li>
                  <li>
                    Trage den Key als <code className="text-[11px] bg-surface-2 px-1 py-0.5 rounded">OPENROUTER_API_KEY</code> in deine <code className="text-[11px] bg-surface-2 px-1 py-0.5 rounded">.env</code> Datei ein
                  </li>
                  <li>Starte den Server neu</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium text-text text-[13px] mb-1 flex items-center gap-1.5">
                  <Shield size={13} />
                  Zero Data Retention
                </h4>
                <p className="text-[12px]">
                  Modelle mit dem <Shield size={10} className="inline text-accent" />-Symbol unterstützen
                  Zero Data Retention — der KI-Anbieter speichert deine Daten nicht und nutzt sie
                  nicht zum Training. ZDR wird automatisch aktiviert wenn verfügbar.
                </p>
              </div>
              <div className="pt-1 border-t border-border">
                <p className="text-[11px] text-text-3">
                  Tipp: <strong>Kostenlos (Auto-Router)</strong> wählt automatisch ein kostenloses Modell.
                  Nutze den <strong>Modell-Browser</strong> um aus hunderten Modellen zu wählen.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
