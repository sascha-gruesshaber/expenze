import { useState, useEffect } from 'react';
import { Eye, Save, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { useTestBankTemplate, useCreateBankTemplate } from '../../../api/hooks';

interface Props {
  templateName: string;
  templateId: string;
  config: any;
  csvText: string;
  onNameChange: (name: string) => void;
  onIdChange: (id: string) => void;
  onClose: () => void;
}

export default function TestSaveStep({
  templateName, templateId, config, csvText, onNameChange, onIdChange, onClose,
}: Props) {
  const testMutation = useTestBankTemplate();
  const createMutation = useCreateBankTemplate();
  const [testResult, setTestResult] = useState<{ transactions: any[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [showJson, setShowJson] = useState(false);

  // Auto-test on mount
  useEffect(() => {
    if (csvText.trim() && config) {
      handleTest();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTest() {
    setError('');
    setTestResult(null);
    testMutation.mutate(
      { config, csvText, bankName: templateName || 'Test' },
      {
        onSuccess: (data) => setTestResult(data),
        onError: (err: any) => setError(err?.body?.error || err?.message || 'Fehler beim Testen'),
      },
    );
  }

  function handleSave() {
    if (!templateId.trim() || !templateName.trim()) {
      setError('ID und Name müssen ausgefüllt sein.');
      return;
    }
    setError('');
    createMutation.mutate(
      { id: templateId.trim(), name: templateName.trim(), config },
      {
        onSuccess: () => onClose(),
        onError: (err: any) => setError(err?.body?.error || err?.message || 'Fehler beim Speichern'),
      },
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-text-2">
        Überprüfe die Ergebnisse und speichere das Template.
      </p>

      {/* Editable name/ID */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] font-medium text-text-2 mb-1">Template-Name</label>
          <input
            value={templateName}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full text-[13px] px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-text-2 mb-1">Template-ID</label>
          <input
            value={templateId}
            onChange={(e) => onIdChange(e.target.value)}
            className="w-full text-[13px] font-mono px-3 py-2 rounded-lg bg-surface-2 border border-border outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Test button */}
      <button
        onClick={handleTest}
        disabled={testMutation.isPending || !csvText.trim()}
        className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-40"
      >
        <Eye size={14} />
        {testMutation.isPending ? 'Teste…' : 'Erneut testen'}
      </button>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-500">
          {error}
        </div>
      )}

      {/* Test results */}
      {testResult && (
        <div>
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

      {/* JSON preview */}
      <div>
        <button
          onClick={() => setShowJson(!showJson)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-text-3 hover:text-text-2 transition-colors"
        >
          <Code2 size={14} />
          {showJson ? 'JSON ausblenden' : 'JSON-Konfiguration anzeigen'}
          {showJson ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showJson && (
          <pre className="mt-2 text-[11px] font-mono bg-surface-2 border border-border rounded-lg p-3 overflow-auto max-h-48 text-text-2">
            {JSON.stringify(config, null, 2)}
          </pre>
        )}
      </div>

      {/* Save */}
      <div className="border-t border-border pt-4">
        <button
          onClick={handleSave}
          disabled={createMutation.isPending || !templateName.trim() || !templateId.trim()}
          className="flex items-center gap-1.5 px-5 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors disabled:opacity-40"
        >
          <Save size={15} />
          {createMutation.isPending ? 'Speichere…' : 'Template speichern'}
        </button>
      </div>
    </div>
  );
}
