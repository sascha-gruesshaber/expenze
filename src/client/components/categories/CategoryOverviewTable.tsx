import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, PiggyBank, Archive, ArrowLeftRight, Tag } from 'lucide-react';
import { useCategoryOverview, useCategoryRules, useCreateCategoryRule, useUpdateCategoryMeta, type CategoryOverview } from '../../api/hooks';
import { fmt } from '../../lib/format';
import { useToast } from '../layout/Toast';
import { RuleList } from './RuleList';
import { RuleForm } from './RuleForm';
import { DeleteCategoryDialog } from './DeleteCategoryDialog';
import type { FilterState } from '../../lib/filterContext';

const CATEGORY_TYPES = [
  { value: 'default', label: 'Standard', icon: null, color: 'text-text-3' },
  { value: 'savings', label: 'Sparen', icon: PiggyBank, color: 'text-accent' },
  { value: 'transfer', label: 'Umbuchung', icon: ArrowLeftRight, color: 'text-blue-400' },
] as const;

const TYPE_LABELS: Record<string, string> = {
  default: 'Typ: Standard',
  savings: 'Als Spar-Kategorie markiert',
  transfer: 'Als Umbuchung markiert — wird in Analysen ignoriert',
  fallback: 'Standard-Auffangkategorie',
};

interface Props {
  filters?: FilterState;
}

