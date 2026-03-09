import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import CsvUploadStep from './steps/CsvUploadStep';
import BasicSettingsStep from './steps/BasicSettingsStep';
import ColumnMappingStep, { REQUIRED_FIELDS, isMapped } from './steps/ColumnMappingStep';
import DescriptionHashStep from './steps/DescriptionHashStep';
import AdvancedStep from './steps/AdvancedStep';
import TestSaveStep from './steps/TestSaveStep';
import { useConfirmClose, ConfirmCloseBar } from '../../lib/useConfirmClose';

interface Props {
  onClose: () => void;
}

interface ColumnMapping {
  column?: string;
  fallbackIndex?: number;
  defaultValue?: string;
  joinColumns?: string[];
  joinSeparator?: string;
}

interface FallbackRule {
  field: string;
  when: 'empty';
  copyFrom: string;
}

const STEPS = ['CSV hochladen', 'Grundeinstellungen', 'Spalten-Mapping', 'Beschreibung & Hash', 'Erweitert', 'Testen & Speichern'];

/** Client-side delimiter detection (mirrors csv-utils.ts) */
function detectDelimiter(line: string): ';' | ',' {
  let semi = 0, comma = 0;
  for (const ch of line) {
    if (ch === ';') semi++;
    else if (ch === ',') comma++;
  }
  return semi >= comma ? ';' : ',';
}

