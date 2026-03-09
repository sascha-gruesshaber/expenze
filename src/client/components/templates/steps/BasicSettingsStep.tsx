interface Props {
  templateName: string;
  templateId: string;
  delimiter: 'auto' | ';' | ',';
  headerStartsWith: string;
  minColumnsPerRow: number;
  headers: string[];
  onUpdate: (patch: Partial<Props>) => void;
}

function autoId(name: string): string {
  return 'csv-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function BasicSettingsStep({
  templateName, templateId, delimiter, headerStartsWith, minColumnsPerRow, headers, onUpdate,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-text-2">
        Grundeinstellungen für das Template. Die meisten Werte wurden automatisch erkannt.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-text-2 mb-1">Template-Name</label>
          <input
            value={templateName}
            onChange={(e) => {
              const newName = e.target.value;
              const patch: any = { templateName: newName };
              if (!templateId || templateId === autoId(templateName)) {
                patch.templateId = autoId(newName);
              }
              onUpdate(patch);
            }}
            placeholder="z.B. Sparkasse München"
            className="w-full text-[13px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-text-2 mb-1">Template-ID</label>
          <input
            value={templateId}
            onChange={(e) => onUpdate({ templateId: e.target.value })}
            placeholder="z.B. csv-sparkasse"
            className="w-full text-[13px] font-mono px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
          />
          <div className="text-[11px] text-text-3 mt-1">Eindeutige ID</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-text-2 mb-1">Trennzeichen</label>
          <select
            value={delimiter}
            onChange={(e) => onUpdate({ delimiter: e.target.value as any })}
            className="w-full text-[13px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent cursor-pointer"
          >
            <option value="auto">Automatisch</option>
            <option value=";">Semikolon (;)</option>
            <option value=",">Komma (,)</option>
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-text-2 mb-1">Min. Spalten pro Zeile</label>
          <input
            type="number"
            value={minColumnsPerRow}
            onChange={(e) => onUpdate({ minColumnsPerRow: parseInt(e.target.value) || 1 })}
            min={1}
            className="w-full text-[13px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-text-2 mb-1">Erkennung (Header beginnt mit)</label>
        <input
          value={headerStartsWith}
          onChange={(e) => onUpdate({ headerStartsWith: e.target.value })}
          placeholder="Erste Zeichen der Header-Zeile"
          className="w-full text-[13px] font-mono px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
        />
        <div className="text-[11px] text-text-3 mt-1">Die CSV wird anhand dieser Zeichenfolge am Zeilenanfang erkannt</div>
      </div>

      {/* Header chips */}
      {headers.length > 0 && (
        <div>
          <div className="text-[12px] font-medium text-text-2 mb-2">Erkannte Spalten ({headers.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {headers.map((h) => (
              <span key={h} className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-accent/8 text-accent">
                {h}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
