import { useState, useEffect } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import type { Transaction, PatternSuggestion } from '../../api/hooks';
import {
  useCategoryList,
  useRecategorize,
  useRecategorizePreview,
  useSuggestPattern,
} from '../../api/hooks';
import { useToast } from '../layout/Toast';
import { fmtDate, fmt } from '../../lib/format';
import { useConfirmClose, ConfirmCloseBar } from '../../lib/useConfirmClose';

interface RecategorizeDialogProps {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
}

type Step = 1 | 2 | 3 | 4;
type Mode = 'single' | 'counterparty' | 'pattern';

export function RecategorizeDialog({ transaction, open, onClose }: RecategorizeDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [newCategory, setNewCategory] = useState(transaction.category || '');
  const [mode, setMode] = useState<Mode>('single');
  const [createRule, setCreateRule] = useState(false);
  const [suggestion, setSuggestion] = useState<PatternSuggestion | null>(null);
  const [rulePattern, setRulePattern] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<string>('keyword');
  const [ruleMatchField, setRuleMatchField] = useState<string>('counterparty');

  const { data: categories = [] } = useCategoryList();
  const recategorize = useRecategorize();
  const preview = useRecategorizePreview();
  const suggestPattern = useSuggestPattern();
  const { toast } = useToast();

  // Dirty when user has progressed past step 1 or changed the category
  const isDirty = step > 1 || (newCategory !== (transaction.category || '') && newCategory.trim() !== '');
  const { showConfirm, requestClose, confirmClose, cancelClose } = useConfirmClose(isDirty, onClose);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setNewCategory(transaction.category || '');
      setMode('single');
      setCreateRule(false);
      setSuggestion(null);
    }
  }, [open, transaction]);

  // Fetch preview when mode changes in step 2
  useEffect(() => {
    if (step === 2 && newCategory) {
      preview.mutate({ transaction_id: transaction.id, category: newCategory, mode });
    }
  }, [step, mode]);

  // Fetch AI suggestion when entering step 3
  useEffect(() => {
    if (step === 3) {
      suggestPattern.mutate(
        { transaction_id: transaction.id, category: newCategory },
        {
          onSuccess: (data) => {
            setSuggestion(data);
            setRulePattern(data.pattern);
            setRuleMatchType(data.match_type);
            setRuleMatchField(data.match_field);
          },
          onError: () => {
            // Fallback
            const fallback = transaction.counterparty || '';
            setSuggestion({
              pattern: fallback,
              match_type: 'keyword',
              match_field: 'counterparty',
              explanation: 'KI nicht verfügbar – einfaches Stichwort basierend auf dem Empfänger vorgeschlagen.',
            });
            setRulePattern(fallback);
            setRuleMatchType('keyword');
            setRuleMatchField('counterparty');
          },
        },
      );
    }
  }, [step]);

  const handleApply = () => {
    recategorize.mutate(
      {
        transaction_id: transaction.id,
        category: newCategory,
        mode,
        create_rule: createRule,
        rule: createRule ? { pattern: rulePattern, match_type: ruleMatchType, match_field: ruleMatchField } : undefined,
      },
      {
        onSuccess: (data) => {
          toast(`${data.updated} Transaktion${data.updated !== 1 ? 'en' : ''} aktualisiert`);
          onClose();
        },
        onError: (err) => toast('Fehler: ' + err.message, 'error'),
      },
    );
  };

  if (!open) return null;

  const affectedCount = preview.data?.affected_count ?? (mode === 'single' ? 1 : 0);
  const samples = preview.data?.sample_transactions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={requestClose}>
      <div
        className="bg-surface rounded-2xl shadow-card-hover border border-border w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Confirm close banner */}
        {showConfirm && <ConfirmCloseBar onConfirm={confirmClose} onCancel={cancelClose} />}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-[15px] text-text">Kategorie ändern</h3>
          <button onClick={requestClose} className="p-1 rounded-lg hover:bg-surface-2 text-text-3 hover:text-text transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Step indicator */}
          <div className="flex gap-1 mb-5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-accent' : 'bg-surface-2'
                }`}
              />
            ))}
          </div>

          {/* Step 1: New category */}
          {step === 1 && (
            <div>
              <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-2">
                Neue Kategorie
              </label>
              <select
                value={categories.includes(newCategory) ? newCategory : '__custom__'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setNewCategory('');
                  } else {
                    setNewCategory(e.target.value);
                  }
                }}
                className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-[13px] text-text outline-none focus:border-accent"
                autoFocus
              >
                <option value="" disabled>Kategorie wählen...</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">+ Neue Kategorie...</option>
              </select>
              {(!categories.includes(newCategory) || newCategory === '') && (
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full mt-2 px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-[13px] text-text outline-none focus:border-accent"
                  placeholder="Neue Kategorie eingeben..."
                />
              )}
              <div className="mt-4 p-3 bg-surface-2/50 rounded-lg text-[12px] text-text-3">
                <div className="font-medium text-text-2 mb-1">{transaction.counterparty || '—'}</div>
                <div>{transaction.description}</div>
                <div className="mt-1">{fmtDate(transaction.bu_date)} · {transaction.direction === 'credit' ? '+' : '−'} {fmt(transaction.amount)}</div>
              </div>
              <div className="flex justify-end mt-5">
                <button
                  onClick={() => setStep(2)}
                  disabled={!newCategory.trim() || newCategory === transaction.category}
                  className="px-5 py-2 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Weiter
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Scope selection */}
          {step === 2 && (
            <div>
              <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-3">
                Umfang wählen
              </label>
              <div className="space-y-2">
                {(['single', 'counterparty', 'pattern'] as Mode[]).map((m) => {
                  const labels: Record<Mode, string> = {
                    single: 'Nur diese Transaktion',
                    counterparty: `Alle Transaktionen von/an "${transaction.counterparty || '—'}"`,
                    pattern: `Alle mit gleichem Muster (Empfänger + ähnlicher Betrag)`,
                  };
                  return (
                    <label
                      key={m}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        mode === m ? 'border-accent bg-accent/4' : 'border-border hover:bg-surface-2/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        value={m}
                        checked={mode === m}
                        onChange={() => setMode(m)}
                        className="mt-0.5 accent-accent"
                      />
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-text">{labels[m]}</div>
                        {mode === m && (
                          <div className="text-[12px] text-text-3 mt-1">
                            {preview.isPending ? (
                              <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Lade...</span>
                            ) : (
                              `${affectedCount} Transaktion${affectedCount !== 1 ? 'en' : ''} betroffen`
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Sample transactions */}
              {samples.length > 0 && mode !== 'single' && (
                <div className="mt-3 p-3 bg-surface-2/50 rounded-lg">
                  <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-2">Beispiele</div>
                  {samples.slice(0, 3).map((s) => (
                    <div key={s.id} className="text-[12px] text-text-2 py-1 border-b border-border/40 last:border-0">
                      {s.counterparty} · {fmtDate(s.bu_date)} · {s.direction === 'credit' ? '+' : '−'} {fmt(s.amount)}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between mt-5">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-[13px] text-text-2 hover:text-text rounded-lg hover:bg-surface-2 transition-colors">
                  Zurück
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-5 py-2 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
                >
                  Weiter
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Rule suggestion */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-accent" />
                <span className="text-[13px] font-medium text-text">Regel erstellen?</span>
              </div>
              <p className="text-[12px] text-text-3 mb-4">
                Möchtest du eine Regel erstellen, damit diese Kategorie zukünftig automatisch erkannt wird?
              </p>

              {suggestPattern.isPending ? (
                <div className="flex items-center gap-2 text-[13px] text-text-3 py-4">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  KI analysiert Muster...
                </div>
              ) : suggestion ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-1.5">Typ</label>
                      <select
                        value={ruleMatchType}
                        onChange={(e) => setRuleMatchType(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-[13px] text-text outline-none focus:border-accent"
                      >
                        <option value="regex">Regex</option>
                        <option value="keyword">Stichwort</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-1.5">Feld</label>
                      <select
                        value={ruleMatchField}
                        onChange={(e) => setRuleMatchField(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-[13px] text-text outline-none focus:border-accent"
                      >
                        <option value="description">Beschreibung</option>
                        <option value="counterparty">Empfänger</option>
                        <option value="both">Beides</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-1.5">Muster</label>
                    <input
                      value={rulePattern}
                      onChange={(e) => setRulePattern(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-[13px] text-text font-mono outline-none focus:border-accent"
                    />
                    <p className="text-[11px] text-text-3 mt-1">
                      {ruleMatchType === 'regex'
                        ? 'Regulärer Ausdruck — mehrere Begriffe mit | trennen'
                        : 'Einfaches Stichwort — Groß-/Kleinschreibung wird ignoriert'}
                    </p>
                  </div>
                  {suggestion.explanation && (
                    <p className="text-[11px] text-text-3 italic">{suggestion.explanation}</p>
                  )}
                </div>
              ) : null}

              <div className="flex justify-between mt-5">
                <button onClick={() => setStep(2)} className="px-4 py-2 text-[13px] text-text-2 hover:text-text rounded-lg hover:bg-surface-2 transition-colors">
                  Zurück
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCreateRule(false); setStep(4); }}
                    className="px-4 py-2 text-[13px] text-text-2 hover:text-text rounded-lg hover:bg-surface-2 transition-colors"
                  >
                    Überspringen
                  </button>
                  <button
                    onClick={() => { setCreateRule(true); setStep(4); }}
                    disabled={!rulePattern.trim()}
                    className="px-5 py-2 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Regel speichern & Anwenden
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div>
              <label className="block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-3">
                Zusammenfassung
              </label>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-text-3">Neue Kategorie</span>
                  <span className="font-medium text-text">{newCategory}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/40">
                  <span className="text-text-3">Transaktionen</span>
                  <span className="font-medium text-text">
                    {affectedCount} Transaktion{affectedCount !== 1 ? 'en' : ''}
                  </span>
                </div>
                {createRule && (
                  <div className="flex justify-between py-2 border-b border-border/40">
                    <span className="text-text-3">Neue Regel</span>
                    <span className="font-mono text-[12px] text-text">{rulePattern}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between mt-5">
                <button onClick={() => setStep(3)} className="px-4 py-2 text-[13px] text-text-2 hover:text-text rounded-lg hover:bg-surface-2 transition-colors">
                  Zurück
                </button>
                <button
                  onClick={handleApply}
                  disabled={recategorize.isPending}
                  className="px-5 py-2 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-40 transition-colors flex items-center gap-2"
                >
                  {recategorize.isPending && <Loader2 size={14} className="animate-spin" />}
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
