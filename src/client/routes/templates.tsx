import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  useBankTemplates,
  useUpdateBankTemplate,
  useDeleteBankTemplate,
  useTestBankTemplate,
} from '../api/hooks';
import type { BankTemplate } from '../api/hooks';
import { FileCode2, Plus, Trash2, ChevronDown, ChevronUp, FlaskConical, Power, PowerOff, Sparkles, Share2, Download } from 'lucide-react';
import AiTemplateWizard from '../components/templates/AiTemplateWizard';
import ManualTemplateWizard from '../components/templates/ManualTemplateWizard';
import ExportTemplateDialog from '../components/templates/ExportTemplateDialog';
import ImportTemplateDialog from '../components/templates/ImportTemplateDialog';

export const Route = createFileRoute('/templates')({
  component: TemplatesPage,
});

// ── Column display helpers ──────────────────────────────────────────

function columnSummary(columns: Record<string, any>): string[] {
  return Object.entries(columns)
    .filter(([, v]) => v)
    .map(([key, mapping]) => {
      const col = mapping.column || mapping.joinColumns?.join('+') || `[${mapping.fallbackIndex}]`;
      return `${key} → ${col}`;
    });
}

// ── Template Card ───────────────────────────────────────────────────

function TemplateCard({ template }: { template: BankTemplate }) {
  const updateTemplate = useUpdateBankTemplate();
  const deleteTemplate = useDeleteBankTemplate();
  const testTemplate = useTestBankTemplate();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testCsv, setTestCsv] = useState('');
  const [testResult, setTestResult] = useState<{ transactions: any[]; total: number } | null>(null);
  const [testError, setTestError] = useState('');
  const [showExport, setShowExport] = useState(false);

  const config = template.config;
  const cols = columnSummary(config.columns || {});

  const handleToggle = () => {
    updateTemplate.mutate({ id: template.id, enabled: !template.enabled });
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteTemplate.mutate(template.id);
  };

  const handleTest = () => {
    if (!testCsv.trim()) return;
    setTestError('');
    setTestResult(null);
    testTemplate.mutate(
      { config: template.config, csvText: testCsv, bankName: template.name },
      {
        onSuccess: (data) => setTestResult(data),
        onError: (err: any) => setTestError(err.message || 'Fehler beim Testen'),
      },
    );
  };

  return (
    <>
      <div className="bg-surface rounded-2xl shadow-card border border-border hover:shadow-card-hover transition-shadow">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${template.enabled ? 'bg-accent/8' : 'bg-surface-2'}`}>
                <FileCode2 size={20} className={template.enabled ? 'text-accent' : 'text-text-3'} />
              </div>
              <div>
                <div className="text-[11px] font-medium text-text-3 uppercase tracking-wide flex items-center gap-2">
                  {template.id}
                  {template.is_builtin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold normal-case tracking-normal">
                      Built-in
                    </span>
                  )}
                </div>
                <div className="font-heading font-semibold text-[15px] text-text">
                  {template.name}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!template.is_builtin && (
                <button
                  onClick={() => setShowExport(true)}
                  className="p-1.5 rounded-lg text-text-3 hover:text-accent hover:bg-accent/10 transition-colors"
                  title="Template exportieren"
                >
                  <Share2 size={15} />
                </button>
              )}
              <button
                onClick={handleToggle}
                className={`p-1.5 rounded-lg transition-colors ${
                  template.enabled
                    ? 'text-accent hover:bg-accent/10'
                    : 'text-text-3 hover:bg-surface-2'
                }`}
                title={template.enabled ? 'Deaktivieren' : 'Aktivieren'}
              >
                {template.enabled ? <Power size={15} /> : <PowerOff size={15} />}
              </button>
              {!template.is_builtin && (
                <button
                  onClick={handleDelete}
                  onBlur={() => setConfirmDelete(false)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    confirmDelete
                      ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                      : 'text-text-3 hover:text-red-500 hover:bg-red-500/10'
                  }`}
                  title={confirmDelete ? 'Nochmal klicken zum Löschen' : 'Template löschen'}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>

          {confirmDelete && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
              Template löschen? Nochmal klicken zum Bestätigen.
            </div>
          )}

          {/* Key info */}
          <div className="space-y-1.5 text-[13px]">
            {config._format && config._format !== 'csv' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-text-3">Format</span>
                  <span className="text-text font-mono text-[12px]">
                    {config._format === 'mt940' ? 'MT940 / SWIFT' : config._format === 'camt052' ? 'CAMT.052 / ISO 20022' : config._format}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-3">Dateitypen</span>
                  <span className="text-text font-mono text-[12px]">
                    {config._format === 'mt940' ? '.mta, .sta' : '.xml'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-3">Erkennung</span>
                  <span className="text-text font-mono text-[12px]">
                    {config._format === 'mt940' ? 'Automatisch (:20: Tag)' : 'Automatisch (camt.052 XML)'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-text-3">Erkennung</span>
                  <span className="text-text font-mono text-[12px]">
                    {config.detection?.headerStartsWith ? `"${config.detection.headerStartsWith}…"` : '–'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-3">Trennzeichen</span>
                  <span className="text-text font-mono text-[12px]">
                    {config.csv?.delimiter === 'auto' ? 'auto' : `"${config.csv?.delimiter}"`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-3">Beschreibung</span>
                  <span className="text-text font-mono text-[12px] truncate max-w-[200px]" title={config.descriptionTemplate}>
                    {config.descriptionTemplate || '–'}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <span className="text-text-3">Version</span>
              <span className="text-text font-medium">{template.version}</span>
            </div>
          </div>
        </div>

        {/* Expandable details */}
        <div className="border-t border-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-6 py-3 text-[12px] font-medium text-text-3 hover:text-text-2 transition-colors"
          >
            <span>{expanded ? 'Details ausblenden' : 'Details anzeigen'}</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expanded && (
            <div className="px-6 pb-5 space-y-4">
              {/* Column mappings */}
              <div>
                <div className="text-[12px] font-semibold text-text-2 mb-2">Spalten-Mapping</div>
                <div className="space-y-1">
                  {cols.map((c) => (
                    <div key={c} className="text-[12px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1">
                      {c}
                    </div>
                  ))}
                </div>
              </div>

              {/* Hash fields */}
              <div>
                <div className="text-[12px] font-semibold text-text-2 mb-2">Hash-Felder</div>
                <div className="flex flex-wrap gap-1.5">
                  {(config.hashFields || []).map((f: string) => (
                    <span key={f} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent/8 text-accent">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Type map */}
              {config.typeMap && Object.keys(config.typeMap).length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-text-2 mb-2">Typ-Zuordnung</div>
                  <div className="space-y-1">
                    {Object.entries(config.typeMap).map(([k, v]) => (
                      <div key={k} className="text-[12px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1">
                        {k} → {v as string}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallbacks */}
              {config.fallbacks && config.fallbacks.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-text-2 mb-2">Fallback-Regeln</div>
                  <div className="space-y-1">
                    {config.fallbacks.map((fb: any, i: number) => (
                      <div key={i} className="text-[12px] font-mono text-text-2 bg-surface-2 rounded px-2 py-1">
                        wenn {fb.field} leer → kopiere {fb.copyFrom}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Test area */}
              <div>
                <div className="text-[12px] font-semibold text-text-2 mb-2 flex items-center gap-1.5">
                  <FlaskConical size={13} />
                  Template testen
                </div>
                <textarea
                  value={testCsv}
                  onChange={(e) => setTestCsv(e.target.value)}
                  placeholder="CSV-Inhalt hier einfügen (Header + ein paar Zeilen)…"
                  className="w-full h-24 text-[12px] font-mono bg-surface-2 border border-border rounded-lg p-3 outline-none focus:border-accent resize-y placeholder:text-text-3"
                />
                <button
                  onClick={handleTest}
                  disabled={testTemplate.isPending || !testCsv.trim()}
                  className="mt-2 px-4 py-1.5 text-[12px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
                >
                  {testTemplate.isPending ? 'Teste…' : 'Testen'}
                </button>

                {testError && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
                    {testError}
                  </div>
                )}

                {testResult && (
                  <div className="mt-2">
                    <div className="text-[12px] text-text-2 mb-1">
                      {testResult.total} Transaktionen erkannt (zeige max. 20)
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
        </div>
      </div>

      {showExport && <ExportTemplateDialog template={template} onClose={() => setShowExport(false)} />}
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────

function TemplatesPage() {
  const { data: templates = [] } = useBankTemplates();
  const [showManualWizard, setShowManualWizard] = useState(false);
  const [showAiWizard, setShowAiWizard] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const builtins = templates.filter((t) => t.is_builtin);
  const custom = templates.filter((t) => !t.is_builtin);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[13px] text-text-3">
            {templates.length} Template{templates.length !== 1 ? 's' : ''} installiert
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiWizard(true)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors"
          >
            <Sparkles size={15} />
            KI-Template erstellen
          </button>
          <button
            onClick={() => setShowManualWizard(true)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
          >
            <Plus size={15} />
            Manuell erstellen
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
          >
            <Download size={15} />
            Importieren
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-card p-12 text-center">
          <FileCode2 size={40} className="text-text-3 mx-auto mb-3" />
          <div className="font-heading font-semibold text-[15px] text-text mb-1">Keine Templates</div>
          <div className="text-[13px] text-text-3">Templates werden beim ersten Import automatisch erstellt.</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Built-in */}
          {builtins.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">
                Integrierte Templates
              </div>
              <div className="grid grid-cols-2 gap-4">
                {builtins.map((t) => (
                  <TemplateCard key={t.id} template={t} />
                ))}
              </div>
            </div>
          )}

          {/* Custom */}
          {custom.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-text-3 uppercase tracking-wide mb-3">
                Eigene Templates
              </div>
              <div className="grid grid-cols-2 gap-4">
                {custom.map((t) => (
                  <TemplateCard key={t.id} template={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showManualWizard && <ManualTemplateWizard onClose={() => setShowManualWizard(false)} />}
      {showAiWizard && <AiTemplateWizard onClose={() => setShowAiWizard(false)} />}
      {showImport && <ImportTemplateDialog onClose={() => setShowImport(false)} />}
    </div>
  );
}
