import { useState } from 'react';
import { useCategoryList } from '../../api/hooks';

interface RuleFormProps {
  initial?: {
    category: string;
    pattern: string;
    match_field: string;
    match_type: string;
    priority: number;
  };
  onSubmit: (data: { category: string; pattern: string; match_field: string; match_type: string; priority: number }) => void;
  onCancel: () => void;
}

export function RuleForm({ initial, onSubmit, onCancel }: RuleFormProps) {
  const [category, setCategory] = useState(initial?.category || '');
  const [pattern, setPattern] = useState(initial?.pattern || '');
  const [matchField, setMatchField] = useState(initial?.match_field || 'description');
  const [matchType, setMatchType] = useState(initial?.match_type || 'regex');
  const [priority, setPriority] = useState(initial?.priority ?? 100);
  const [error, setError] = useState('');
  const { data: categories = [] } = useCategoryList();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category.trim() || !pattern.trim()) {
      setError('Kategorie und Muster sind erforderlich');
      return;
    }
    if (matchType === 'regex') {
      try { new RegExp(pattern); } catch { setError('Ungültiger regulärer Ausdruck'); return; }
    }
    setError('');
    onSubmit({ category: category.trim(), pattern: pattern.trim(), match_field: matchField, match_type: matchType, priority });
  };

  const inputClass = 'w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-[13px] text-text outline-none focus:border-accent';
  const labelClass = 'block text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Kategorie</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list="category-suggestions"
          className={inputClass}
          placeholder="z.B. Lebensmittel & Einkauf"
        />
        <datalist id="category-suggestions">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>
      <div>
        <label className={labelClass}>Muster</label>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className={inputClass}
          placeholder={matchType === 'regex' ? 'REWE|LIDL|ALDI' : 'REWE'}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Typ</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value)} className={inputClass}>
            <option value="regex">Regex</option>
            <option value="keyword">Stichwort</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Feld</label>
          <select value={matchField} onChange={(e) => setMatchField(e.target.value)} className={inputClass}>
            <option value="description">Beschreibung</option>
            <option value="counterparty">Empfänger</option>
            <option value="both">Beides</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Priorität</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 100)}
            className={inputClass}
          />
        </div>
      </div>
      {error && <div className="text-[12px] text-exp-red">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[13px] text-text-2 hover:text-text rounded-lg hover:bg-surface-2 transition-colors">
          Abbrechen
        </button>
        <button type="submit" className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors">
          Speichern
        </button>
      </div>
    </form>
  );
}
