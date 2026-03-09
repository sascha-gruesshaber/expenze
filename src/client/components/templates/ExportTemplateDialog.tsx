import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { BankTemplate } from '../../api/hooks';

interface Props {
  template: BankTemplate;
  onClose: () => void;
}

function encodeTemplate(template: BankTemplate): string {
  const payload = JSON.stringify({ v: 1, name: template.name, config: template.config });
  return btoa(unescape(encodeURIComponent(payload)));
}

export default function ExportTemplateDialog({ template, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const code = encodeTemplate(template);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select textarea
      const el = document.getElementById('export-code') as HTMLTextAreaElement;
      el?.select();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-[520px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="font-heading font-semibold text-[16px] text-text">Template exportieren</h2>
            <p className="text-[12px] text-text-3 mt-1">{template.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-3 hover:text-text hover:bg-surface-2 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] text-text-2">
            Kopiere den Code unten und teile ihn mit anderen Nutzern, um das Template zu importieren.
          </p>

          <textarea
            id="export-code"
            readOnly
            value={code}
            className="w-full h-32 text-[11px] font-mono bg-surface-2 border border-border rounded-lg p-3 outline-none resize-none text-text-2"
          />

          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-accent text-white hover:bg-accent-2 transition-colors"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Kopiert!' : 'Kopieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
