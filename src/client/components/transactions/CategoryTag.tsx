import { useState } from 'react';
import type { Transaction } from '../../api/hooks';
import { RecategorizeDialog } from './RecategorizeDialog';

interface CategoryTagProps {
  transaction: Transaction;
}

export function CategoryTag({ transaction }: CategoryTagProps) {
  const [open, setOpen] = useState(false);
  const category = transaction.category || 'Sonstiges';

  return (
    <>
      <span
        onClick={() => setOpen(true)}
        className="inline-block px-2.5 py-1 bg-surface-2 rounded-lg text-[11px] text-text-2 font-medium cursor-pointer hover:bg-accent/8 hover:text-accent transition-colors"
      >
        {category}
      </span>
      <RecategorizeDialog
        transaction={transaction}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
