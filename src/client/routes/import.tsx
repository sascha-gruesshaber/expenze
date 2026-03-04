import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useSummary, useImportFiles } from '../api/hooks';
import { DropZone } from '../components/import/DropZone';
import { ImportResults } from '../components/import/ImportResults';
import { ImportLog } from '../components/import/ImportLog';

export const Route = createFileRoute('/import')({
  component: ImportPage,
});

function ImportPage() {
  const { data: summary } = useSummary();
  const importMutation = useImportFiles();
  const [results, setResults] = useState<any[] | null>(null);

  const handleFiles = async (files: FileList) => {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    try {
      const data = await importMutation.mutateAsync(fd);
      setResults(data.results);
    } catch {
      setResults(null);
    }
  };

  return (
    <>
      <DropZone onFiles={handleFiles} isLoading={importMutation.isPending} />
      <ImportResults results={results} />
      <div className="bg-surface rounded-2xl shadow-card overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-border">
          <div className="font-heading font-semibold text-[15px]">Import-Verlauf</div>
        </div>
        <div className="p-6">
          <ImportLog imports={summary?.imports || []} />
        </div>
      </div>
    </>
  );
}
