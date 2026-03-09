import { useRef } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  csvText: string;
  onCsvLoaded: (text: string) => void;
}

export default function CsvUploadStep({ csvText, onCsvLoaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function decodeBuffer(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    // Try UTF-8 first
    let text = new TextDecoder('utf-8').decode(bytes);
    // Strip BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    // If UTF-8 produced replacement characters, fall back to Latin-1 (ISO-8859-1)
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
      onCsvLoaded(decodeBuffer(buffer));
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-text-2">
        Lade eine CSV-Datei hoch oder füge den Inhalt ein. Die Spalten werden automatisch erkannt.
      </p>

      {/* File upload */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
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
          onChange={(e) => onCsvLoaded(e.target.value)}
          placeholder="Header + Beispielzeilen hier einfügen…"
          className="w-full h-32 text-[12px] font-mono bg-surface-2 border border-border rounded-lg p-3 outline-none focus:border-accent resize-y placeholder:text-text-3"
        />
      </div>
    </div>
  );
}
