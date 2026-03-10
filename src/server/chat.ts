import { Router, Request, Response } from 'express';
import { chat, toolDefinition, toServerSentEventsResponse } from '@tanstack/ai';
import { createOpenaiChat } from '@tanstack/ai-openai';
import { z } from 'zod';
import { prisma } from './prisma.js';
import { getModelForUser, OPENROUTER_BASE, hasApiKey } from './ai.js';

const chatRouter = Router();

// ── Helpers ─────────────────────────────────────────────────────────

function serialize<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data === 'bigint') return Number(data) as unknown as T;
  if (Array.isArray(data)) return data.map(serialize) as unknown as T;
  if (typeof data === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serialize(value);
    }
    return result;
  }
  return data;
}

/** Coerce value to string or undefined — LLMs often send numbers where we expect strings */
function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v);
}

function accountFilterSql(params: any[], opts: { account_id?: string }, userId: string): string {
  let sql = ' AND a.userId = ?';
  params.push(userId);
  if (opts.account_id) {
    sql += ' AND t.account_id = ?';
    params.push(parseInt(opts.account_id));
  } else {
    sql += ' AND a.is_active = 1';
  }
  return sql;
}

// ── Tool definitions ────────────────────────────────────────────────
// Input schemas use z.any() for fields the LLM might send as numbers or strings.
// No outputSchema — avoids validation errors on tool results.

