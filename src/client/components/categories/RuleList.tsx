import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { CategoryRule } from '../../api/hooks';
import { useUpdateCategoryRule, useDeleteCategoryRule } from '../../api/hooks';
import { useToast } from '../layout/Toast';
import { RuleForm } from './RuleForm';

interface RuleListProps {
  rules: CategoryRule[];
  category: string;
}

export function RuleList({ rules, category }: RuleListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const updateRule = useUpdateCategoryRule();
  const deleteRule = useDeleteCategoryRule();
  const { toast } = useToast();

  const categoryRules = rules.filter(r => r.category === category);

  if (categoryRules.length === 0) {
    return <div className="text-[12px] text-text-3 py-2">Keine Regeln</div>;
  }

  return (
    <div className="space-y-2">
      {categoryRules.map((rule) => (
        <div key={rule.id}>
          {editingId === rule.id ? (
            <div className="bg-surface rounded-xl p-4 border border-accent/30">
              <RuleForm
                initial={{
                  category: rule.category,
                  pattern: rule.pattern,
                  match_field: rule.match_field,
                  match_type: rule.match_type,
                  priority: rule.priority,
                }}
                onSubmit={(data) => {
                  updateRule.mutate({ id: rule.id, ...data }, {
                    onSuccess: () => { toast('Regel aktualisiert'); setEditingId(null); },
                    onError: (err) => toast('Fehler: ' + err.message, 'error'),
                  });
                }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-2/50 group">
              <div className="flex-1 min-w-0">
                <code className="text-[12px] text-text font-mono break-all">{rule.pattern}</code>
                <div className="flex gap-2 mt-0.5">
                  <span className="text-[10px] text-text-3">
                    {rule.match_type === 'regex' ? 'Regex' : 'Stichwort'}
                  </span>
                  <span className="text-[10px] text-text-3">
                    {rule.match_field === 'description' ? 'Beschreibung' : rule.match_field === 'counterparty' ? 'Empfänger' : 'Beides'}
                  </span>
                  <span className="text-[10px] text-text-3">P{rule.priority}</span>
                  {rule.is_default && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-accent/8 text-accent rounded">Standard</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingId(rule.id)}
                  className="p-1.5 rounded-lg hover:bg-surface-2 text-text-3 hover:text-text transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => {
                    if (confirm('Regel löschen?')) {
                      deleteRule.mutate(rule.id, {
                        onSuccess: () => toast('Regel gelöscht'),
                        onError: (err) => toast('Fehler: ' + err.message, 'error'),
                      });
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-exp-red/8 text-text-3 hover:text-exp-red transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
