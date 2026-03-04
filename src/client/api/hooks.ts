import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost, apiPatch, apiDelete } from './client';

// Types
export interface Transaction {
  id: number;
  account_number: string | null;
  bu_date: string | null;
  value_date: string | null;
  type: string | null;
  description: string | null;
  counterparty: string | null;
  amount: number | null;
  direction: string | null;
  category: string | null;
  source_file: string | null;
  hash: string | null;
  account_id: number | null;
  bank_name: string | null;
}

export interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  count: number;
}

export interface CategoryData {
  category: string;
  total: number;
  count: number;
}

export interface SummaryData {
  stats: {
    total_transactions: number;
    total_income: number;
    total_expenses: number;
    earliest: string;
    latest: string;
  };
  imports: ImportLogEntry[];
}

export interface ImportLogEntry {
  id: number;
  filename: string;
  imported_at: string;
  records_imported: number;
  records_skipped: number;
}

export interface ImportResult {
  filename: string;
  imported: number;
  skipped: number;
  total: number;
  bank: string;
}

export interface CategoryRule {
  id: number;
  category: string;
  pattern: string;
  match_field: string;
  match_type: string;
  priority: number;
  is_default: boolean;
  created_at: string | null;
  tx_count?: number;
}

export interface CategoryOverview {
  category: string;
  tx_count: number;
  total_debit: number;
  total_credit: number;
  rule_count: number;
}

export interface RecategorizeRequest {
  transaction_id: number;
  category: string;
  mode: 'single' | 'counterparty' | 'pattern';
  create_rule?: boolean;
  rule?: {
    pattern: string;
    match_field: string;
    match_type: string;
    priority?: number;
  };
}

export interface RecategorizePreview {
  affected_count: number;
  sample_transactions: Transaction[];
}

export interface PatternSuggestion {
  pattern: string;
  match_type: 'regex' | 'keyword';
  match_field: string;
  explanation: string;
}

export interface Account {
  id: number;
  name: string;
  iban: string | null;
  account_number: string | null;
  bank: string;
  account_type: string;
  created_at: string | null;
  transaction_count: number;
}

// Helper: build account query params
function accountParams(params: URLSearchParams, account: string) {
  if (account && account !== 'all') {
    params.set('account_id', account);
  }
  if (account === 'all') {
    params.set('include_savings', 'true');
  }
}

// Query hooks
export function useSummary(account?: string) {
  const params = new URLSearchParams();
  if (account) accountParams(params, account);
  const qs = params.toString();

  return useQuery<SummaryData>({
    queryKey: ['summary', account || ''],
    queryFn: () => apiFetch(`/analysis/summary${qs ? `?${qs}` : ''}`),
  });
}

export function useMonthlyAnalysis(account?: string) {
  const params = new URLSearchParams();
  if (account) accountParams(params, account);
  const qs = params.toString();

  return useQuery<MonthlyData[]>({
    queryKey: ['monthly', account || ''],
    queryFn: () => apiFetch(`/analysis/monthly${qs ? `?${qs}` : ''}`),
  });
}

export function useCategories(filters: { year?: string; month?: string; direction?: string; account?: string }) {
  const params = new URLSearchParams();
  if (filters.year) params.set('year', filters.year);
  if (filters.month) params.set('month', filters.month);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.account) accountParams(params, filters.account);
  const qs = params.toString();

  return useQuery<CategoryData[]>({
    queryKey: ['categories', filters],
    queryFn: () => apiFetch(`/analysis/categories${qs ? `?${qs}` : ''}`),
  });
}

export function useTransactions(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v && k !== 'account') params.set(k, v);
  });
  if (filters.account) accountParams(params, filters.account);
  const qs = params.toString();

  return useQuery<Transaction[]>({
    queryKey: ['transactions', filters],
    queryFn: () => apiFetch(`/transactions${qs ? `?${qs}` : ''}`),
  });
}

export function useCategoryList() {
  return useQuery<string[]>({
    queryKey: ['categoryList'],
    queryFn: () => apiFetch('/categories'),
  });
}

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => apiFetch('/accounts'),
  });
}

// Mutations
export function useImportFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      apiPost<{ success: boolean; results: ImportResult[] }>('/import', formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['monthly'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['categoryList'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      apiPatch<{ success: boolean }>(`/transactions/${id}/category`, { category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['categoryList'] });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; account_type?: string; bank?: string }) =>
      apiPatch<Account>(`/accounts/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// Category Rules hooks
export function useCategoryRules() {
  return useQuery<CategoryRule[]>({
    queryKey: ['categoryRules'],
    queryFn: () => apiFetch('/category-rules'),
  });
}

export function useCategoryOverview() {
  return useQuery<CategoryOverview[]>({
    queryKey: ['categoryOverview'],
    queryFn: () => apiFetch('/categories/overview'),
  });
}

export function useCreateCategoryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CategoryRule, 'id' | 'is_default' | 'created_at' | 'tx_count'>) =>
      apiPost<CategoryRule>('/category-rules', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categoryRules'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
    },
  });
}

export function useUpdateCategoryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; category?: string; pattern?: string; match_field?: string; match_type?: string; priority?: number }) =>
      apiPatch<CategoryRule>(`/category-rules/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categoryRules'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
    },
  });
}

export function useDeleteCategoryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ success: boolean }>(`/category-rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categoryRules'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
    },
  });
}

export function useRecategorize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecategorizeRequest) =>
      apiPost<{ success: boolean; updated: number }>('/transactions/recategorize', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['categoryList'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
      qc.invalidateQueries({ queryKey: ['categoryRules'] });
    },
  });
}

export function useRecategorizePreview() {
  return useMutation({
    mutationFn: (data: { transaction_id: number; category: string; mode: string }) =>
      apiPost<RecategorizePreview>('/transactions/recategorize/preview', data),
  });
}

export function useSuggestPattern() {
  return useMutation({
    mutationFn: (data: { transaction_id: number; category: string }) =>
      apiPost<PatternSuggestion>('/ai/suggest-pattern', data),
  });
}
