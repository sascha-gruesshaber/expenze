import { useState, useRef } from 'react';
import { X, Upload, Loader2, AlertCircle, ChevronLeft, ChevronRight, Save, Code2, Eye } from 'lucide-react';
import {
  useGenerateTemplate,
  useTestBankTemplate,
  useCreateBankTemplate,
} from '../../api/hooks';
import { useConfirmClose, ConfirmCloseBar } from '../../lib/useConfirmClose';

interface Props {
  onClose: () => void;
}

const STEPS = ['CSV hochladen', 'KI analysiert', 'Vorschau & Bearbeiten', 'Speichern'];

export default function AiTemplateWizard({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [csvText, setCsvText] = useState('');
  const [csvSample, setCsvSample] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [configJson, setConfigJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [showJson, setShowJson] = useState(false);
  const [bankName, setBankName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<{ transactions: any[]; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const generateMutation = useGenerateTemplate();
  const testMutation = useTestBankTemplate();
  const createMutation = useCreateBankTemplate();

  const isDirty = step > 0 || csvText.trim() !== '';
  const { showConfirm, requestClose, confirmClose, cancelClose } = useConfirmClose(isDirty, onClose);

  // ── Helpers ──────────────────────────────────────────────────────

  function extractSample(text: string): string {
    const lines = text.split('\n').filter(l => l.trim());
    return lines.slice(0, 6).join('\n'); // header + 5 rows
  }

  function autoId(name: string): string {
    return 'csv-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // ── Step 1: Upload ──────────────────────────────────────────────

  function decodeBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let text = new TextDecoder('utf-8').decode(bytes);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (text.includes('\uFFFD')) {
      text = new TextDecoder('iso-8859-1').decode(bytes);
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    }
    return text;
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const text = decodeBuffer(buffer);
      setCsvText(text);
      const sample = extractSample(text);
      setCsvSample(sample);
      startAnalysis(sample);
    };
    reader.readAsArrayBuffer(file);
  }

  function handlePaste() {
    if (!csvText.trim()) return;
    const sample = extractSample(csvText);
    setCsvSample(sample);
    startAnalysis(sample);
  }

  // ── Step 2: AI Analysis ─────────────────────────────────────────

  function startAnalysis(sample: string) {
    setStep(1);
    setError('');
    generateMutation.mutate(
      { csvSample: sample },
      {
        onSuccess: (data) => {
          setConfig(data.config);
          setConfigJson(JSON.stringify(data.config, null, 2));
          setTestResult(null);
          setStep(2);
        },
        onError: (err: any) => {
          const msg = err?.body?.error || err?.message || 'Unbekannter Fehler';
          const isNoKey = err?.body?.code === 'NO_API_KEY';
          setError(isNoKey ? 'Kein API-Key konfiguriert. Bitte OpenRouter API-Key in .env setzen.' : msg);
        },
      },
    );
  }

  // ── Step 3: Preview ─────────────────────────────────────────────

  function handleJsonChange(json: string) {
    setConfigJson(json);
    setJsonError('');
    try {
      const parsed = JSON.parse(json);
      setConfig(parsed);
    } catch {
      setJsonError('Ungültiges JSON');
    }
  }

  function handleTest() {
    if (!config || !csvText.trim()) return;
    testMutation.mutate(
      { config, csvText, bankName: 'Vorschau' },
      {
        onSuccess: (data) => setTestResult(data),
        onError: (err: any) => setError(err?.body?.error || err?.message || 'Fehler beim Testen'),
      },
    );
  }

  // ── Step 4: Save ────────────────────────────────────────────────

  function handleSave() {
    if (!templateId.trim() || !bankName.trim()) {
      setError('ID und Name müssen ausgefüllt sein.');
      return;
    }
    setError('');
    createMutation.mutate(
      { id: templateId.trim(), name: bankName.trim(), config },
      {
        onSuccess: () => onClose(),
        onError: (err: any) => setError(err?.body?.error || err?.message || 'Fehler beim Speichern'),
      },
    );
  }

  // ── Column summary (reuse from TemplateCard pattern) ────────────

  function columnSummary(columns: Record<string, any>): string[] {
    return Object.entries(columns)
      .filter(([, v]) => v)
      .map(([key, mapping]) => {
        const col = mapping.column || mapping.joinColumns?.join('+') || (mapping.fallbackIndex !== undefined ? `[${mapping.fallbackIndex}]` : '–');
        return `${key} → ${col}`;
      });
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-[640px] max-h-[85vh] flex flex-col">
        {showConfirm && <ConfirmCloseBar onConfirm={confirmClose} onCancel={cancelClose} />}
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="font-heading font-semibold text-[16px] text-text">KI-Template erstellen</h2>
            <div className="flex items-center gap-2 mt-2">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors ${
                    i === step ? 'bg-accent' : i < step ? 'bg-accent/40' : 'bg-border'
                  }`} />
                  <span className={`text-[11px] ${i === step ? 'text-text font-medium' : 'text-text-3'}`}>
                    {label}
                  </span>
                  {i < STEPS.length - 1 && <div className="w-4 h-px bg-border" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={requestClose} className="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-2 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Step 1: Upload ── */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-[13px] text-text-2">
                Lade eine CSV-Datei hoch oder füge den Inhalt ein. Die KI analysiert die Struktur und erzeugt automatisch ein Template.
              </p>

              {/* File upload */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/40 hover:bg-accent/3 transition-colors"
              >
                <Upload size={28} className="mx-auto text-text-3 mb-2" />
                <div className="text-[13px] font-medium text-text">CSV-Datei auswählen</div>
                <div className="text-[12px] text-text-3 mt-1">oder per Drag & Drop</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>

              {/* Paste area */}
              <div>
                <label className="block text-[12px] font-medium text-text-2 mb-1.5">Oder CSV-Inhalt einfügen</label>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Header + Beispielzeilen hier einfügen…"
                  className="w-full h-32 text-[12px] font-mono bg-surface-2 border border-border rounded-lg p-3 outline-none focus:border-accent resize-y placeholder:text-text-3"
                />
                <button
                  onClick={handlePaste}
                  disabled={!csvText.trim()}
                  className="mt-2 px-4 py-1.5 text-[12px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
                >
                  Analysieren
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Analyzing ── */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-12">
              {generateMutation.isPending ? (
                <>
                  <Loader2 size={32} className="text-accent animate-spin mb-4" />
                  <div className="text-[14px] font-medium text-text">KI analysiert CSV-Struktur…</div>
                  <div className="text-[12px] text-text-3 mt-1">Das kann einige Sekunden dauern</div>
                </>
              ) : error ? (
                <div className="w-full max-w-md">
                  <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div className="text-[13px] text-red-500">{error}</div>
                  </div>
                  <div className="flex gap-3 mt-4 justify-center">
                    <button
                      onClick={() => { setError(''); startAnalysis(csvSample); }}
                      className="px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors"
                    >
                      Nochmal versuchen
                    </button>
                    <button
                      onClick={() => { setStep(0); setError(''); }}
                      className="px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
                    >
                      Zurück
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Step 3: Preview & Edit ── */}
          {step === 2 && config && (
            <div className="space-y-4">
              {/* Config summary */}
              <div className="space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-text-3">Erkennung</span>
                  <span className="text-text font-mono text-[12px]">"{config.detection?.headerStartsWith}…"</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-3">Trennzeichen</span>
                  <span className="text-text font-mono text-[12px]">
                    {config.csv?.delimiter === 'auto' ? 'auto' : `"${config.csv?.delimiter}"`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-3">Beschreibung</span>
                  <span className="text-text font-mono text-[12px] truncate max-w-[300px]">{config.descriptionTemplate || '–'}</span>
                </div>
              </div>

              {/* Column mappings */}
              {config.columns && (
                <div>
                  <div className="text-[12px] font-semibold text-text-2 mb-2">Spalten-Mapping</div>
                  <div className="space-y-1">
                    {columnSummary(config.columns).map((c) => (
                      <div key={c} className="text-[12px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1">
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hash fields */}
              {config.hashFields && (
                <div>
                  <div className="text-[12px] font-semibold text-text-2 mb-2">Hash-Felder</div>
                  <div className="flex flex-wrap gap-1.5">
                    {config.hashFields.map((f: string) => (
                      <span key={f} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent/8 text-accent">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* JSON editor toggle */}
              <div>
                <button
                  onClick={() => setShowJson(!showJson)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-text-3 hover:text-text-2 transition-colors"
                >
                  <Code2 size={14} />
                  {showJson ? 'JSON ausblenden' : 'Erweitert (JSON bearbeiten)'}
                </button>
                {showJson && (
                  <div className="mt-2">
                    <textarea
                      value={configJson}
                      onChange={(e) => handleJsonChange(e.target.value)}
                      className="w-full h-56 text-[11px] font-mono bg-surface-2 border border-border rounded-lg p-3 outline-none focus:border-accent resize-y"
                    />
                    {jsonError && (
                      <div className="mt-1 text-[11px] text-red-500">{jsonError}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Live preview */}
              <div className="border-t border-border pt-4">
                <button
                  onClick={handleTest}
                  disabled={testMutation.isPending || !csvText.trim() || !!jsonError}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
                >
                  <Eye size={14} />
                  {testMutation.isPending ? 'Teste…' : 'Vorschau testen'}
                </button>

                {error && step === 2 && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
                    {error}
                  </div>
                )}

                {testResult && (
                  <div className="mt-3">
                    <div className="text-[12px] text-text-2 mb-1">
                      {testResult.total} Transaktionen erkannt
                    </div>
                    <div className="max-h-48 overflow-auto rounded-lg border border-border">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-surface-2 text-text-3">
                            <th className="text-left px-2 py-1.5 font-medium">Datum</th>
                            <th className="text-left px-2 py-1.5 font-medium">Empfänger</th>
                            <th className="text-right px-2 py-1.5 font-medium">Betrag</th>
                            <th className="text-left px-2 py-1.5 font-medium">Beschreibung</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testResult.transactions.map((tx: any, i: number) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2 py-1.5 text-text-2 whitespace-nowrap">{tx.bu_date}</td>
                              <td className="px-2 py-1.5 text-text truncate max-w-[140px]">{tx.counterparty}</td>
                              <td className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${tx.direction === 'debit' ? 'text-exp-red' : 'text-accent'}`}>
                                {tx.direction === 'debit' ? '−' : '+'}{tx.amount?.toFixed(2)} €
                              </td>
                              <td className="px-2 py-1.5 text-text-2 truncate max-w-[200px]" title={tx.description}>
                                {tx.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Save ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-[13px] text-text-2">
                Gib einen Namen und eine ID für das Template ein.
              </p>

              <div>
                <label className="block text-[12px] font-medium text-text-2 mb-1">Bank-Name</label>
                <input
                  value={bankName}
                  onChange={(e) => {
                    setBankName(e.target.value);
                    if (!templateId || templateId === autoId(bankName)) {
                      setTemplateId(autoId(e.target.value));
                    }
                  }}
                  placeholder="z.B. Sparkasse München"
                  className="w-full text-[13px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-text-2 mb-1">Template-ID</label>
                <input
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  placeholder="z.B. csv-sparkasse-muenchen"
                  className="w-full text-[13px] font-mono px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
                />
                <div className="text-[11px] text-text-3 mt-1">Eindeutige ID, wird automatisch aus dem Namen generiert</div>
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div>
            {step > 0 && step !== 1 && (
              <button
                onClick={() => { setStep(step === 3 ? 2 : 0); setError(''); setTestResult(null); }}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
              >
                <ChevronLeft size={15} />
                Zurück
              </button>
            )}
          </div>
          <div>
            {step === 2 && (
              <button
                onClick={() => { setStep(3); setError(''); }}
                disabled={!!jsonError}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
              >
                Weiter
                <ChevronRight size={15} />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleSave}
                disabled={createMutation.isPending || !bankName.trim() || !templateId.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
              >
                <Save size={15} />
                {createMutation.isPending ? 'Speichere…' : 'Speichern'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
