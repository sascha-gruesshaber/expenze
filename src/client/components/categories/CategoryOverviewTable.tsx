import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, PiggyBank } from 'lucide-react';
import { useCategoryOverview, useCategoryRules, useCreateCategoryRule, useUpdateCategoryMeta, type CategoryOverview } from '../../api/hooks';
import { fmt } from '../../lib/format';
import { useToast } from '../layout/Toast';
import { RuleList } from './RuleList';
import { RuleForm } from './RuleForm';
import { DeleteCategoryDialog } from './DeleteCategoryDialog';
import type { FilterState } from '../../lib/filterContext';

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

  const toggleSavings = (cat: CategoryOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    const newType = cat.category_type === 'savings' ? 'default' : 'savings';
    updateCategory.mutate(
      { id: cat.category_id, category_type: newType },
      {
        onSuccess: () => toast(newType === 'savings' ? 'Als Spar-Kategorie markiert' : 'Spar-Markierung entfernt'),
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
          <div key={cat.category_id} className={`bg-surface rounded-xl border border-border overflow-hidden ${isEmpty ? 'opacity-60' : ''}`}>
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
                    <button
                      onClick={(e) => toggleSavings(cat, e)}
                      className={`p-1 transition-colors rounded ${cat.category_type === 'savings' ? 'text-accent' : 'text-text-3 hover:text-accent'}`}
                      title={cat.category_type === 'savings' ? 'Spar-Markierung entfernen' : 'Als Spar-Kategorie markieren'}
                    >
                      <PiggyBank size={13} />
                    </button>
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