export function CategoryOverviewTable({ filters }: Props) {
  const { data: overview = [] } = useCategoryOverview(filters);
  const { data: rules = [] } = useCategoryRules();
  const createRule = useCreateCategoryRule();
  const updateCategory = useUpdateCategoryMeta();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CategoryOverview | null>(null);
  const [typeMenuFor, setTypeMenuFor] = useState<number | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) {
        setTypeMenuFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (cat: string) => {
    setExpanded(expanded === cat ? null : cat);
    setAddingFor(null);
  };

  const startRename = (cat: CategoryOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(cat.category_id);
    setRenameValue(cat.category);
  };

  const submitRename = (cat: CategoryOverview) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === cat.category) {
      setRenamingId(null);
      return;
    }
    updateCategory.mutate(
      { id: cat.category_id, name: trimmed },
      {
        onSuccess: () => { toast('Kategorie umbenannt'); setRenamingId(null); },
        onError: (err) => toast('Fehler: ' + err.message, 'error'),
      },
    );
  };

  const setCategoryType = (cat: CategoryOverview, newType: string) => {
    if (cat.category_type === newType) { setTypeMenuFor(null); return; }
    updateCategory.mutate(
      { id: cat.category_id, category_type: newType },
      {
        onSuccess: () => { toast(TYPE_LABELS[newType] || 'Typ geändert'); setTypeMenuFor(null); },
        onError: (err) => toast('Fehler: ' + err.message, 'error'),
      },
    );
  };

  const isSonstiges = (cat: string) => cat === 'Sonstiges';

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_100px_100px_60px_80px] gap-2 px-4 py-2 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        <div>Kategorie</div>
        <div className="text-right">Buchungen</div>
        <div className="text-right">Ausgaben</div>
        <div className="text-right">Einnahmen</div>
        <div className="text-right">Regeln</div>
        <div></div>
      </div>

      {overview.map((cat) => {
        const isExpanded = expanded === cat.category;
        const isRenaming = renamingId === cat.category_id;
        const isEmpty = cat.tx_count === 0;

        return (
          <div key={cat.category_id} className={`bg-surface rounded-xl border border-border ${isEmpty ? 'opacity-60' : ''}`}>
            <div
              className="grid grid-cols-[1fr_80px_100px_100px_60px_80px] gap-2 items-center px-4 py-3 cursor-pointer hover:bg-surface-2/50 transition-colors"
              onClick={() => !isRenaming && toggle(cat.category)}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isExpanded ? <ChevronDown size={14} className="text-text-3 shrink-0" /> : <ChevronRight size={14} className="text-text-3 shrink-0" />}
                {isRenaming ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(cat);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                      className="flex-1 min-w-0 text-[13px] font-medium bg-transparent border border-accent/40 rounded px-2 py-0.5 outline-none text-text"
                    />
                    <button onClick={() => submitRename(cat)} className="text-accent hover:text-accent/80"><Check size={14} /></button>
                    <button onClick={() => setRenamingId(null)} className="text-text-3 hover:text-text"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <span className="text-[13px] font-medium text-text truncate">{cat.category}</span>
                    {cat.category_type === 'savings' && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
                        <PiggyBank size={10} /> Sparen
                      </span>
                    )}
                    {cat.category_type === 'fallback' && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-text-3/10 text-text-3">
                        <Archive size={10} /> Standard
                      </span>
                    )}
                    {cat.category_type === 'transfer' && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400">
                        <ArrowLeftRight size={10} /> Umbuchung
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="text-[13px] text-text-2 text-right">{cat.tx_count}</div>
              <div className="text-[13px] text-exp-red text-right font-medium">
                {cat.total_debit > 0 ? fmt(cat.total_debit) : '—'}
              </div>
              <div className="text-[13px] text-accent text-right font-medium">
                {cat.total_credit > 0 ? fmt(cat.total_credit) : '—'}
              </div>
              <div className="text-[13px] text-text-2 text-right">{cat.rule_count}</div>
              <div className="flex items-center justify-end gap-1">
                {!isSonstiges(cat.category) && !isRenaming && (
                  <>
                    <div className="relative" ref={typeMenuFor === cat.category_id ? typeMenuRef : undefined}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTypeMenuFor(typeMenuFor === cat.category_id ? null : cat.category_id); }}
                        className={`p-1 transition-colors rounded ${cat.category_type !== 'default' ? (cat.category_type === 'savings' ? 'text-accent' : 'text-blue-400') : 'text-text-3 hover:text-accent'}`}
                        title={TYPE_LABELS[cat.category_type] || 'Typ ändern'}
                      >
                        <Tag size={13} />
                      </button>
                      {typeMenuFor === cat.category_id && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                          {CATEGORY_TYPES.map((t) => (
                            <button
                              key={t.value}
                              onClick={() => setCategoryType(cat, t.value)}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-surface-2/50 transition-colors ${cat.category_type === t.value ? 'font-semibold ' + t.color : 'text-text-2'}`}
                            >
                              {t.icon ? <t.icon size={12} /> : <span className="w-3" />}
                              {t.label}
                              {cat.category_type === t.value && <Check size={11} className="ml-auto" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => startRename(cat, e)}
                      className="p-1 text-text-3 hover:text-accent transition-colors rounded"
                      title="Umbenennen"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(cat); }}
                      className="p-1 text-text-3 hover:text-exp-red transition-colors rounded"
                      title="Löschen"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-border/60">
                <div className="pt-3">
                  <RuleList rules={rules} category={cat.category} />
                  {addingFor === cat.category ? (
                    <div className="mt-3 bg-surface rounded-xl p-4 border border-accent/30">
                      <RuleForm
                        initial={{
                          category: cat.category,
                          pattern: '',
                          match_field: 'description',
                          match_type: 'regex',
                          priority: 100,
                        }}
                        onSubmit={(data) => {
                          createRule.mutate(data, {
                            onSuccess: () => { toast('Regel erstellt'); setAddingFor(null); },
                            onError: (err) => toast('Fehler: ' + err.message, 'error'),
                          });
                        }}
                        onCancel={() => setAddingFor(null)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddingFor(cat.category); }}
                      className="mt-2 flex items-center gap-1.5 text-[12px] text-accent hover:text-accent/80 transition-colors"
                    >
                      <Plus size={14} /> Regel hinzufügen
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {overview.length === 0 && (
        <div className="text-center py-12 text-text-3 text-[14px]">Keine Kategorien vorhanden</div>
      )}

      {deleteTarget && (
        <DeleteCategoryDialog
          category={deleteTarget}
          allCategories={overview}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
