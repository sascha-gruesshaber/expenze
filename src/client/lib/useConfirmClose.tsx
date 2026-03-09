import { useState, useCallback } from 'react';

/**
 * Hook for protecting dialogs with unsaved changes from accidental close.
 * Returns a `requestClose` that gates on `isDirty`, plus state/handlers
 * for showing an inline confirmation banner.
 */
export function useConfirmClose(isDirty: boolean, onClose: () => void) {
  const [showConfirm, setShowConfirm] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  const cancelClose = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return { showConfirm, requestClose, confirmClose, cancelClose };
}

/** Small inline confirmation banner rendered inside the dialog. */
export function ConfirmCloseBar({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mx-4 mt-4 px-4 py-3 bg-amber-400/90 rounded-xl border border-amber-500/40 animate-confirm-slide-in">
      <span className="text-[13px] text-amber-950 font-medium">
        Änderungen verwerfen?
      </span>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[12px] text-amber-900/70 hover:text-amber-950 rounded-lg hover:bg-amber-500/20 transition-colors"
        >
          Abbrechen
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 text-[12px] font-medium text-white bg-amber-900/80 rounded-lg hover:bg-amber-900 transition-colors"
        >
          Verwerfen
        </button>
      </div>
    </div>
  );
}
