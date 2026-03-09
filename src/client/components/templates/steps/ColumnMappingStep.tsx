import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, AlertCircle } from 'lucide-react';

interface ColumnMapping {
  column?: string;
  fallbackIndex?: number;
  defaultValue?: string;
  joinColumns?: string[];
  joinSeparator?: string;
}

interface Props {
  headers: string[];
  sampleRows: string[][];
  columns: Record<string, ColumnMapping | undefined>;
  onUpdate: (columns: Record<string, ColumnMapping | undefined>) => void;
}

const FIELD_LABELS: Record<string, string> = {
  bu_date: 'Buchungsdatum',
  counterparty: 'Empfänger',
  amount: 'Betrag',
  account_number: 'Kontonummer',
  iban: 'IBAN',
  bank_name: 'Bankname',
  value_date: 'Valutadatum',
  type: 'Buchungstext',
  counterparty_iban: 'IBAN (Gegenkonto)',
  counterparty_bic: 'BIC (Gegenkonto)',
  purpose: 'Verwendungszweck',
  currency: 'Währung',
  balance_after: 'Saldo',
  creditor_id: 'Gläubiger-ID',
  mandate_reference: 'Mandatsreferenz',
  original_category: 'Originalkategorie',
};

const REQUIRED_FIELDS = ['bu_date', 'counterparty', 'amount'];
const OPTIONAL_FIELDS = [
  'account_number', 'iban', 'bank_name', 'value_date', 'type',
  'counterparty_iban', 'counterparty_bic', 'purpose', 'currency',
  'balance_after', 'creditor_id', 'mandate_reference', 'original_category',
];

type MappingMode = 'single' | 'join' | 'default';

function getPreviewValue(mapping: ColumnMapping | undefined, headers: string[], row: string[]): string {
  if (!mapping) return '–';
  if (mapping.defaultValue) return mapping.defaultValue;
  if (mapping.joinColumns && mapping.joinColumns.length > 0) {
    const sep = mapping.joinSeparator || ' ';
    return mapping.joinColumns
      .map((col) => {
        const idx = headers.indexOf(col);
        return idx >= 0 ? row[idx] || '' : '';
      })
      .filter(Boolean)
      .join(sep) || '–';
  }
  if (mapping.column) {
    const idx = headers.indexOf(mapping.column);
    if (idx >= 0) return row[idx] || '–';
    return '–';
  }
  if (mapping.fallbackIndex !== undefined) {
    return row[mapping.fallbackIndex] || '–';
  }
  return '–';
}

function getMappingMode(mapping: ColumnMapping | undefined): MappingMode {
  if (!mapping) return 'single';
  if (mapping.defaultValue) return 'default';
  if (mapping.joinColumns && mapping.joinColumns.length > 0) return 'join';
  return 'single';
}

function isMapped(mapping: ColumnMapping | undefined): boolean {
  if (!mapping) return false;
  if (mapping.defaultValue) return true;
  if (mapping.column) return true;
  if (mapping.joinColumns && mapping.joinColumns.length > 0) return true;
  if (mapping.fallbackIndex !== undefined) return true;
  return false;
}

