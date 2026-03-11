import { useRef, useState, type DragEvent } from 'react';
import { Upload, Plus } from 'lucide-react';

interface DropZoneProps {
  onFiles: (files: FileList) => void;
  compact?: boolean;
}

export function DropZone({ onFiles, compact }: DropZoneProps) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  };

  const sharedHandlers = {
    onClick: () => inputRef.current?.click(),
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDrag(true); },
    onDragLeave: () => setDrag(false),
    onDrop: handleDrop,
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,.mta,.sta,.xml,.pdf"
      multiple
      className="hidden"
      onChange={(e) => e.target.files?.length && onFiles(e.target.files)}
    />
  );

  if (compact) {
    return (
      <div
        {...sharedHandlers}
        className={`border border-dashed rounded-xl px-4 py-3 mb-3 flex items-center justify-center gap-2 cursor-pointer transition-all ${
          drag
            ? 'border-accent bg-accent/4'
            : 'border-border hover:border-accent/50 hover:bg-accent/3'
        }`}
      >
        {fileInput}
        <Plus size={15} className="text-text-3" />
        <span className="text-[13px] text-text-3">Weitere Dateien hinzufügen</span>
      </div>
    );
  }

  return (
    <div
      {...sharedHandlers}
      className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer mb-6 transition-all ${
        drag
          ? 'border-accent bg-accent/4'
          : 'border-border hover:border-accent/50 hover:bg-accent/3'
      }`}
    >
      {fileInput}
      <div className="w-12 h-12 rounded-2xl bg-accent/8 flex items-center justify-center mx-auto mb-4">
        <Upload size={22} className="text-accent" />
      </div>
      <div className="font-heading font-bold text-lg mb-1.5 text-text">
        Kontoauszüge importieren
      </div>
      <div className="text-text-3 text-[13px]">
        CSV, MT940, CAMT.052 oder PDF Dateien hier ablegen oder klicken
      </div>
    </div>
  );
}
