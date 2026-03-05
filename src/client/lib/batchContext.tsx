import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { apiPost } from '../api/client';
import type { BatchSuggestion, CounterpartyGroup, BatchProgress } from '../api/hooks';

// Extend status with 'stopped'
export type BatchStatus = BatchProgress['status'] | 'stopped';

export interface BatchState {
  status: BatchStatus;
  suggestions: BatchSuggestion[];
  completed: number;
  totalGroups: number;
  totalTransactions: number;
  currentGroup: string;
  error?: string;
}

export interface RowState {
  selected: boolean;
  category: string;
  createRule: boolean;
}

export type DialogMode = 'closed' | 'open' | 'minimized';
export type Step = 1 | 2 | 3;

export interface BatchFilters {
  year?: string;
  month?: string;
  account?: string;
}

interface BatchContextValue {
  progress: BatchState;
  step: Step;
  rowStates: Map<string, RowState>;
  dialogMode: DialogMode;

  start: (filters?: BatchFilters) => void;
  stop: () => void;
  reset: () => void;
  openDialog: () => void;
  minimizeDialog: () => void;
  closeDialog: () => void;
  setStep: (s: Step) => void;
  setRowStates: React.Dispatch<React.SetStateAction<Map<string, RowState>>>;
}

const BatchContext = createContext<BatchContextValue | null>(null);

export function useBatchContext() {
  const ctx = useContext(BatchContext);
  if (!ctx) throw new Error('useBatchContext must be used within BatchCategoryProvider');
  return ctx;
}

const IDLE_STATE: BatchState = {
  status: 'idle', suggestions: [], completed: 0, totalGroups: 0, totalTransactions: 0, currentGroup: '',
};

export function BatchCategoryProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<BatchState>(IDLE_STATE);
  const [step, setStep] = useState<Step>(1);
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [dialogMode, setDialogMode] = useState<DialogMode>('closed');

  const abortRef = useRef<AbortController | null>(null);

  // Initialize row states as suggestions arrive
  useEffect(() => {
    if (progress.suggestions.length === 0) return;
    setRowStates(prev => {
      const next = new Map(prev);
      for (const s of progress.suggestions) {
        if (!next.has(s.counterparty)) {
          next.set(s.counterparty, {
            selected: s.confidence !== 'low' && s.suggested_category !== 'Sonstiges',
            category: s.suggested_category,
            createRule: true,
          });
        }
      }
      return next;
    });
  }, [progress.suggestions.length]);

  // Auto-advance step 1→2 when fully done
  useEffect(() => {
    if (progress.status === 'done' && step === 1 && progress.suggestions.length > 0) {
      setStep(2);
    }
  }, [progress.status, step, progress.suggestions.length]);

  const start = useCallback(async (filters?: BatchFilters) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setRowStates(new Map());
    setStep(1);
    setProgress({ status: 'loading', suggestions: [], completed: 0, totalGroups: 0, totalTransactions: 0, currentGroup: '' });

    // Build filter body for the API
    const filterBody: Record<string, string> = {};
    if (filters?.year) filterBody.year = filters.year;
    if (filters?.month) filterBody.month = filters.month;
    if (filters?.account && filters.account !== 'all') filterBody.account_id = filters.account;
    if (filters?.account === 'all') filterBody.include_savings = 'true';

    try {
      const groupsRes = await apiPost<{
        groups: CounterpartyGroup[];
        existing_categories: string[];
        total_transactions: number;
      }>('/ai/batch-groups', filterBody);

      if (abort.signal.aborted) return;

      const { groups, existing_categories, total_transactions } = groupsRes;

      if (groups.length === 0) {
        setProgress(p => ({ ...p, status: 'done', totalTransactions: total_transactions }));
        return;
      }

      setProgress(p => ({
        ...p,
        totalGroups: groups.length,
        totalTransactions: total_transactions,
      }));

      for (let i = 0; i < groups.length; i++) {
        if (abort.signal.aborted) return;

        const group = groups[i];
        setProgress(p => ({ ...p, currentGroup: group.counterparty }));

        try {
          const suggestion = await apiPost<BatchSuggestion>('/ai/batch-categorize', {
            group,
            existing_categories,
          });
          if (abort.signal.aborted) return;
          setProgress(p => ({
            ...p,
            suggestions: [...p.suggestions, suggestion],
            completed: i + 1,
          }));
        } catch (err: any) {
          if (abort.signal.aborted) return;
          const fallback: BatchSuggestion = {
            counterparty: group.counterparty,
            transaction_ids: group.transaction_ids,
            suggested_category: 'Sonstiges',
            is_new_category: false,
            confidence: 'low',
            rule_pattern: group.counterparty || '',
            rule_match_type: 'keyword',
            rule_match_field: 'counterparty',
            explanation: `Fehler: ${err.message}`,
            count: group.count,
          };
          setProgress(p => ({
            ...p,
            suggestions: [...p.suggestions, fallback],
            completed: i + 1,
          }));
        }
      }

      if (!abort.signal.aborted) {
        setProgress(p => ({ ...p, status: 'done', currentGroup: '' }));
      }
    } catch (err: any) {
      if (!abort.signal.aborted) {
        setProgress(p => ({ ...p, status: 'error', error: err.message }));
      }
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setProgress(p => ({ ...p, status: 'stopped', currentGroup: '' }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setProgress(IDLE_STATE);
    setStep(1);
    setRowStates(new Map());
    setDialogMode('closed');
  }, []);

  const openDialog = useCallback(() => setDialogMode('open'), []);
  const minimizeDialog = useCallback(() => setDialogMode('minimized'), []);
  const closeDialog = useCallback(() => {
    if (progress.status === 'idle') {
      reset();
    } else {
      setDialogMode('minimized');
    }
  }, [progress.status, reset]);

  return (
    <BatchContext.Provider value={{
      progress, step, rowStates, dialogMode,
      start, stop, reset, openDialog, minimizeDialog, closeDialog,
      setStep, setRowStates,
    }}>
      {children}
    </BatchContext.Provider>
  );
}
