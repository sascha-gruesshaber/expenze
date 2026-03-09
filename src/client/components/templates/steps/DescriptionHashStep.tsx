interface Props {
  descriptionTemplate: string;
  hashFields: string[];
  headers: string[];
  sampleRows: string[][];
  columns: Record<string, any>;
  onUpdate: (patch: { descriptionTemplate?: string; hashFields?: string[] }) => void;
}

const VARIABLE_TOKENS = [
  '{type}', '{purpose}', '{counterparty}', '{amount}', '{bu_date}',
  '{value_date}', '{currency}', '{original_category}',
];

const HASH_OPTIONS = [
  'bu_date', 'amount', 'direction', 'counterparty', 'description',
  'type', 'purpose', 'value_date', 'counterparty_iban',
];

function resolvePreview(template: string, headers: string[], row: string[], columns: Record<string, any>): string {
  let result = template;
  // Replace {field} tokens with sample values from mapped columns
  for (const [field, mapping] of Object.entries(columns)) {
    if (!mapping) continue;
    let value = '';
    if (mapping.column) {
      const idx = headers.indexOf(mapping.column);
      if (idx >= 0) value = row[idx] || '';
    } else if (mapping.joinColumns) {
      value = mapping.joinColumns
        .map((col: string) => { const idx = headers.indexOf(col); return idx >= 0 ? row[idx] || '' : ''; })
        .filter(Boolean)
        .join(mapping.joinSeparator || ' ');
    } else if (mapping.defaultValue) {
      value = mapping.defaultValue;
    }
    result = result.replace(new RegExp(`\\{${field}\\}`, 'g'), value);
  }
  // Replace {_col:Name} references
  result = result.replace(/\{_col:([^}]+)\}/g, (_, colName) => {
    const idx = headers.indexOf(colName);
    return idx >= 0 ? row[idx] || '' : '';
  });
  return result;
}

export default function DescriptionHashStep({
  descriptionTemplate, hashFields, headers, sampleRows, columns, onUpdate,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Description template */}
      <div>
        <label className="block text-[12px] font-semibold text-text-2 mb-2">Beschreibungsvorlage</label>
        <p className="text-[12px] text-text-3 mb-2">
          Aus diesen Feldern wird die Transaktionsbeschreibung zusammengesetzt.
        </p>
        <input
          value={descriptionTemplate}
          onChange={(e) => onUpdate({ descriptionTemplate: e.target.value })}
          placeholder="z.B. {type} {purpose}"
          className="w-full text-[13px] font-mono px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
        />

        {/* Variable chips */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {VARIABLE_TOKENS.map((token) => (
            <button
              key={token}
              onClick={() => {
                const newVal = descriptionTemplate ? `${descriptionTemplate} ${token}` : token;
                onUpdate({ descriptionTemplate: newVal });
              }}
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent/8 text-accent hover:bg-accent/15 transition-colors"
            >
              {token}
            </button>
          ))}
          {/* Also offer raw column references */}
          {headers.slice(0, 8).map((h) => (
            <button
              key={`col-${h}`}
              onClick={() => {
                const token = `{_col:${h}}`;
                const newVal = descriptionTemplate ? `${descriptionTemplate} ${token}` : token;
                onUpdate({ descriptionTemplate: newVal });
              }}
              className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-3 hover:text-text hover:bg-surface-2/80 transition-colors"
            >
              {`{_col:${h}}`}
            </button>
          ))}
        </div>

        {/* Preview */}
        {sampleRows.length > 0 && descriptionTemplate && (
          <div className="mt-3">
            <div className="text-[11px] font-medium text-text-3 mb-1">Vorschau</div>
            <div className="space-y-0.5">
              {sampleRows.slice(0, 3).map((row, i) => (
                <div key={i} className="text-[11px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1 truncate">
                  {resolvePreview(descriptionTemplate, headers, row, columns)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hash fields */}
      <div>
        <label className="block text-[12px] font-semibold text-text-2 mb-2">Hash-Felder (Duplikaterkennung)</label>
        <p className="text-[12px] text-text-3 mb-2">
          Diese Felder werden zur Erkennung von Duplikaten beim Import verwendet.
        </p>
        <div className="flex flex-wrap gap-2">
          {HASH_OPTIONS.map((field) => {
            const selected = hashFields.includes(field);
            return (
              <button
                key={field}
                onClick={() => {
                  const next = selected
                    ? hashFields.filter((f) => f !== field)
                    : [...hashFields, field];
                  onUpdate({ hashFields: next });
                }}
                className={`text-[11px] font-mono px-3 py-1.5 rounded-lg transition-colors ${
                  selected
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-text-3 hover:text-text'
                }`}
              >
                {field}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
