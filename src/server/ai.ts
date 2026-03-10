import { prisma } from './prisma.js';
import { BUILTIN_TEMPLATES } from './parsers/builtinTemplates.js';
import type { BankTemplateConfig } from './parsers/types.js';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-preview';

export const PRESET_MODELS = [
  { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
  { id: 'qwen/qwen3.5-flash-02-23', label: 'Qwen 3.5 Flash' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
  { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5' },
  { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast' },
];

export const FREE_MODEL = { id: 'openrouter/free', label: 'Kostenlos (Auto-Router)' };

export function hasApiKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

// ── Dynamic model list from OpenRouter ──────────────────────────────

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  top_provider: { max_completion_tokens: number } | null;
  architecture: { output_modalities: string[] } | null;
}

export interface BrowseModel {
  id: string;
  name: string;
  isFree: boolean;
  promptPrice: number;    // $/M tokens
  completionPrice: number;
  contextLength: number;
  provider: string;       // extracted from id (before "/")
  supportsZdr: boolean;
}

// ── Caches (1 hour TTL) ─────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 1000;

let rawModelsCache: { data: OpenRouterModel[]; ts: number } | null = null;
let zdrModelIdsCache: { data: Set<string>; ts: number } | null = null;

async function fetchRawModels(): Promise<OpenRouterModel[]> {
  if (rawModelsCache && Date.now() - rawModelsCache.ts < CACHE_TTL) {
    return rawModelsCache.data;
  }

  // Use /models/user when API key is available — respects account privacy/ZDR settings
  const apiKey = process.env.OPENROUTER_API_KEY;
  const headers: Record<string, string> = {};
  let url = `${OPENROUTER_BASE}/models`;
  if (apiKey) {
    url = `${OPENROUTER_BASE}/models/user`;
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('OpenRouter models API unavailable');
  const { data } = await res.json() as { data: OpenRouterModel[] };

  rawModelsCache = { data, ts: Date.now() };
  return data;
}

export async function fetchZdrModelIds(): Promise<Set<string>> {
  if (zdrModelIdsCache && Date.now() - zdrModelIdsCache.ts < CACHE_TTL) {
    return zdrModelIdsCache.data;
  }

  try {
    const res = await fetch(`${OPENROUTER_BASE}/endpoints/zdr`);
    if (!res.ok) throw new Error('ZDR endpoint unavailable');
    const { data } = await res.json() as { data: { model_id: string }[] };
    const ids = new Set(data.map(e => e.model_id));
    zdrModelIdsCache = { data: ids, ts: Date.now() };
    return ids;
  } catch (err) {
    console.warn('[AI] Failed to fetch ZDR model list:', (err as Error).message);
    return new Set();
  }
}

async function isZdrSupported(model: string): Promise<boolean> {
  const ids = await fetchZdrModelIds();
  return ids.has(model);
}

export async function fetchAvailableModelIds(): Promise<Set<string>> {
  try {
    const models = await fetchRawModels();
    return new Set(models.map(m => m.id));
  } catch {
    return new Set();
  }
}

function isTextCapable(m: OpenRouterModel): boolean {
  if (!m.pricing) return false;
  const outputs = m.architecture?.output_modalities ?? [];
  if (!outputs.includes('text')) return false;
  const maxComp = m.top_provider?.max_completion_tokens ?? 0;
  if (maxComp > 0 && maxComp < 2048) return false;
  return true;
}

export async function fetchAllModels(): Promise<{ models: BrowseModel[]; providers: string[] }> {
  const [data, zdrIds] = await Promise.all([fetchRawModels(), fetchZdrModelIds()]);

  const models: BrowseModel[] = data
    .filter(m => {
      if (!isTextCapable(m)) return false;
      const price = parseFloat(m.pricing.prompt);
      if (isNaN(price)) return false;
      return true;
    })
    .map(m => {
      const promptPrice = Math.round(parseFloat(m.pricing.prompt) * 1_000_000 * 1000) / 1000;
      const completionPrice = Math.round(parseFloat(m.pricing.completion) * 1_000_000 * 1000) / 1000;
      const provider = m.id.split('/')[0] || '';
      return {
        id: m.id,
        name: m.name || m.id,
        isFree: parseFloat(m.pricing.prompt) === 0,
        promptPrice,
        completionPrice,
        contextLength: m.context_length,
        provider,
        supportsZdr: zdrIds.has(m.id),
      };
    })
    .sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return a.promptPrice - b.promptPrice;
    });

  const providers = [...new Set(models.map(m => m.provider))].sort();
  return { models, providers };
}

async function getModel(): Promise<string> {
  const setting = await prisma.setting.findFirst({ where: { key: 'ai_model' } });
  return setting?.value || DEFAULT_MODEL;
}

export async function getModelForUser(userId: string): Promise<string> {
  const setting = await prisma.setting.findFirst({ where: { key: 'ai_model', userId } });
  return setting?.value || DEFAULT_MODEL;
}

interface SuggestContext {
  counterparty: string;
  description: string;
  category: string;
  sampleDescriptions: string[];
}

interface SuggestResult {
  pattern: string;
  match_type: 'regex' | 'keyword';
  match_field: string;
  explanation: string;
}

// ── Batch AI Categorization ─────────────────────────────────────────

export interface CounterpartyGroup {
  counterparty: string;
  transaction_ids: number[];
  sample_descriptions: string[];
  sample_amounts: number[];
  direction: string;
  count: number;
}

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

async function callWithRetry(apiKey: string, model: string, prompt: string, zdr: boolean, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        ...(zdr ? { provider: { zdr: true } } : {}),
      }),
    });

    if (res.status === 429 && attempt < retries - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error: ${res.status} ${text}`);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      console.error('[AI] Empty response from model. Full response:', JSON.stringify(data, null, 2));
      throw new Error('AI returned empty response');
    }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AI] No JSON found in response:', content.substring(0, 500));
      throw new Error('AI returned invalid response format');
    }
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[AI] JSON parse failed:', jsonMatch[0].substring(0, 500));
      throw new Error('AI returned malformed JSON');
    }
  }
  throw new Error('Max retries exceeded');
}

function buildBatchPrompt(group: CounterpartyGroup, existingCategories: string[]): string {
  const isDescription = !group.counterparty || group.counterparty.trim() === '';
  const label = isDescription ? 'Beschreibung' : 'Empfänger';
  const value = isDescription ? group.sample_descriptions[0]?.substring(0, 60) || 'unbekannt' : group.counterparty;
  const direction = group.direction === 'credit' ? 'Einnahme' : 'Ausgabe';

  return `Du bist ein Experte für Banktransaktions-Kategorisierung.

Vorhandene Kategorien (bevorzuge diese wenn passend):
${existingCategories.join(', ')}

${label}: ${value}
Richtung: ${direction}
Beispiel-Beschreibungen:
${group.sample_descriptions.map(d => `- ${d}`).join('\n')}
Beispiel-Beträge: ${group.sample_amounts.map(a => a.toFixed(2) + ' €').join(', ')}

Antworte NUR mit JSON:
{
  "category": "...",
  "is_new": true/false,
  "confidence": "high" | "medium" | "low",
  "pattern": "...",
  "match_type": "keyword" | "regex",
  "match_field": "counterparty" | "description" | "both",
  "explanation": "..."
}`;
}

export async function categorizeGroup(
  group: CounterpartyGroup,
  existingCategories: string[],
): Promise<BatchSuggestion> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY nicht konfiguriert. Bitte in .env setzen.');
  }

  const model = await getModel();
  const zdr = await isZdrSupported(model);

  try {
    const prompt = buildBatchPrompt(group, existingCategories);
    const parsed = await callWithRetry(apiKey, model, prompt, zdr);

    const confidence = (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low') as 'high' | 'medium' | 'low';
    const matchField = (['counterparty', 'description', 'both'].includes(parsed.match_field) ? parsed.match_field : 'counterparty') as 'counterparty' | 'description' | 'both';
    const matchType = (parsed.match_type === 'regex' ? 'regex' : 'keyword') as 'keyword' | 'regex';

    return {
      counterparty: group.counterparty,
      transaction_ids: group.transaction_ids,
      suggested_category: parsed.category || 'Sonstiges',
      is_new_category: !existingCategories.includes(parsed.category),
      confidence,
      rule_pattern: parsed.pattern || group.counterparty || '',
      rule_match_type: matchType,
      rule_match_field: matchField,
      explanation: parsed.explanation || '',
      count: group.count,
    };
  } catch (err: any) {
    console.error(`[AI] categorizeGroup failed for "${group.counterparty}":`, err.message || err);
    return {
      counterparty: group.counterparty,
      transaction_ids: group.transaction_ids,
      suggested_category: 'Sonstiges',
      is_new_category: false,
      confidence: 'low',
      rule_pattern: group.counterparty || '',
      rule_match_type: 'keyword',
      rule_match_field: 'counterparty',
      explanation: `KI-Analyse fehlgeschlagen: ${err.message || 'Unbekannter Fehler'}`,
      count: group.count,
    };
  }
}

// ── AI Template Generation ──────────────────────────────────────────

function buildTemplatePrompt(csvSample: string): string {
  const c24Config = JSON.stringify(BUILTIN_TEMPLATES[0].config, null, 2);
  const vbConfig = JSON.stringify(BUILTIN_TEMPLATES[1].config, null, 2);

  return `Du bist ein Experte für CSV-Bankdaten. Analysiere die folgende CSV-Datei und erzeuge eine BankTemplateConfig als JSON.

## TypeScript-Interface (Schema-Referenz)

interface ColumnMapping {
  column: string;           // exakter Header-Spaltenname
  fallbackIndex?: number;   // optionaler Index falls Header-Encoding kaputt
  defaultValue?: string;    // Standardwert falls Spalte nicht existiert
  joinColumns?: string[];   // mehrere Spalten zusammenführen
  joinSeparator?: string;   // Trennzeichen beim Zusammenführen
}

interface FallbackRule {
  field: string;
  when: 'empty';
  copyFrom: string;
}

interface BankTemplateConfig {
  detection: { headerStartsWith: string };  // Anfang der Header-Zeile zur Erkennung
  csv: { delimiter: 'auto' | ';' | ','; minColumnsPerRow: number };
  columns: {
    account_number?: ColumnMapping;
    iban?: ColumnMapping;
    bank_name?: ColumnMapping;
    bu_date: ColumnMapping;       // PFLICHT: Buchungsdatum
    value_date?: ColumnMapping;
    type?: ColumnMapping;
    counterparty: ColumnMapping;  // PFLICHT: Zahlungsempfänger/-auftraggeber
    counterparty_iban?: ColumnMapping;
    counterparty_bic?: ColumnMapping;
    purpose?: ColumnMapping;
    amount: ColumnMapping;        // PFLICHT: Betrag
    currency?: ColumnMapping;
    balance_after?: ColumnMapping;
    creditor_id?: ColumnMapping;
    mandate_reference?: ColumnMapping;
    original_category?: ColumnMapping;
  };
  descriptionTemplate: string;   // z.B. '{type} {purpose}'
  hashFields: string[];          // Felder für Deduplizierung
  typeMap?: Record<string, string>;
  fallbacks?: FallbackRule[];
}

## Beispiel 1: C24 Bank
${c24Config}

## Beispiel 2: Volksbank
${vbConfig}

## Regeln
- Verwende die EXAKTEN Spaltennamen aus dem CSV-Header für "column"
- detection.headerStartsWith: die ersten Zeichen der Header-Zeile (erstes Feld reicht)
- Erkenne das Trennzeichen (Semikolon, Komma, oder auto)
- bu_date, counterparty und amount sind PFLICHT
- hashFields: mindestens bu_date, amount, direction, counterparty
- descriptionTemplate: sinnvolle Kombination aus verfügbaren Feldern
- Falls eine Spalte für Empfänger leer sein könnte, füge eine fallback-Regel hinzu
- Antworte NUR mit dem JSON-Objekt, kein Markdown, keine Erklärung

## CSV-Daten (Header + Beispielzeilen)
${csvSample}`;
}

export async function generateTemplateConfig(csvSample: string): Promise<BankTemplateConfig> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY nicht konfiguriert. Bitte in .env setzen.');
  }

  const model = await getModel();
  const zdr = await isZdrSupported(model);
  const prompt = buildTemplatePrompt(csvSample);
  const parsed = await callWithRetry(apiKey, model, prompt, zdr);

  // Validate required fields
  if (!parsed.detection?.headerStartsWith) {
    throw new Error('KI-Antwort fehlt: detection.headerStartsWith');
  }
  if (!parsed.columns?.bu_date) {
    throw new Error('KI-Antwort fehlt: columns.bu_date');
  }
  if (!parsed.columns?.counterparty) {
    throw new Error('KI-Antwort fehlt: columns.counterparty');
  }
  if (!parsed.columns?.amount) {
    throw new Error('KI-Antwort fehlt: columns.amount');
  }
  if (!Array.isArray(parsed.hashFields) || parsed.hashFields.length === 0) {
    throw new Error('KI-Antwort fehlt: hashFields (Array)');
  }

  // Ensure csv defaults
  if (!parsed.csv) {
    parsed.csv = { delimiter: 'auto', minColumnsPerRow: 5 };
  }
  if (!parsed.descriptionTemplate) {
    parsed.descriptionTemplate = '{type} {purpose}';
  }

  return parsed as BankTemplateConfig;
}

export async function suggestCategoryPattern(context: SuggestContext): Promise<SuggestResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const model = await getModel();
  const zdr = await isZdrSupported(model);

  const prompt = `Du bist ein Experte für Banktransaktions-Kategorisierung. Analysiere diese Transaktion und schlage ein Muster vor, das ähnliche Transaktionen automatisch der Kategorie "${context.category}" zuordnet.

Transaktion:
- Empfänger: ${context.counterparty}
- Beschreibung: ${context.description}

Ähnliche Transaktionen:
${context.sampleDescriptions.map(s => `- ${s}`).join('\n')}

Antworte NUR mit einem JSON-Objekt (keine Markdown-Formatierung):
{
  "pattern": "das regex-muster oder stichwort",
  "match_type": "regex" oder "keyword",
  "match_field": "description" oder "counterparty" oder "both",
  "explanation": "kurze deutsche Erklärung warum dieses Muster gewählt wurde"
}

Bevorzuge einfache, robuste Muster. Verwende "keyword" wenn ein einfaches Stichwort ausreicht. Verwende "regex" nur wenn mehrere Varianten abgedeckt werden müssen.`;

  const parsed = await callWithRetry(apiKey, model, prompt, zdr);
  return {
    pattern: parsed.pattern || context.counterparty,
    match_type: parsed.match_type === 'keyword' ? 'keyword' : 'regex',
    match_field: ['description', 'counterparty', 'both'].includes(parsed.match_field) ? parsed.match_field : 'description',
    explanation: parsed.explanation || '',
  };
}
