import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost, apiPatch, apiDelete } from './client';

// ── AI Model Settings ───────────────────────────────────────────────

export interface AiModelSettings {
  current: string;
  presets: { id: string; label: string }[];
  freeModel: { id: string; label: string };
  custom: string[];
  hasApiKey: boolean;
  zdrModelIds: string[];
  availableModelIds: string[];
}

export function useAiModel() {
  return useQuery<AiModelSettings>({
    queryKey: ['aiModel'],
    queryFn: () => apiFetch('/settings/ai-model'),
  });
}

export function useSetAiModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: string) =>
      apiPatch<{ success: boolean }>('/settings/ai-model', { model }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aiModel'] }),
  });
}

export function useAddCustomModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: string) =>
      apiPost<{ success: boolean }>('/settings/ai-model/custom', { model }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aiModel'] }),
  });
}

export function useRemoveCustomModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: string) =>
      apiFetch<{ success: boolean }>('/settings/ai-model/custom', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aiModel'] }),
  });
}

export interface BrowseModel {
  id: string;
  name: string;
  isFree: boolean;
  promptPrice: number;
  completionPrice: number;
  contextLength: number;
  provider: string;
  supportsZdr: boolean;
}

export interface BrowseModelsResponse {
  models: BrowseModel[];
  providers: string[];
}

export function useModelBrowser(enabled: boolean) {
  return useQuery<BrowseModelsResponse>({
    queryKey: ['modelBrowser'],
    queryFn: () => apiFetch('/settings/ai-model/browse'),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}

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
  counterparty_iban: string | null;
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
  category_type: 'default' | 'savings';
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
  imported?: number;
  skipped?: number;
  duplicates?: number;
  total: number;
  bank: string;
  importId?: string;
  conflict?: boolean;
  matchingTemplates?: { id: string; name: string }[];
}

export interface ImportProgressResponse {
  id: string;
  status: 'parsing' | 'processing' | 'done' | 'error';
  filename: string;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  duplicates: number;
  error?: string;
  bank: string;
}

export function fetchImportStatus(importId: string): Promise<ImportProgressResponse> {
  return apiFetch<ImportProgressResponse>(`/import/${importId}/status`);
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
  category_id: number;
  is_default: boolean;
  category_type: 'default' | 'savings';
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
  is_active: boolean;
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
    mutationFn: ({ id, ...data }: { id: number; name?: string; account_type?: string; bank?: string; is_active?: boolean }) =>
      apiPatch<Account>(`/accounts/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['monthly'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete<{ success: boolean }>(`/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['monthly'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
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

export function useCategoryOverview(filters?: { year?: string; month?: string; account?: string }) {
  const params = new URLSearchParams();
  if (filters?.year) params.set('year', filters.year);
  if (filters?.month) params.set('month', filters.month);
  if (filters?.account) accountParams(params, filters.account);
  const qs = params.toString();

  return useQuery<CategoryOverview[]>({
    queryKey: ['categoryOverview', filters?.year || '', filters?.month || '', filters?.account || ''],
    queryFn: () => apiFetch(`/categories/overview${qs ? `?${qs}` : ''}`),
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

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiPost<{ id: number; name: string }>('/categories', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categoryList'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
    },
  });
}

export function useUpdateCategoryMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; category_type?: 'default' | 'savings' }) =>
      apiPatch<{ id: number; name: string; category_type: string }>(`/categories/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categoryList'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
      qc.invalidateQueries({ queryKey: ['categoryRules'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replacement_category }: { id: number; replacement_category: string }) =>
      apiPost<{ success: boolean; reassigned_transactions: number }>(`/categories/${id}/delete`, { replacement_category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categoryList'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
      qc.invalidateQueries({ queryKey: ['categoryRules'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
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

// ── Bank Templates ──────────────────────────────────────────────────

export interface BankTemplate {
  id: string;
  name: string;
  version: number;
  config: any;
  is_builtin: boolean;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export function useBankTemplates() {
  return useQuery<BankTemplate[]>({
    queryKey: ['bankTemplates'],
    queryFn: () => apiFetch('/bank-templates'),
  });
}

export function useCreateBankTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; name: string; config: any }) =>
      apiPost<BankTemplate>('/bank-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bankTemplates'] }),
  });
}

export function useUpdateBankTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; config?: any; enabled?: boolean }) =>
      apiPatch<BankTemplate>(`/bank-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bankTemplates'] }),
  });
}

