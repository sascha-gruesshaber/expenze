import { Plus, Trash2 } from 'lucide-react';

interface FallbackRule {
  field: string;
  when: 'empty';
  copyFrom: string;
}

interface Props {
  typeMap: Record<string, string>;
  fallbacks: FallbackRule[];
  onUpdate: (patch: { typeMap?: Record<string, string>; fallbacks?: FallbackRule[] }) => void;
}

const FIELD_OPTIONS = [
  'counterparty', 'type', 'purpose', 'description',
  'counterparty_iban', 'counterparty_bic', 'value_date',
];

export default function AdvancedStep({ typeMap, fallbacks, onUpdate }: Props) {
  const typeEntries = Object.entries(typeMap);

  const addTypeEntry = () => {
    onUpdate({ typeMap: { ...typeMap, '': '' } });
  };

  const updateTypeEntry = (oldKey: string, newKey: string, value: string) => {
    const next = { ...typeMap };
    if (oldKey !== newKey) delete next[oldKey];
    next[newKey] = value;
    onUpdate({ typeMap: next });
  };

  const removeTypeEntry = (key: string) => {
    const next = { ...typeMap };
    delete next[key];
    onUpdate({ typeMap: next });
  };

  const addFallback = () => {
    onUpdate({ fallbacks: [...fallbacks, { field: 'counterparty', when: 'empty', copyFrom: 'type' }] });
  };

  const updateFallback = (index: number, patch: Partial<FallbackRule>) => {
    const next = fallbacks.map((fb, i) => i === index ? { ...fb, ...patch } : fb);
    onUpdate({ fallbacks: next });
  };

  const removeFallback = (index: number) => {
    onUpdate({ fallbacks: fallbacks.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-text-2">
        Optionale erweiterte Einstellungen. Dieser Schritt kann übersprungen werden.
      </p>

      {/* Type Map */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[12px] font-semibold text-text-2">Typ-Zuordnung</div>
            <div className="text-[11px] text-text-3">Buchungstext aus der CSV auf interne Typen mappen</div>
          </div>
          <button
            onClick={addTypeEntry}
            className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-2 transition-colors"
          >
            <Plus size={12} />
            Hinzufügen
          </button>
        </div>
        {typeEntries.length > 0 ? (
          <div className="space-y-2">
            {typeEntries.map(([key, value], i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={key}
                  onChange={(e) => updateTypeEntry(key, e.target.value, value)}
                  placeholder="CSV-Wert"
                  className="flex-1 text-[12px] font-mono px-3 py-1.5 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
                />
                <span className="text-[12px] text-text-3">→</span>
                <input
                  value={value}
                  onChange={(e) => updateTypeEntry(key, key, e.target.value)}
                  placeholder="Interner Typ"
                  className="flex-1 text-[12px] font-mono px-3 py-1.5 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
                />
                <button
                  onClick={() => removeTypeEntry(key)}
                  className="p-1 text-text-3 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-text-3 bg-surface-2 rounded-lg px-3 py-2">
            Keine Typ-Zuordnungen definiert.
          </div>
        )}
      </div>

      {/* Fallback Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[12px] font-semibold text-text-2">Fallback-Regeln</div>
            <div className="text-[11px] text-text-3">Wenn ein Feld leer ist, Wert aus anderem Feld kopieren</div>
          </div>
          <button
            onClick={addFallback}
            className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-2 transition-colors"
          >
            <Plus size={12} />
            Hinzufügen
          </button>
        </div>
        {fallbacks.length > 0 ? (
          <div className="space-y-2">
            {fallbacks.map((fb, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[12px] text-text-3 shrink-0">Wenn</span>
                <select
                  value={fb.field}
                  onChange={(e) => updateFallback(i, { field: e.target.value })}
                  className="text-[12px] px-2 py-1.5 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent cursor-pointer"
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <span className="text-[12px] text-text-3 shrink-0">leer → kopiere</span>
                <select
                  value={fb.copyFrom}
                  onChange={(e) => updateFallback(i, { copyFrom: e.target.value })}
                  className="text-[12px] px-2 py-1.5 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent cursor-pointer"
                >
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeFallback(i)}
                  className="p-1 text-text-3 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-text-3 bg-surface-2 rounded-lg px-3 py-2">
            Keine Fallback-Regeln definiert.
          </div>
        )}
      </div>
    </div>
  );
}