/** Minimal client-side CSV row parser for preview */
function parsePreviewRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  let i = 0;
  while (i < len && rows.length < 10) {
    const row: string[] = [];
    while (i < len) {
      if (text[i] === '"') {
        i++;
        let field = '';
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else { field += text[i]; i++; }
        }
        row.push(field);
        if (i < len && text[i] === delimiter) i++;
        else { if (i < len && text[i] === '\r') i++; if (i < len && text[i] === '\n') i++; break; }
      } else {
        let field = '';
        while (i < len && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') { field += text[i]; i++; }
        row.push(field);
        if (i < len && text[i] === delimiter) i++;
        else { if (i < len && text[i] === '\r') i++; if (i < len && text[i] === '\n') i++; break; }
      }
    }
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

function autoId(name: string): string {
  return 'csv-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function ManualTemplateWizard({ onClose }: Props) {
  const [step, setStep] = useState(0);

  // Shared state
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [delimiter, setDelimiter] = useState<'auto' | ';' | ','>('auto');
  const [headerStartsWith, setHeaderStartsWith] = useState('');
  const [minColumnsPerRow, setMinColumnsPerRow] = useState(5);
  const [columns, setColumns] = useState<Record<string, ColumnMapping | undefined>>({
    bu_date: { column: '' },
    counterparty: { column: '' },
    amount: { column: '' },
  });
  const [descriptionTemplate, setDescriptionTemplate] = useState('{type} {purpose}');
  const [hashFields, setHashFields] = useState<string[]>(['bu_date', 'amount', 'direction', 'counterparty']);
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [fallbacks, setFallbacks] = useState<FallbackRule[]>([]);

  const isDirty = step > 0 || csvText.trim() !== '';
  const { showConfirm, requestClose, confirmClose, cancelClose } = useConfirmClose(isDirty, onClose);

  // Process CSV text and extract headers/rows
  function processCsv(text: string) {
    setCsvText(text);
    if (!text.trim()) return;

    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length === 0) return;

    const rawHeader = lines[0];
    const det = detectDelimiter(rawHeader);
    if (delimiter === 'auto') {
      // keep auto, but use detected for parsing
    }
    const delim = delimiter === 'auto' ? det : delimiter;

    const allRows = parsePreviewRows(text, delim);
    if (allRows.length === 0) return;

    const hdrs = allRows[0].map((h) => h.trim());
    setHeaders(hdrs);
    setSampleRows(allRows.slice(1, 6));
    setHeaderStartsWith(rawHeader.substring(0, Math.min(rawHeader.length, 30)));
    setMinColumnsPerRow(hdrs.length);

    // Auto-advance to step 1
    setStep(1);
  }

  // Assemble final config
  function assembleConfig() {
    // Clean columns: remove empty mappings
    const cleanColumns: Record<string, any> = {};
    for (const [key, mapping] of Object.entries(columns)) {
      if (!mapping) continue;
      if (mapping.column || (mapping.joinColumns && mapping.joinColumns.length > 0) || mapping.defaultValue || mapping.fallbackIndex !== undefined) {
        const clean: any = {};
        if (mapping.column) clean.column = mapping.column;
        if (mapping.fallbackIndex !== undefined) clean.fallbackIndex = mapping.fallbackIndex;
        if (mapping.defaultValue) clean.defaultValue = mapping.defaultValue;
        if (mapping.joinColumns && mapping.joinColumns.length > 0) {
          clean.joinColumns = mapping.joinColumns;
          if (mapping.joinSeparator && mapping.joinSeparator !== ' ') clean.joinSeparator = mapping.joinSeparator;
        }
        cleanColumns[key] = clean;
      }
    }

    return {
      detection: { headerStartsWith: headerStartsWith.trim() },
      csv: { delimiter, minColumnsPerRow },
      columns: cleanColumns,
      descriptionTemplate,
      hashFields,
      ...(Object.keys(typeMap).length > 0 ? { typeMap } : {}),
      ...(fallbacks.length > 0 ? { fallbacks } : {}),
    };
  }

  // Validation
  const canAdvanceFromStep = (s: number): boolean => {
    switch (s) {
      case 0: return csvText.trim().length > 0 && headers.length > 0;
      case 1: return templateName.trim().length > 0 && headerStartsWith.trim().length > 0;
      case 2: return REQUIRED_FIELDS.every((f) => isMapped(columns[f]));
      case 3: return descriptionTemplate.trim().length > 0 && hashFields.length > 0;
      case 4: return true; // skippable
      default: return true;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-[760px] max-h-[85vh] flex flex-col">
        {showConfirm && <ConfirmCloseBar onConfirm={confirmClose} onCancel={cancelClose} />}
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-heading font-semibold text-[16px] text-text">Manuelles Template erstellen</h2>
            <div className="flex items-center gap-1.5 mt-2">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === step ? 'bg-accent' : i < step ? 'bg-accent/40' : 'bg-border'
                    }`}
                  />
                  <span className={`text-[10px] ${i === step ? 'text-text font-medium' : 'text-text-3'} ${i > 3 ? 'hidden xl:inline' : ''}`}>
                    {label}
                  </span>
                  {i < STEPS.length - 1 && <div className="w-3 h-px bg-border" />}
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
          {step === 0 && (
            <CsvUploadStep csvText={csvText} onCsvLoaded={processCsv} />
          )}

          {step === 1 && (
            <BasicSettingsStep
              templateName={templateName}
              templateId={templateId}
              delimiter={delimiter}
              headerStartsWith={headerStartsWith}
              minColumnsPerRow={minColumnsPerRow}
              headers={headers}
              onUpdate={(patch: any) => {
                if (patch.templateName !== undefined) setTemplateName(patch.templateName);
                if (patch.templateId !== undefined) setTemplateId(patch.templateId);
                if (patch.delimiter !== undefined) setDelimiter(patch.delimiter);
                if (patch.headerStartsWith !== undefined) setHeaderStartsWith(patch.headerStartsWith);
                if (patch.minColumnsPerRow !== undefined) setMinColumnsPerRow(patch.minColumnsPerRow);
              }}
            />
          )}

          {step === 2 && (
            <ColumnMappingStep
              headers={headers}
              sampleRows={sampleRows}
              columns={columns}
              onUpdate={setColumns}
            />
          )}

          {step === 3 && (
            <DescriptionHashStep
              descriptionTemplate={descriptionTemplate}
              hashFields={hashFields}
              headers={headers}
              sampleRows={sampleRows}
              columns={columns}
              onUpdate={(patch) => {
                if (patch.descriptionTemplate !== undefined) setDescriptionTemplate(patch.descriptionTemplate);
                if (patch.hashFields !== undefined) setHashFields(patch.hashFields);
              }}
            />
          )}

          {step === 4 && (
            <AdvancedStep
              typeMap={typeMap}
              fallbacks={fallbacks}
              onUpdate={(patch) => {
                if (patch.typeMap !== undefined) setTypeMap(patch.typeMap);
                if (patch.fallbacks !== undefined) setFallbacks(patch.fallbacks);
              }}
            />
          )}

          {step === 5 && (
            <TestSaveStep
              templateName={templateName}
              templateId={templateId}
              config={assembleConfig()}
              csvText={csvText}
              onNameChange={setTemplateName}
              onIdChange={setTemplateId}
              onClose={onClose}
            />
          )}
        </div>

        {/* Footer */}
        {step < 5 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
            <div>
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
                >
                  <ChevronLeft size={15} />
                  Zurück
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step === 4 && (
                <button
                  onClick={() => setStep(5)}
                  className="px-4 py-2 text-[13px] font-medium rounded-lg bg-surface-2 text-text-2 hover:text-text transition-colors"
                >
                  Überspringen
                </button>
              )}
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canAdvanceFromStep(step)}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
              >
                Weiter
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
