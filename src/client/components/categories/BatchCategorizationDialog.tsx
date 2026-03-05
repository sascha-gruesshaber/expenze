import { useMemo, useState, useCallback, useRef } from 'react';
import { X, Minus, Loader2, Sparkles, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import {
  useBatchApply,
  useCategoryList,
  useCategoryOverview,
  type BatchApplyAction,
} from '../../api/hooks';
import { useBatchContext, type RowState } from '../../lib/batchContext';
import { useFilters } from '../../lib/filterContext';
import { useToast } from '../layout/Toast';

type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';

const confidenceMeta: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  high: { label: 'Sicher', color: 'text-emerald-400 bg-emerald-400/10', icon: CheckCircle2 },
  medium: { label: 'Wahrscheinlich', color: 'text-amber-400 bg-amber-400/10', icon: AlertTriangle },
  low: { label: 'Unsicher', color: 'text-red-400 bg-red-400/10', icon: HelpCircle },
};

export function BatchCategorizationDialog() {
  const {
    progress, step, rowStates, dialogMode,
    start, stop, reset, closeDialog,
    setStep, setRowStates,
  } = useBatchContext();

  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [isLeaving, setIsLeaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { filters } = useFilters();
  const batchApply = useBatchApply();
  const { data: categories = [] } = useCategoryList();
  const { data: overview = [] } = useCategoryOverview(filters);
  const { toast } = useToast();

  const sonstigesEntry = overview.find(c => c.category === 'Sonstiges');
  const sonstigesCount = sonstigesEntry?.tx_count ?? 0;

  const suggestions = progress.suggestions;
  const isLoading = progress.status === 'loading';
  const canMinimize = progress.status !== 'idle';

  const handleDismiss = useCallback(() => {
    if (canMinimize && panelRef.current) {
      // Compute offset from dialog center to floating indicator center (bottom-16 right-6)
      const rect = panelRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const targetX = window.innerWidth - 24 - 130;  // right-6 + ~half indicator width
      const targetY = window.innerHeight - 64 - 24;  // bottom-16 + ~half indicator height
      panelRef.current.style.setProperty('--min-dx', `${targetX - cx}px`);
      panelRef.current.style.setProperty('--min-dy', `${targetY - cy}px`);

      setIsLeaving(true);
      setTimeout(() => {
        setIsLeaving(false);
        closeDialog();
      }, 330);
    } else {
      closeDialog();
    }
  }, [canMinimize, closeDialog]);

  const allCategories = useMemo(() => {
    const set = new Set(categories);
    for (const s of suggestions) {
      if (s.suggested_category && s.suggested_category !== 'Sonstiges') {
        set.add(s.suggested_category);
      }
    }
    return [...set].sort();
  }, [categories, suggestions]);

  const filteredSuggestions = useMemo(() => {
    if (confidenceFilter === 'all') return suggestions;
    return suggestions.filter(s => s.confidence === confidenceFilter);
  }, [suggestions, confidenceFilter]);

  const selectedCount = useMemo(() => {
    let count = 0;
    for (const s of filteredSuggestions) {
      if (rowStates.get(s.counterparty)?.selected) count++;
    }
    return count;
  }, [filteredSuggestions, rowStates]);

  const selectedTxCount = useMemo(() => {
    let count = 0;
    for (const s of filteredSuggestions) {
      if (rowStates.get(s.counterparty)?.selected) count += s.count;
    }
    return count;
  }, [filteredSuggestions, rowStates]);

  const selectedRuleCount = useMemo(() => {
    let count = 0;
    for (const s of filteredSuggestions) {
      const row = rowStates.get(s.counterparty);
      if (row?.selected && row.createRule) count++;
    }
    return count;
  }, [filteredSuggestions, rowStates]);

  const updateRow = (key: string, update: Partial<RowState>) => {
    setRowStates(prev => {
      const next = new Map(prev);
      const current = next.get(key) || { selected: false, category: '', createRule: true };
      next.set(key, { ...current, ...update });
      return next;
    });
  };

  const toggleAll = (selected: boolean) => {
    setRowStates(prev => {
      const next = new Map(prev);
      for (const s of filteredSuggestions) {
        const current = next.get(s.counterparty);
        if (current) {
          next.set(s.counterparty, { ...current, selected });
        }
      }
      return next;
    });
  };

  const handleApply = () => {
    const actions: BatchApplyAction[] = [];
    for (const s of suggestions) {
      const row = rowStates.get(s.counterparty);
      if (!row?.selected) continue;
      if (row.category === 'Sonstiges' || !row.category.trim()) continue;
      actions.push({
        counterparty: s.counterparty,
        transaction_ids: s.transaction_ids,
        category: row.category,
        create_rule: row.createRule,
        rule: row.createRule ? {
          pattern: s.rule_pattern,
          match_type: s.rule_match_type,
          match_field: s.rule_match_field,
        } : undefined,
      });
    }

    batchApply.mutate({ actions }, {
      onSuccess: (data) => {
        toast(`${data.updated_transactions} Transaktionen aktualisiert, ${data.rules_created} Regeln erstellt`);
        reset();
      },
      onError: (err) => toast('Fehler: ' + err.message, 'error'),
    });
  };

  if (dialogMode !== 'open') return null;

  const pct = progress.totalGroups > 0
    ? Math.round((progress.completed / progress.totalGroups) * 100)
    : 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${isLeaving ? 'animate-backdrop-fade-out' : ''}`}
      onClick={handleDismiss}
    >
      <div
        ref={panelRef}
        className={`bg-surface rounded-2xl shadow-card-hover border border-border w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col ${isLeaving ? 'animate-dialog-minimize' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h3 className="font-heading font-semibold text-[15px] text-text">KI-Kategorisierung</h3>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-surface-2 text-text-3 hover:text-text transition-colors"
            title={canMinimize ? 'Minimieren' : 'Schließen'}
          >
            {canMinimize ? <Minus size={18} /> : <X size={18} />}
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* Step indicator */}
          <div className="flex gap-1 mb-5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-accent' : 'bg-surface-2'
                }`}
              />
            ))}
          </div>

          {/* Step 1: Start + live progress */}
          {step === 1 && (
            <div>
              {/* Idle — no uncategorized */}
              {progress.status === 'idle' && sonstigesCount === 0 && (
                <div className="text-center py-6">
                  <div className="text-[14px] text-text-2 mb-2">Keine unkategorisierten Transaktionen</div>
                  <p className="text-[12px] text-text-3">Alle Transaktionen haben bereits eine Kategorie.</p>
                </div>
              )}

              {/* Idle — start button */}
              {progress.status === 'idle' && sonstigesCount > 0 && (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles size={24} className="text-accent" />
                  </div>
                  <h4 className="text-[15px] font-medium text-text mb-2">
                    {sonstigesCount} unkategorisierte Transaktionen
                  </h4>
                  <p className="text-[12px] text-text-3 mb-6 max-w-sm mx-auto">
                    Die KI analysiert alle &quot;Sonstiges&quot;-Transaktionen gruppiert nach Empfänger und schlägt passende Kategorien vor.
                  </p>
                  <button
                    onClick={() => start(filters)}
                    className="px-6 py-2.5 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors inline-flex items-center gap-2"
                  >
                    <Sparkles size={14} />
                    KI-Analyse starten
                  </button>
                </div>
              )}

              {/* Loading / error / stopped */}
              {(isLoading || progress.status === 'error' || progress.status === 'stopped') && (
                <div>
                  {/* Progress header */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] text-text font-medium flex items-center gap-2">
                        {isLoading && <Loader2 size={14} className="animate-spin text-accent" />}
                        {isLoading ? 'Analysiere Empfängergruppen...' : progress.status === 'stopped' ? 'Analyse gestoppt' : 'Fehler bei der Analyse'}
                      </span>
                      <span className="text-[13px] font-semibold text-accent tabular-nums">
                        {progress.completed} / {progress.totalGroups}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-text-3">
                        {progress.totalTransactions} Transaktionen in {progress.totalGroups} Gruppen
                      </span>
                      <span className="text-[11px] text-text-3 tabular-nums">{pct}%</span>
                    </div>
                  </div>

                  {/* Currently processing */}
                  {isLoading && progress.currentGroup && (
                    <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-accent/5 border border-accent/20">
                      <Loader2 size={12} className="animate-spin text-accent shrink-0" />
                      <span className="text-[12px] text-text-2 truncate">
                        Analysiere: <span className="font-medium text-text">{progress.currentGroup}</span>
                      </span>
                    </div>
                  )}

                  {/* Completed results */}
                  {suggestions.length > 0 && (
                    <div className="space-y-1 max-h-[38vh] overflow-y-auto pr-1">
                      {[...suggestions].reverse().map((s) => {
                        const meta = confidenceMeta[s.confidence];
                        const Icon = meta.icon;
                        return (
                          <div
                            key={s.counterparty}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-2/40 border border-border/40"
                          >
                            <CheckCircle2 size={13} className="text-accent shrink-0" />
                            <span className="text-[12px] text-text truncate flex-1 font-medium">{s.counterparty}</span>
                            <span className="text-[11px] text-text-3 shrink-0">{s.count} Tx</span>
                            <span className="text-[12px] text-text-2 shrink-0 max-w-[120px] truncate">{s.suggested_category}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${meta.color}`}>
                              <Icon size={9} />
                              {meta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {progress.status === 'error' && (
                    <div className="mt-3 p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-[12px] text-red-400">
                      {progress.error}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center justify-between mt-4">
                    <div>
                      {isLoading && (
                        <button
                          onClick={stop}
                          className="px-4 py-2 text-[13px] text-red-400 hover:text-red-300 rounded-lg hover:bg-red-400/10 transition-colors inline-flex items-center gap-2"
                        >
                          <span className="w-2.5 h-2.5 bg-current rounded-sm shrink-0" />
                          Stoppen
                        </button>
                      )}
                      {(progress.status === 'stopped' || progress.status === 'error') && (
                        <>
                          <button
                            onClick={reset}
                            className="px-4 py-2 text-[13px] text-text-3 hover:text-text rounded-lg hover:bg-surface-2 transition-colors"
                          >
                            Verwerfen
                          </button>
                          <button
                            onClick={() => start(filters)}
                            className="px-4 py-2 text-[13px] text-accent hover:text-accent/80 rounded-lg hover:bg-accent/10 transition-colors inline-flex items-center gap-2"
                          >
                            <Sparkles size={13} />
                            Neu starten
                          </button>
                        </>
                      )}
                    </div>
                    {suggestions.length > 0 && (
                      <button
                        onClick={() => setStep(2)}
                        className="text-[12px] text-accent hover:text-accent/80 transition-colors"
                      >
                        Vorschläge prüfen ({suggestions.length})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div>
              {/* Loading indicator at top of step 2 */}
              {isLoading && (
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-3 shrink-0 flex items-center gap-1.5">
                    <Loader2 size={10} className="animate-spin text-accent" />
                    Noch {progress.totalGroups - progress.completed} Gruppen...
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allSelected = filteredSuggestions.every(s => rowStates.get(s.counterparty)?.selected);
                      toggleAll(!allSelected);
                    }}
                    className="text-[12px] text-accent hover:text-accent/80 transition-colors"
                  >
                    {filteredSuggestions.every(s => rowStates.get(s.counterparty)?.selected) ? 'Keine auswählen' : 'Alle auswählen'}
                  </button>
                  <span className="text-[12px] text-text-3">
                    {selectedCount} von {filteredSuggestions.length} Gruppen ausgewählt
                  </span>
                </div>
                <div className="flex gap-1">
                  {(['all', 'high', 'medium', 'low'] as ConfidenceFilter[]).map(f => {
                    const labels: Record<ConfidenceFilter, string> = { all: 'Alle', high: 'Sicher', medium: 'Wahrsch.', low: 'Unsicher' };
                    return (
                      <button
                        key={f}
                        onClick={() => setConfidenceFilter(f)}
                        className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                          confidenceFilter === f
                            ? 'bg-accent text-white'
                            : 'bg-surface-2 text-text-3 hover:text-text'
                        }`}
                      >
                        {labels[f]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {filteredSuggestions.map((s) => {
                  const row = rowStates.get(s.counterparty);
                  if (!row) return null;
                  const meta = confidenceMeta[s.confidence];
                  const Icon = meta.icon;

                  return (
                    <div
                      key={s.counterparty}
                      className={`p-3 rounded-xl border transition-colors ${
                        row.selected ? 'border-accent/30 bg-accent/[0.03]' : 'border-border bg-surface'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => updateRow(s.counterparty, { selected: e.target.checked })}
                          className="mt-1 accent-accent"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[13px] font-medium text-text truncate">{s.counterparty}</span>
                            <span className="text-[11px] text-text-3 shrink-0">{s.count} Tx</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${meta.color}`}>
                              <Icon size={10} />
                              {meta.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <select
                              value={row.category}
                              onChange={(e) => updateRow(s.counterparty, { category: e.target.value })}
                              className="flex-1 px-2 py-1.5 bg-surface-2 border border-border rounded-lg text-[12px] text-text outline-none focus:border-accent"
                            >
                              {allCategories.map(c => (
                                <option key={c} value={c}>{c}{c === s.suggested_category && s.is_new_category ? ' (neu)' : ''}</option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1.5 text-[11px] text-text-3 shrink-0 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={row.createRule}
                                onChange={(e) => updateRow(s.counterparty, { createRule: e.target.checked })}
                                className="accent-accent"
                              />
                              Regel
                            </label>
                          </div>
                          {s.explanation && (
                            <p className="text-[11px] text-text-3 mt-1.5 italic">{s.explanation}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredSuggestions.length === 0 && (
                <div className="text-center py-8 text-[13px] text-text-3">
                  Keine Vorschläge für diesen Filter
                </div>
              )}

              <div className="flex justify-between items-center mt-5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="px-4 py-2 text-[13px] text-text-2 hover:text-text rounded-lg hover:bg-surface-2 transition-colors"
                  >
                    Zurück
                  </button>
                  {isLoading && (
                    <button
                      onClick={stop}
                      className="px-3 py-2 text-[12px] text-red-400 hover:text-red-300 rounded-lg hover:bg-red-400/10 transition-colors inline-flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 bg-current rounded-sm shrink-0" />
                      Stoppen
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isLoading && selectedCount > 0 && (
                    <span className="text-[11px] text-text-3">Stoppe die Analyse zuerst</span>
                  )}
                  <button
                    onClick={() => setStep(3)}
                    disabled={selectedCount === 0 || isLoading}
                    className="px-5 py-2 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Ausgewählte anwenden ({selectedCount})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm & Apply */}
          {step === 3 && (
            <div>
              <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-3">
                Zusammenfassung
              </label>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-text-3">Gruppen</span>
                  <span className="font-medium text-text">{selectedCount}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-text-3">Transaktionen</span>
                  <span className="font-medium text-text">{selectedTxCount}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-text-3">Neue Regeln</span>
                  <span className="font-medium text-text">{selectedRuleCount}</span>
                </div>
              </div>

              <div className="flex justify-between mt-5">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-[13px] text-text-2 hover:text-text rounded-lg hover:bg-surface-2 transition-colors"
                >
                  Zurück
                </button>
                <button
                  onClick={handleApply}
                  disabled={batchApply.isPending}
                  className="px-5 py-2 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors flex items-center gap-2"
                >
                  {batchApply.isPending && <Loader2 size={14} className="animate-spin" />}
                  Anwenden
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
