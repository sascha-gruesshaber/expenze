import { useState } from 'react';
import { X, Download, AlertCircle } from 'lucide-react';
import { useCreateBankTemplate } from '../../api/hooks';
import { useConfirmClose, ConfirmCloseBar } from '../../lib/useConfirmClose';

interface Props {
  onClose: () => void;
}

function autoId(name: string): string {
  return 'csv-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function decodeTemplate(code: string): { v: number; name: string; config: any } | null {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && parsed.config) return parsed;
    return null;
  } catch {
    return null;
  }
}

export default function ImportTemplateDialog({ onClose }: Props) {
  const createMutation = useCreateBankTemplate();
  const [code, setCode] = useState('');
  const [decoded, setDecoded] = useState<{ v: number; name: string; config: any } | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState('');

  const isDirty = code.trim() !== '' || decoded !== null;
  const { showConfirm, requestClose, confirmClose, cancelClose } = useConfirmClose(isDirty, onClose);

  function handleDecode() {
    setError('');
    const result = decodeTemplate(code);
    if (!result) {
      setError('Ungültiger Template-Code. Bitte überprüfe die Eingabe.');
      return;
    }
    setDecoded(result);
    setTemplateName(result.name);
    setTemplateId(autoId(result.name));
  }

  function handleImport() {
    if (!decoded || !templateName.trim() || !templateId.trim()) return;
    setError('');
    createMutation.mutate(
      { id: templateId.trim(), name: templateName.trim(), config: decoded.config },
      {
        onSuccess: () => onClose(),
        onError: (err: any) => setError(err?.body?.error || err?.message || 'Fehler beim Importieren'),
      },
    );
  }

  // Column summary for preview
  function configSummary(config: any): string[] {
    const parts: string[] = [];
    if (config.detection?.headerStartsWith) parts.push(`Erkennung: "${config.detection.headerStartsWith}…"`);
    if (config.csv?.delimiter) parts.push(`Trennzeichen: ${config.csv.delimiter}`);
    if (config.columns) {
      const mapped = Object.entries(config.columns).filter(([, v]) => v).length;
      parts.push(`${mapped} Spalten gemappt`);
    }
    if (config.hashFields) parts.push(`${config.hashFields.length} Hash-Felder`);
    if (config._format) parts.push(`Format: ${config._format}`);
    return parts;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-[520px] max-h-[80vh] flex flex-col">
        {showConfirm && <ConfirmCloseBar onConfirm={confirmClose} onCancel={cancelClose} />}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="font-heading font-semibold text-[16px] text-text">Template importieren</h2>
          <button onClick={requestClose} className="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-2 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!decoded ? (
            <>
              <p className="text-[13px] text-text-2">
                Füge einen exportierten Template-Code ein.
              </p>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Template-Code hier einfügen…"
                className="w-full h-32 text-[11px] font-mono bg-surface-2 border border-border rounded-lg p-3 outline-none focus:border-accent resize-none placeholder:text-text-3"
              />
              {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[12px] text-red-500">{error}</span>
                </div>
              )}
              <button
                onClick={handleDecode}
                disabled={!code.trim()}
                className="px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
              >
                Dekodieren
              </button>
            </>
          ) : (
            <>
              {/* Preview */}
              <div className="bg-surface-2 rounded-lg p-4 space-y-2">
                <div className="text-[12px] font-semibold text-text-2 mb-1">Template-Vorschau</div>
                {configSummary(decoded.config).map((line, i) => (
                  <div key={i} className="text-[12px] font-mono text-text-2">{line}</div>
                ))}
              </div>

              {/* Editable name/ID */}
              <div>
                <label className="block text-[12px] font-medium text-text-2 mb-1">Template-Name</label>
                <input
                  value={templateName}
                  onChange={(e) => {
                    setTemplateName(e.target.value);
                    if (!templateId || templateId === autoId(templateName)) {
                      setTemplateId(autoId(e.target.value));
                    }
                  }}
                  className="w-full text-[13px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-text-2 mb-1">Template-ID</label>
                <input
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full text-[13px] font-mono px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[12px] text-red-500">{error}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setDecoded(null); setError(''); }}
                  className="px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
                >
                  Zurück
                </button>
                <button
                  onClick={handleImport}
                  disabled={createMutation.isPending || !templateName.trim() || !templateId.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
                >
                  <Download size={15} />
                  {createMutation.isPending ? 'Importiere…' : 'Importieren'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