function buildTools(userId: string) {
  // 1. queryTransactions
  const queryTransactionsDef = toolDefinition({
    name: 'queryTransactions',
    description: 'Suche und filtere Transaktionen nach verschiedenen Kriterien. Gibt einzelne Buchungen zurueck.',
    inputSchema: z.object({
      month: z.any().optional().describe('Monat als Zahl (1-12)'),
      year: z.any().optional().describe('Jahr (z.B. 2025)'),
      category: z.any().optional().describe('Kategorie-Name'),
      direction: z.any().optional().describe('debit=Ausgabe, credit=Einnahme'),
      search: z.any().optional().describe('Freitext-Suche in Beschreibung und Empfaenger'),
      counterparty: z.any().optional().describe('Name des Zahlungsempfaengers/Auftraggebers'),
      limit: z.any().optional().describe('Max. Anzahl Ergebnisse (Standard 20, Max 50)'),
      account_id: z.any().optional().describe('Bestimmtes Bankkonto (ID)'),
    }),
  });

  const queryTransactions = queryTransactionsDef.server(async (raw: any) => {
    try {
      const year = str(raw.year);
      const month = str(raw.month);
      const account_id = str(raw.account_id);
      const category = str(raw.category);
      const direction = str(raw.direction);
      const search = str(raw.search);
      const counterparty = str(raw.counterparty);
      const limit = Math.min(Number(raw.limit) || 20, 50);

      const params: any[] = [];
      let sql = `SELECT t.id, t.bu_date, t.amount, t.direction, t.counterparty, t.description, t.category, a.bank as bank_name
        FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE 1=1`;
      sql += accountFilterSql(params, { account_id }, userId);
      if (year) { sql += " AND strftime('%Y', t.bu_date) = ?"; params.push(year); }
      if (month) { sql += " AND strftime('%m', t.bu_date) = ?"; params.push(month.padStart(2, '0')); }
      if (category) { sql += ' AND t.category = ?'; params.push(category); }
      if (direction) { sql += ' AND t.direction = ?'; params.push(direction); }
      if (search) { sql += ' AND (t.description LIKE ? OR t.counterparty LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      if (counterparty) { sql += ' AND t.counterparty LIKE ?'; params.push(`%${counterparty}%`); }
      sql += ' ORDER BY t.bu_date DESC LIMIT ?';
      params.push(limit);
      console.log('[Chat Tool] queryTransactions:', { year, month, category, search, counterparty });
      const rows: any[] = await prisma.$queryRawUnsafe(sql, ...params);
      return serialize({ transactions: rows, count: rows.length });
    } catch (err: any) {
      console.error('[Chat Tool] queryTransactions error:', err.message);
      return { transactions: [], count: 0, error: err.message };
    }
  });

  // 2. getMonthlyAnalysis
  const getMonthlyAnalysisDef = toolDefinition({
    name: 'getMonthlyAnalysis',
    description: 'Zeigt monatliche Einnahmen, Ausgaben und Anzahl der Buchungen. Gut fuer Trends und Vergleiche.',
    inputSchema: z.object({
      year: z.any().optional().describe('Jahr filtern (z.B. 2025)'),
      account_id: z.any().optional().describe('Bestimmtes Bankkonto (ID)'),
    }),
  });

  const getMonthlyAnalysis = getMonthlyAnalysisDef.server(async (raw: any) => {
    try {
      const year = str(raw.year);
      const account_id = str(raw.account_id);
      const params: any[] = [];
      let sql = `SELECT strftime('%Y-%m', t.bu_date) as month,
        SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) as income,
        SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) as expenses,
        COUNT(*) as count
        FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE 1=1`;
      sql += accountFilterSql(params, { account_id }, userId);
      if (year) { sql += " AND strftime('%Y', t.bu_date) = ?"; params.push(year); }
      sql += ' GROUP BY month ORDER BY month ASC';
      console.log('[Chat Tool] getMonthlyAnalysis:', { year });
      const rows: any[] = await prisma.$queryRawUnsafe(sql, ...params);
      return serialize({ months: rows });
    } catch (err: any) {
      console.error('[Chat Tool] getMonthlyAnalysis error:', err.message);
      return { months: [], error: err.message };
    }
  });

  // 3. getCategoryBreakdown
  const getCategoryBreakdownDef = toolDefinition({
    name: 'getCategoryBreakdown',
    description: 'Zeigt Ausgaben oder Einnahmen aufgeschluesselt nach Kategorie. Gut fuer "Wo gebe ich am meisten aus?"',
    inputSchema: z.object({
      year: z.any().optional().describe('Jahr (z.B. 2025)'),
      month: z.any().optional().describe('Monat als Zahl (1-12)'),
      direction: z.any().optional().describe('debit=Ausgaben, credit=Einnahmen. Standard: debit'),
      account_id: z.any().optional().describe('Bestimmtes Bankkonto (ID)'),
    }),
  });

  const getCategoryBreakdown = getCategoryBreakdownDef.server(async (raw: any) => {
    try {
      const year = str(raw.year);
      const month = str(raw.month);
      const direction = str(raw.direction) || 'debit';
      const account_id = str(raw.account_id);
      const params: any[] = [direction];
      let sql = `SELECT t.category, SUM(t.amount) as total, COUNT(*) as count
        FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id
        WHERE t.direction = ?`;
      sql += accountFilterSql(params, { account_id }, userId);
      if (year) { sql += " AND strftime('%Y', t.bu_date) = ?"; params.push(year); }
      if (month) { sql += " AND strftime('%m', t.bu_date) = ?"; params.push(month.padStart(2, '0')); }
      sql += ' GROUP BY t.category ORDER BY total DESC';
      console.log('[Chat Tool] getCategoryBreakdown:', { year, month, direction });
      const rows: any[] = await prisma.$queryRawUnsafe(sql, ...params);
      return serialize({ categories: rows });
    } catch (err: any) {
      console.error('[Chat Tool] getCategoryBreakdown error:', err.message);
      return { categories: [], error: err.message };
    }
  });

  // 4. getSummary
  const getSummaryDef = toolDefinition({
    name: 'getSummary',
    description: 'Gibt eine Gesamtuebersicht: Anzahl Transaktionen, Gesamteinnahmen, Gesamtausgaben, Zeitraum.',
    inputSchema: z.object({
      account_id: z.any().optional().describe('Bestimmtes Bankkonto (ID)'),
    }),
  });

  const getSummary = getSummaryDef.server(async (raw: any) => {
    try {
      const account_id = str(raw.account_id);
      const params: any[] = [];
      let sql = `SELECT COUNT(*) as total_transactions,
        SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) as total_income,
        SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) as total_expenses,
        MIN(t.bu_date) as earliest, MAX(t.bu_date) as latest
        FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE 1=1`;
      sql += accountFilterSql(params, { account_id }, userId);
      console.log('[Chat Tool] getSummary');
      const rows: any[] = await prisma.$queryRawUnsafe(sql, ...params);
      const row = serialize(rows)[0] || {};
      return {
        total_transactions: row.total_transactions || 0,
        total_income: row.total_income || 0,
        total_expenses: row.total_expenses || 0,
        earliest: row.earliest || null,
        latest: row.latest || null,
      };
    } catch (err: any) {
      console.error('[Chat Tool] getSummary error:', err.message);
      return { total_transactions: 0, total_income: 0, total_expenses: 0, earliest: null, latest: null, error: err.message };
    }
  });

  // 5. getAccounts
  const getAccountsDef = toolDefinition({
    name: 'getAccounts',
    description: 'Listet alle Bankkonten des Nutzers mit Anzahl der Transaktionen auf.',
    inputSchema: z.object({}).passthrough(),
  });

  const getAccounts = getAccountsDef.server(async () => {
    try {
      console.log('[Chat Tool] getAccounts');
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT a.id, a.name, a.bank, a.iban, a.account_type, a.is_active,
          COUNT(t.id) as tx_count
        FROM bank_accounts a LEFT JOIN transactions t ON t.account_id = a.id
        WHERE a.userId = ?
        GROUP BY a.id ORDER BY a.bank, a.name`,
        userId,
      );
      return serialize({ accounts: rows });
    } catch (err: any) {
      console.error('[Chat Tool] getAccounts error:', err.message);
      return { accounts: [], error: err.message };
    }
  });

  // 6. getCategoryMonthly
  const getCategoryMonthlyDef = toolDefinition({
    name: 'getCategoryMonthly',
    description: 'Zeigt Kategorie-Trends ueber die Monate. Gut fuer "Wie entwickeln sich meine Ausgaben fuer X?"',
    inputSchema: z.object({
      year: z.any().optional().describe('Jahr (z.B. 2025)'),
      account_id: z.any().optional().describe('Bestimmtes Bankkonto (ID)'),
    }),
  });

  const getCategoryMonthly = getCategoryMonthlyDef.server(async (raw: any) => {
    try {
      const year = str(raw.year);
      const account_id = str(raw.account_id);
      const params: any[] = [];
      let sql = `SELECT t.category, strftime('%Y-%m', t.bu_date) as month, SUM(t.amount) as total, COUNT(*) as count
        FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id
        WHERE t.direction = 'debit'`;
      sql += accountFilterSql(params, { account_id }, userId);
      if (year) { sql += " AND strftime('%Y', t.bu_date) = ?"; params.push(year); }
      sql += ' GROUP BY t.category, month ORDER BY t.category, month';
      console.log('[Chat Tool] getCategoryMonthly:', { year });
      const rows: any[] = await prisma.$queryRawUnsafe(sql, ...params);
      return serialize({ data: rows });
    } catch (err: any) {
      console.error('[Chat Tool] getCategoryMonthly error:', err.message);
      return { data: [], error: err.message };
    }
  });

  // 7. updateCategory
  const updateCategoryDef = toolDefinition({
    name: 'updateCategory',
    description: 'Aendert die Kategorie fuer eine oder mehrere Transaktionen. Nur existierende Kategorien verwenden. Zuerst queryTransactions aufrufen um die IDs zu ermitteln.',
    inputSchema: z.object({
      transaction_ids: z.array(z.any()).describe('Array von Transaktions-IDs'),
      category: z.any().describe('Name der neuen Kategorie (muss existieren)'),
    }),
  });

  const updateCategory = updateCategoryDef.server(async (raw: any) => {
    try {
      const category = str(raw.category);
      if (!category) {
        return { success: false, updated: 0, error: 'Kein Kategorie-Name angegeben' };
      }

      // Verify category exists for this user
      const cat = await prisma.category.findFirst({ where: { name: category, userId } });
      if (!cat) {
        // List available categories to help the LLM
        const available = await prisma.category.findMany({ where: { userId }, select: { name: true }, orderBy: { name: 'asc' } });
        const names = available.map(c => c.name).join(', ');
        return { success: false, updated: 0, error: `Kategorie "${category}" existiert nicht. Verfuegbare Kategorien: ${names}` };
      }

      const ids: number[] = (Array.isArray(raw.transaction_ids) ? raw.transaction_ids : [])
        .map((id: any) => parseInt(String(id)))
        .filter((id: number) => !isNaN(id));

      if (ids.length === 0) {
        return { success: false, updated: 0, error: 'Keine gueltigen Transaktions-IDs angegeben' };
      }

      // Verify ownership: all transactions must belong to user's accounts
      const owned: any[] = await prisma.$queryRawUnsafe(
        `SELECT t.id FROM transactions t
         INNER JOIN bank_accounts a ON t.account_id = a.id
         WHERE a.userId = ? AND t.id IN (${ids.map(() => '?').join(',')})`,
        userId, ...ids,
      );
      const ownedIds = new Set(serialize(owned).map((r: any) => Number(r.id)));
      const validIds = ids.filter(id => ownedIds.has(id));

      if (validIds.length === 0) {
        return { success: false, updated: 0, error: 'Keine der angegebenen Transaktionen gefunden' };
      }

      // Batch update
      await prisma.$executeRawUnsafe(
        `UPDATE transactions SET category = ? WHERE id IN (${validIds.map(() => '?').join(',')})`,
        category, ...validIds,
      );

      console.log('[Chat Tool] updateCategory:', { category, requested: ids.length, updated: validIds.length });
      return { success: true, updated: validIds.length, category };
    } catch (err: any) {
      console.error('[Chat Tool] updateCategory error:', err.message);
      return { success: false, updated: 0, error: err.message };
    }
  });

  return [queryTransactions, getMonthlyAnalysis, getCategoryBreakdown, getSummary, getAccounts, getCategoryMonthly, updateCategory];
}

// ── System prompt ───────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const now = new Date();
  const today = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const monthName = now.toLocaleDateString('de-DE', { month: 'long' });
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return `Du bist der Finanzassistent von expenze, einer persoenlichen Finanz-App.

Heute ist der ${today}. Der aktuelle Monat ist ${monthName} ${year} (year="${year}", month="${month}").

Deine Faehigkeiten:
- Transaktionen suchen und filtern (nach Datum, Kategorie, Empfaenger, Betrag)
- Monatliche Einnahmen/Ausgaben analysieren und vergleichen
- Ausgaben nach Kategorien aufschluesseln
- Gesamtuebersicht ueber alle Finanzdaten geben
- Bankkonten auflisten
- Kategorie-Trends ueber Zeit zeigen
- Kategorien von Transaktionen aendern (nur existierende Kategorien)

Regeln:
- Antworte IMMER auf Deutsch
- Verwende deutsches Zahlenformat (1.234,56 EUR) und deutsches Datumsformat (DD.MM.YYYY)
- Verwende IMMER die verfuegbaren Tools bevor du eine Frage zu Finanzdaten beantwortest
- Gib KEINE Finanzberatung oder Anlageempfehlungen
- Sei praezise und fasse Ergebnisse uebersichtlich zusammen
- Wenn du keine passenden Daten findest, sage das ehrlich
- Wenn ein Tool leere Ergebnisse liefert, teile dem Nutzer mit dass keine Daten fuer den Zeitraum gefunden wurden
- Runde Betraege auf 2 Dezimalstellen
- Uebergib year und month IMMER als Strings an die Tools (z.B. "2025", "7")
- Vor einer Kategorie-Aenderung: zuerst die Transaktionen mit queryTransactions suchen um die IDs zu ermitteln, dann updateCategory mit den IDs aufrufen
- Nach einer Kategorie-Aenderung: bestaetigen welche Transaktionen geaendert wurden

Formatierung (Markdown):
- Deine Antworten werden als Markdown gerendert — nutze das aktiv
- Verwende **fett** fuer Betraege und wichtige Zahlen
- Verwende Tabellen (| Spalte | ...) fuer strukturierte Daten wie Kategorien, monatliche Uebersichten oder Transaktionslisten
- Verwende Aufzaehlungen (- ...) fuer kurze Listen
- Verwende Ueberschriften (### ...) um laengere Antworten zu gliedern
- Halte Antworten kompakt und uebersichtlich`;
}

// ── POST /api/chat ──────────────────────────────────────────────────

chatRouter.post('/chat', async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;

  if (!hasApiKey()) {
    res.status(400).json({ error: 'Kein OpenRouter API-Key konfiguriert. Bitte OPENROUTER_API_KEY in .env setzen.' });
    return;
  }

  try {
    const { messages } = req.body;
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'messages array required' });
      return;
    }

    const model = await getModelForUser(userId);
    const apiKey = process.env.OPENROUTER_API_KEY!;

    console.log('[Chat] Request from user', userId, '| model:', model, '| messages:', messages.length);

    // createOpenaiChat expects OpenAI model literals; cast for OpenRouter compatibility
    const adapter = createOpenaiChat(model as any, apiKey, { baseURL: OPENROUTER_BASE });
    const tools = buildTools(userId);

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const stream = chat({
      adapter,
      messages,
      tools,
      systemPrompts: [buildSystemPrompt()],
    });

    const sseResponse = toServerSentEventsResponse(stream);

    // Bridge Web Response headers to Express
    sseResponse.headers.forEach((v: string, k: string) => res.setHeader(k, v));
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const reader = sseResponse.body?.getReader();
    if (!reader) {
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || abortController.signal.aborted) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (err: any) {
        console.error('[Chat] Stream error:', err.message || err);
      }
      res.end();
    };

    pump();
  } catch (err: any) {
    console.error('[Chat] Error:', err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat-Fehler: ' + (err.message || 'Unbekannter Fehler') });
    }
  }
});

export { chatRouter };