export function useDeleteBankTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/bank-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bankTemplates'] }),
  });
}

export function useTestBankTemplate() {
  return useMutation({
    mutationFn: (data: { config: any; csvText: string; bankName?: string }) =>
      apiPost<{ transactions: any[]; total: number }>('/bank-templates/test', data),
  });
}

// ── AI Template Generation ──────────────────────────────────────────

export function useGenerateTemplate() {
  return useMutation({
    mutationFn: (data: { csvSample: string }) =>
      apiPost<{ config: any }>('/ai/generate-template', data),
  });
}

// ── Batch AI Categorization ─────────────────────────────────────────

export interface BatchSuggestion {
  counterparty: string;
  transaction_ids: number[];
  suggested_category: string;
  is_new_category: boolean;
  confidence: 'high' | 'medium' | 'low';
  rule_pattern: string;
  rule_match_type: 'keyword' | 'regex';
  rule_match_field: 'counterparty' | 'description' | 'both';
  explanation: string;
  count: number;
}

export interface CounterpartyGroup {
  counterparty: string;
  transaction_ids: number[];
  sample_descriptions: string[];
  sample_amounts: number[];
  direction: string;
  count: number;
}

export interface BatchApplyAction {
  counterparty: string;
  transaction_ids: number[];
  category: string;
  create_rule: boolean;
  rule?: { pattern: string; match_type: string; match_field: string };
}

export interface BatchApplyResponse {
  success: boolean;
  updated_transactions: number;
  rules_created: number;
}

export interface BatchProgress {
  status: 'idle' | 'loading' | 'done' | 'error' | 'stopped';
  suggestions: BatchSuggestion[];
  completed: number;
  totalGroups: number;
  totalTransactions: number;
  currentGroup: string;
  error?: string;
}

// ── Analytics ────────────────────────────────────────────────────────

export interface FlowData {
  nodes: { id: string; label: string; color: string }[];
  links: { source: string; target: string; value: number }[];
}

export interface DailySpending {
  day: string;
  value: number;
}

export interface CategoryMonthly {
  month: string;
  categories: Record<string, number>;
}

export function useFlowAnalysis(filters: { year?: string; month?: string; account?: string }) {
  const params = new URLSearchParams();
  if (filters.year) params.set('year', filters.year);
  if (filters.month) params.set('month', filters.month);
  if (filters.account) accountParams(params, filters.account);
  const qs = params.toString();

  return useQuery<FlowData>({
    queryKey: ['flowAnalysis', filters],
    queryFn: () => apiFetch(`/analysis/flow${qs ? `?${qs}` : ''}`),
  });
}

export function useDailySpending(filters: { year?: string; account?: string }) {
  const params = new URLSearchParams();
  if (filters.year) params.set('year', filters.year);
  if (filters.account) accountParams(params, filters.account);
  const qs = params.toString();

  return useQuery<DailySpending[]>({
    queryKey: ['dailySpending', filters],
    queryFn: () => apiFetch(`/analysis/daily${qs ? `?${qs}` : ''}`),
  });
}

export function useCategoryMonthly(filters: { year?: string; account?: string }) {
  const params = new URLSearchParams();
  if (filters.year) params.set('year', filters.year);
  if (filters.account) accountParams(params, filters.account);
  const qs = params.toString();

  return useQuery<CategoryMonthly[]>({
    queryKey: ['categoryMonthly', filters],
    queryFn: () => apiFetch(`/analysis/category-monthly${qs ? `?${qs}` : ''}`),
  });
}

export function useBatchApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { actions: BatchApplyAction[] }) =>
      apiPost<BatchApplyResponse>('/ai/batch-apply', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['categoryList'] });
      qc.invalidateQueries({ queryKey: ['categoryOverview'] });
      qc.invalidateQueries({ queryKey: ['categoryRules'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['monthly'] });
    },
  });
}
