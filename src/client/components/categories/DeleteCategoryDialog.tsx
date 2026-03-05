import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDeleteCategory, type CategoryOverview } from '../../api/hooks';
import { useToast } from '../layout/Toast';

interface Props {
  category: CategoryOverview;
  allCategories: CategoryOverview[];
  onClose: () => void;
}

export function DeleteCategoryDialog({ category, allCategories, onClose }: Props) {
  const replacementOptions = allCategories.filter(c => c.category !== category.category);
  const [replacement, setReplacement] = useState('Sonstiges');
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();

  const handleDelete = () => {
    deleteCategory.mutate(
      { id: category.category_id, replacement_category: replacement },
      {
        onSuccess: (data) => {
          toast(`Kategorie gelöscht, ${data.reassigned_transactions} Buchungen verschoben`);
          onClose();
        },
        onError: (err) => toast('Fehler: ' + err.message, 'error'),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-exp-red/10 rounded-lg">
            <AlertTriangle size={20} className="text-exp-red" />
          </div>
          <h2 className="text-[16px] font-semibold text-text">Kategorie löschen</h2>
        </div>

        <p className="text-[13px] text-text-2 mb-4">
          Die Kategorie <span className="font-semibold text-text">"{category.category}"</span> wird gelöscht.
          {category.tx_count > 0 && (
            <> Es {category.tx_count === 1 ? 'wird' : 'werden'} <span className="font-semibold text-text">{category.tx_count} Buchung{category.tx_count !== 1 ? 'en' : ''}</span> und zugehörige Regeln zur Ersatzkategorie verschoben.</>
          )}
        </p>

        <div className="mb-6">
          <label className="block text-[12px] font-medium text-text-3 mb-1.5">Ersatzkategorie</label>
          <select
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            className="w-full text-[13px] bg-surface border border-border rounded-lg px-3 py-2 text-text outline-none focus:border-accent"
          >
            {replacementOptions.map(c => (
              <option key={c.category_id} value={c.category}>{c.category}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-text-2 hover:text-text transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteCategory.isPending}
            className="px-4 py-2 text-[13px] font-medium text-white bg-exp-red rounded-lg hover:bg-exp-red/90 disabled:opacity-50 transition-colors"
          >
            {deleteCategory.isPending ? 'Lösche...' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}
