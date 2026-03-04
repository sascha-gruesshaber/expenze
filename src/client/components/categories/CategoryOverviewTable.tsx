import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useCategoryOverview, useCategoryRules, useCreateCategoryRule } from '../../api/hooks';
import { fmt } from '../../lib/format';
import { useToast } from '../layout/Toast';
import { RuleList } from './RuleList';
import { RuleForm } from './RuleForm';

export function CategoryOverviewTable() {
  const { data: overview = [] } = useCategoryOverview();
  const { data: rules = [] } = useCategoryRules();
  const createRule = useCreateCategoryRule();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const toggle = (cat: string) => {
    setExpanded(expanded === cat ? null : cat);
    setAddingFor(null);
  };

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_100px_100px_60px] gap-2 px-4 py-2 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        <div>Kategorie</div>
        <div className="text-right">Buchungen</div>
        <div className="text-right">Ausgaben</div>
        <div className="text-right">Einnahmen</div>
        <div className="text-right">Regeln</div>
      </div>

      {overview.map((cat) => {
        const isExpanded = expanded === cat.category;
        return (
          <div key={cat.category} className="bg-surface rounded-xl border border-border overflow-hidden">
            <div
              className="grid grid-cols-[1fr_80px_100px_100px_60px] gap-2 items-center px-4 py-3 cursor-pointer hover:bg-surface-2/50 transition-colors"
              onClick={() => toggle(cat.category)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown size={14} className="text-text-3" /> : <ChevronRight size={14} className="text-text-3" />}
                <span className="text-[13px] font-medium text-text">{cat.category}</span>
              </div>
              <div className="text-[13px] text-text-2 text-right">{cat.tx_count}</div>
              <div className="text-[13px] text-exp-red text-right font-medium">
                {cat.total_debit > 0 ? fmt(cat.total_debit) : '—'}
              </div>
              <div className="text-[13px] text-accent text-right font-medium">
                {cat.total_credit > 0 ? fmt(cat.total_credit) : '—'}
              </div>
              <div className="text-[13px] text-text-2 text-right">{cat.rule_count}</div>
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
    </div>
  );
}