function FieldRow({
  field, headers, sampleRows, mapping, onChange,
}: {
  field: string;
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping | undefined;
  onChange: (mapping: ColumnMapping | undefined) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRequired = REQUIRED_FIELDS.includes(field);
  const mapped = isMapped(mapping);
  const mode = getMappingMode(mapping);

  const setMode = (newMode: MappingMode) => {
    if (newMode === 'single') onChange({ column: '' });
    else if (newMode === 'join') onChange({ joinColumns: [], joinSeparator: ' ' });
    else onChange({ defaultValue: '' });
  };

  return (
    <div className={`rounded-xl border transition-colors ${
      expanded ? 'border-accent/30 bg-accent/3' : mapped ? 'border-border bg-surface' : 'border-border bg-surface'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          {isRequired && (
            <div className={`w-1.5 h-1.5 rounded-full ${mapped ? 'bg-accent' : 'bg-red-400'}`} />
          )}
          <span className="text-[13px] font-medium text-text">{FIELD_LABELS[field] || field}</span>
          <span className="text-[11px] font-mono text-text-3">{field}</span>
        </div>
        <div className="flex items-center gap-2">
          {mapped ? (
            <span className="flex items-center gap-1 text-[11px] font-mono text-accent">
              <Check size={12} />
              {mapping?.column || mapping?.joinColumns?.join('+') || mapping?.defaultValue || `[${mapping?.fallbackIndex}]`}
            </span>
          ) : (
            <span className="text-[11px] text-text-3">nicht zugeordnet</span>
          )}
          {expanded ? <ChevronUp size={14} className="text-text-3" /> : <ChevronDown size={14} className="text-text-3" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          {/* Mode tabs */}
          <div className="flex gap-1">
            {(['single', 'join', 'default'] as MappingMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
                  mode === m ? 'bg-accent text-white' : 'bg-surface-2 text-text-3 hover:text-text'
                }`}
              >
                {m === 'single' ? 'Einzelne Spalte' : m === 'join' ? 'Spalten verbinden' : 'Standardwert'}
              </button>
            ))}
          </div>

          {/* Single column mode */}
          {mode === 'single' && (
            <div className="space-y-2">
              <select
                value={mapping?.column || ''}
                onChange={(e) => onChange({ ...mapping, column: e.target.value, joinColumns: undefined, defaultValue: undefined })}
                className="w-full text-[12px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent cursor-pointer"
              >
                <option value="">— Spalte wählen —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <div>
                <label className="text-[11px] text-text-3">Fallback-Index (optional)</label>
                <input
                  type="number"
                  value={mapping?.fallbackIndex ?? ''}
                  onChange={(e) => onChange({ ...mapping, fallbackIndex: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="z.B. 3"
                  min={0}
                  className="w-full text-[12px] px-3 py-1.5 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent mt-1"
                />
              </div>
            </div>
          )}

          {/* Join mode */}
          {mode === 'join' && (
            <div className="space-y-2">
              <div className="text-[11px] text-text-3 mb-1">Spalten auswählen (Klick zum Hinzufügen/Entfernen)</div>
              <div className="flex flex-wrap gap-1.5">
                {headers.map((h) => {
                  const selected = mapping?.joinColumns?.includes(h) ?? false;
                  return (
                    <button
                      key={h}
                      onClick={() => {
                        const current = mapping?.joinColumns || [];
                        const next = selected ? current.filter((c) => c !== h) : [...current, h];
                        onChange({ ...mapping, joinColumns: next, column: undefined, defaultValue: undefined });
                      }}
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-full transition-colors ${
                        selected ? 'bg-accent text-white' : 'bg-surface-2 text-text-3 hover:text-text hover:bg-surface-2/80'
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
              <div>
                <label className="text-[11px] text-text-3">Trennzeichen</label>
                <input
                  value={mapping?.joinSeparator ?? ' '}
                  onChange={(e) => onChange({ ...mapping, joinSeparator: e.target.value })}
                  className="w-full text-[12px] font-mono px-3 py-1.5 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent mt-1"
                />
              </div>
            </div>
          )}

          {/* Default value mode */}
          {mode === 'default' && (
            <input
              value={mapping?.defaultValue ?? ''}
              onChange={(e) => onChange({ defaultValue: e.target.value, column: undefined, joinColumns: undefined })}
              placeholder="z.B. EUR"
              className="w-full text-[12px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
            />
          )}

          {/* Live preview */}
          {sampleRows.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-text-3 mb-1">Vorschau</div>
              <div className="space-y-0.5">
                {sampleRows.slice(0, 3).map((row, i) => (
                  <div key={i} className="text-[11px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1 truncate">
                    {getPreviewValue(mapping, headers, row)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clear mapping */}
          {mapped && !isRequired && (
            <button
              onClick={() => onChange(undefined)}
              className="text-[11px] text-text-3 hover:text-red-400 transition-colors"
            >
              Zuordnung entfernen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ColumnMappingStep({ headers, sampleRows, columns, onUpdate }: Props) {
  const requiredMapped = REQUIRED_FIELDS.every((f) => isMapped(columns[f]));

  const updateField = (field: string, mapping: ColumnMapping | undefined) => {
    const next = { ...columns };
    if (mapping) next[field] = mapping;
    else delete next[field];
    onUpdate(next);
  };

  return (
    <div className="space-y-4">
      {!requiredMapped && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <span className="text-[12px] text-amber-600">
            Pflichtfelder (Buchungsdatum, Empfänger, Betrag) müssen zugeordnet werden.
          </span>
        </div>
      )}

      {/* Required fields */}
      <div>
        <div className="text-[12px] font-semibold text-text-2 mb-2">Pflichtfelder</div>
        <div className="space-y-2">
          {REQUIRED_FIELDS.map((f) => (
            <FieldRow
              key={f}
              field={f}
              headers={headers}
              sampleRows={sampleRows}
              mapping={columns[f]}
              onChange={(m) => updateField(f, m)}
            />
          ))}
        </div>
      </div>

      {/* Optional fields */}
      <div>
        <div className="text-[12px] font-semibold text-text-2 mb-2">Optionale Felder</div>
        <div className="space-y-2">
          {OPTIONAL_FIELDS.map((f) => (
            <FieldRow
              key={f}
              field={f}
              headers={headers}
              sampleRows={sampleRows}
              mapping={columns[f]}
              onChange={(m) => updateField(f, m)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Export for use in wizard validation
export { REQUIRED_FIELDS, isMapped };
