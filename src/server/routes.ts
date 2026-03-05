import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from './prisma.js';
import { parsePdf } from './parser.js';
import { Prisma } from '@prisma/client';
import { categorizeWithRules, extractCounterpartyIban, type DbCategoryRule } from './parsers/types.js';
import { suggestCategoryPattern, categorizeGroup, PRESET_MODELS, FREE_MODEL, hasApiKey, fetchAllModels, fetchZdrModelIds, fetchAvailableModelIds, type CounterpartyGroup } from './ai.js';
import { DEFAULT_RULES, DEFAULT_CATEGORIES } from './defaultRules.js';

const router = Router();

// Convert BigInt values from Prisma $queryRaw to plain numbers
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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Auto-create category in table if it doesn't exist
async function ensureCategoryExists(name: string) {
  const existing = await prisma.category.findUnique({ where: { name } });
  if (!existing) {
    await prisma.category.create({
      data: { name, is_default: false, created_at: new Date().toISOString() },
    });
  }
}

// Find or create account from parsed transaction data
async function findOrCreateAccount(tx: { iban: string | null; account_number: string; bank_name: string }): Promise<number> {
  // Try to find by IBAN first, then by account_number
  if (tx.iban) {
    const existing = await prisma.account.findUnique({ where: { iban: tx.iban } });
    if (existing) return existing.id;
  }
  if (tx.account_number && tx.account_number !== '' && tx.account_number !== 'unknown') {
    const existing = await prisma.account.findUnique({ where: { account_number: tx.account_number } });
    if (existing) return existing.id;
  }

  // Auto-create
  const name = tx.bank_name === 'C24' ? 'C24 Smartkonto' : `${tx.bank_name} Girokonto`;
  const account = await prisma.account.create({
    data: {
      name,
      iban: tx.iban || null,
      account_number: (tx.account_number && tx.account_number !== '' && tx.account_number !== 'unknown') ? tx.account_number : null,
      bank: tx.bank_name,
      account_type: 'checking',
      created_at: new Date().toISOString(),
    },
  });
  return account.id;
}

// Import PDF
router.post('/import', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const results = [];

    // Fetch DB rules once for all files
    const dbRules = await prisma.categoryRule.findMany() as unknown as DbCategoryRule[];

    for (const file of files) {
      const { transactions, detectedBank } = await parsePdf(file.buffer, file.originalname);
      let imported = 0, skipped = 0;

      // Find or create account from first transaction
      let accountId: number | null = null;
      if (transactions.length > 0) {
        accountId = await findOrCreateAccount(transactions[0]);
      }

      for (const tx of transactions) {
        // Re-categorize using DB rules (overrides hardcoded parser rules)
        const category = categorizeWithRules(tx.description || '', tx.counterparty || '', dbRules);
        try {
          await prisma.transaction.create({
            data: {
              account_number: tx.account_number,
              bu_date: tx.bu_date,
              value_date: tx.value_date,
              type: tx.type,
              description: tx.description,
              counterparty: tx.counterparty,
              counterparty_iban: tx.counterparty_iban,
              amount: tx.amount,
              direction: tx.direction,
              category: category,
              source_file: tx.source_file,
              hash: tx.hash,
              account_id: accountId,
            },
          });
          imported++;
        } catch (e: any) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            skipped++;
          } else {
            throw e;
          }
        }
      }

      await prisma.importLog.create({
        data: {
          filename: file.originalname,
          imported_at: new Date().toISOString(),
          records_imported: imported,
          records_skipped: skipped,
        },
      });

      results.push({ filename: file.originalname, imported, skipped, total: transactions.length, bank: detectedBank });
    }

    res.json({ success: true, results });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: build account filter SQL clause
function accountFilterSql(params: any[], query: Record<string, string>): string {
  const { account_id, include_savings } = query;
  let sql = '';
  if (account_id) {
    sql += ' AND t.account_id = ?';
    params.push(parseInt(account_id));
  } else if (include_savings !== 'true') {
    // Exclude savings accounts by default
    sql += ' AND (t.account_id IS NULL OR t.account_id NOT IN (SELECT id FROM accounts WHERE account_type = \'savings\'))';
  }
  return sql;
}

// Get transactions with optional filters
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { month, year, direction, category, search, limit = '500', account_id, include_savings } = req.query as Record<string, string>;

    let sql = 'SELECT t.*, a.bank as bank_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE 1=1';
    const params: any[] = [];

    sql += accountFilterSql(params, { account_id, include_savings });
    if (year) { sql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }
    if (month) { sql += ' AND strftime("%m", t.bu_date) = ?'; params.push(month.padStart(2, '0')); }
    if (direction) { sql += ' AND t.direction = ?'; params.push(direction); }
    if (category) { sql += ' AND t.category = ?'; params.push(category); }
    if (search) { sql += ' AND (t.description LIKE ? OR t.counterparty LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    sql += ' ORDER BY t.bu_date DESC LIMIT ?';
    params.push(parseInt(limit));

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    res.json(serialize(rows));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Monthly overview
router.get('/analysis/monthly', async (req: Request, res: Response) => {
  try {
    const { account_id, include_savings } = req.query as Record<string, string>;
    let sql = `
      SELECT
        strftime('%Y-%m', t.bu_date) as month,
        SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) as income,
        SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) as expenses,
        COUNT(*) as count
      FROM transactions t
      WHERE 1=1
    `;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings });
    sql += ' GROUP BY month ORDER BY month ASC';

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    res.json(serialize(rows));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Category breakdown
router.get('/analysis/categories', async (req: Request, res: Response) => {
  try {
    const { year, month, direction = 'debit', account_id, include_savings } = req.query as Record<string, string>;

    let sql = `
      SELECT t.category,
        CAST(SUM(t.amount) AS REAL) as total,
        COUNT(*) as count,
        COALESCE(c.category_type, 'default') as category_type
      FROM transactions t
      LEFT JOIN categories c ON c.name = t.category
      WHERE t.direction = ?
    `;
    const params: any[] = [direction];

    sql += accountFilterSql(params, { account_id, include_savings });
    if (year) { sql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }
    if (month) { sql += ' AND strftime("%m", t.bu_date) = ?'; params.push(month.padStart(2, '0')); }

    sql += ' GROUP BY t.category ORDER BY total DESC';
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    res.json(serialize(rows));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stats summary
router.get('/analysis/summary', async (req: Request, res: Response) => {
  try {
    const { account_id, include_savings } = req.query as Record<string, string>;
    let sql = `
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) as total_income,
        SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) as total_expenses,
        MIN(t.bu_date) as earliest,
        MAX(t.bu_date) as latest
      FROM transactions t
      WHERE 1=1
    `;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings });

    const totals: any[] = await prisma.$queryRawUnsafe(sql, ...params);
    const importLog = await prisma.importLog.findMany({
      orderBy: { imported_at: 'desc' },
    });
    res.json({ stats: serialize(totals[0]), imports: importLog });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update category for a transaction
router.patch('/transactions/:id/category', async (req: Request, res: Response) => {
  try {
    const { category } = req.body;
    await prisma.transaction.update({
      where: { id: parseInt(req.params.id as string) },
      data: { category },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all available categories
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json(rows.map(r => r.name));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List all accounts with transaction counts
router.get('/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      include: { _count: { select: { transactions: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(accounts.map(a => ({
      ...a,
      transaction_count: a._count.transactions,
      _count: undefined,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update account
router.patch('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { name, account_type, bank } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (account_type !== undefined) data.account_type = account_type;
    if (bank !== undefined) data.bank = bank;

    const account = await prisma.account.update({
      where: { id: parseInt(req.params.id as string) },
      data,
    });
    res.json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Category Rules CRUD ====================

// List all rules with tx count per category
router.get('/category-rules', async (_req: Request, res: Response) => {
  try {
    const rules = await prisma.categoryRule.findMany({ orderBy: { priority: 'asc' } });
    // Get tx counts per category
    const counts: any[] = await prisma.$queryRawUnsafe(
      `SELECT category, COUNT(*) as count FROM transactions GROUP BY category`
    );
    const countMap: Record<string, number> = {};
    for (const row of counts) {
      countMap[row.category] = Number(row.count);
    }
    res.json(rules.map(r => ({ ...r, tx_count: countMap[r.category] || 0 })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create rule
router.post('/category-rules', async (req: Request, res: Response) => {
  try {
    const { category, pattern, match_field, match_type, priority } = req.body;
    await ensureCategoryExists(category);
    // Validate regex if match_type is regex
    if (match_type === 'regex') {
      try { new RegExp(pattern); } catch { return res.status(400).json({ error: 'Ungültiger regulärer Ausdruck' }); }
    }
    const rule = await prisma.categoryRule.create({
      data: {
        category,
        pattern,
        match_field: match_field || 'description',
        match_type: match_type || 'regex',
        priority: priority ?? 100,
        is_default: false,
        created_at: new Date().toISOString(),
      },
    });
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update rule
router.patch('/category-rules/:id', async (req: Request, res: Response) => {
  try {
    const { category, pattern, match_field, match_type, priority } = req.body;
    if (match_type === 'regex' && pattern) {
      try { new RegExp(pattern); } catch { return res.status(400).json({ error: 'Ungültiger regulärer Ausdruck' }); }
    }
    const data: any = {};
    if (category !== undefined) data.category = category;
    if (pattern !== undefined) data.pattern = pattern;
    if (match_field !== undefined) data.match_field = match_field;
    if (match_type !== undefined) data.match_type = match_type;
    if (priority !== undefined) data.priority = priority;

    const rule = await prisma.categoryRule.update({
      where: { id: parseInt(req.params.id as string) },
      data,
    });
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete rule
router.delete('/category-rules/:id', async (req: Request, res: Response) => {
  try {
    await prisma.categoryRule.delete({ where: { id: parseInt(req.params.id as string) } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Categories overview with tx counts, totals, rule counts
router.get('/categories/overview', async (req: Request, res: Response) => {
  try {
    const { year, month, account_id, include_savings } = req.query as Record<string, string>;

    // All categories from DB table
    const allCats = await prisma.category.findMany({ orderBy: { name: 'asc' } });

    // Transaction stats grouped by category (with optional filters)
    let sql = `
      SELECT
        t.category,
        COUNT(*) as tx_count,
        CAST(SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) AS REAL) as total_debit,
        CAST(SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) AS REAL) as total_credit
      FROM transactions t
      WHERE 1=1
    `;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings });
    if (year) { sql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }
    if (month) { sql += ' AND strftime("%m", t.bu_date) = ?'; params.push(month.padStart(2, '0')); }
    sql += ' GROUP BY t.category';

    const txStatsRaw: any[] = await prisma.$queryRawUnsafe(sql, ...params);
    const txStats = serialize(txStatsRaw);
    const statsMap: Record<string, any> = {};
    for (const s of txStats) {
      statsMap[s.category] = s;
    }

    // Rule counts
    const rules = await prisma.categoryRule.findMany();
    const ruleCountMap: Record<string, number> = {};
    for (const r of rules) {
      ruleCountMap[r.category] = (ruleCountMap[r.category] || 0) + 1;
    }

    const result = allCats.map(c => ({
      category: c.name,
      category_id: c.id,
      is_default: c.is_default,
      category_type: c.category_type,
      tx_count: Number(statsMap[c.name]?.tx_count ?? 0),
      total_debit: Number(statsMap[c.name]?.total_debit ?? 0),
      total_credit: Number(statsMap[c.name]?.total_credit ?? 0),
      rule_count: ruleCountMap[c.name] || 0,
    }));

    // Sort: categories with transactions first (by tx_count DESC), then empty ones alphabetically
    result.sort((a, b) => {
      if (a.tx_count > 0 && b.tx_count === 0) return -1;
      if (a.tx_count === 0 && b.tx_count > 0) return 1;
      if (a.tx_count > 0 && b.tx_count > 0) return b.tx_count - a.tx_count;
      return a.category.localeCompare(b.category, 'de');
    });

    res.json(serialize(result));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Category CRUD ====================

// Create a new category
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name darf nicht leer sein' });
    }
    const trimmed = name.trim();
    const existing = await prisma.category.findUnique({ where: { name: trimmed } });
    if (existing) {
      return res.status(409).json({ error: 'Kategorie existiert bereits' });
    }
    const cat = await prisma.category.create({
      data: { name: trimmed, is_default: false, created_at: new Date().toISOString() },
    });
    res.json(cat);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update a category (rename and/or change type)
router.patch('/categories/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, category_type } = req.body;
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: 'Kategorie nicht gefunden' });

    const data: any = {};

    // Handle category_type change
    if (category_type !== undefined && ['default', 'savings'].includes(category_type)) {
      data.category_type = category_type;
    }

    // Handle rename
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name darf nicht leer sein' });
      }
      if (cat.name === 'Sonstiges') return res.status(400).json({ error: '"Sonstiges" kann nicht umbenannt werden' });

      const trimmed = name.trim();
      if (trimmed !== cat.name) {
        const duplicate = await prisma.category.findUnique({ where: { name: trimmed } });
        if (duplicate) return res.status(409).json({ error: 'Kategorie existiert bereits' });
        data.name = trimmed;
      }
    }

    if (Object.keys(data).length === 0) return res.json(cat);

    const updated = await prisma.category.update({ where: { id }, data });

    // If renamed, cascade to transactions and rules
    if (data.name && data.name !== cat.name) {
      await prisma.$executeRawUnsafe(
        'UPDATE transactions SET category = ? WHERE category = ?',
        data.name, cat.name
      );
      await prisma.$executeRawUnsafe(
        'UPDATE category_rules SET category = ? WHERE category = ?',
        data.name, cat.name
      );
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a category (reassign transactions + rules to replacement)
router.post('/categories/:id/delete', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { replacement_category } = req.body;
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: 'Kategorie nicht gefunden' });
    if (cat.name === 'Sonstiges') return res.status(400).json({ error: '"Sonstiges" kann nicht gelöscht werden' });

    const replacement = replacement_category || 'Sonstiges';
    // Ensure replacement exists
    await ensureCategoryExists(replacement);

    // Reassign transactions
    const txUpdated = await prisma.$executeRawUnsafe(
      'UPDATE transactions SET category = ? WHERE category = ?',
      replacement, cat.name
    );
    // Reassign rules
    await prisma.$executeRawUnsafe(
      'UPDATE category_rules SET category = ? WHERE category = ?',
      replacement, cat.name
    );
    // Delete category
    await prisma.category.delete({ where: { id } });

    res.json({ success: true, reassigned_transactions: txUpdated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recategorize preview — returns count + sample transactions
router.post('/transactions/recategorize/preview', async (req: Request, res: Response) => {
  try {
    const { transaction_id, category, mode } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id: transaction_id } });
    if (!tx) return res.status(404).json({ error: 'Transaktion nicht gefunden' });

    let where = '';
    const params: any[] = [];

    if (mode === 'single') {
      where = 't.id = ?';
      params.push(transaction_id);
    } else if (mode === 'counterparty') {
      where = 't.counterparty = ?';
      params.push(tx.counterparty || '');
    } else if (mode === 'pattern') {
      where = 't.counterparty = ? AND t.amount BETWEEN ? AND ?';
      params.push(tx.counterparty || '');
      const amt = Math.abs(tx.amount || 0);
      params.push(amt * 0.8);
      params.push(amt * 1.2);
    } else {
      return res.status(400).json({ error: 'Ungültiger Modus' });
    }

    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as cnt FROM transactions t WHERE ${where}`, ...params
    );
    const samples: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.*, a.bank as bank_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE ${where} LIMIT 5`, ...params
    );

    res.json(serialize({
      affected_count: Number(countResult[0]?.cnt || 0),
      sample_transactions: samples,
    }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recategorize — bulk update
router.post('/transactions/recategorize', async (req: Request, res: Response) => {
  try {
    const { transaction_id, category, mode, create_rule, rule } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id: transaction_id } });
    if (!tx) return res.status(404).json({ error: 'Transaktion nicht gefunden' });

    await ensureCategoryExists(category);

    let updated = 0;

    if (mode === 'single') {
      await prisma.transaction.update({ where: { id: transaction_id }, data: { category } });
      updated = 1;
    } else if (mode === 'counterparty') {
      const result = await prisma.$executeRawUnsafe(
        'UPDATE transactions SET category = ? WHERE counterparty = ?',
        category, tx.counterparty || ''
      );
      updated = result;
    } else if (mode === 'pattern') {
      const amt = Math.abs(tx.amount || 0);
      const result = await prisma.$executeRawUnsafe(
        'UPDATE transactions SET category = ? WHERE counterparty = ? AND amount BETWEEN ? AND ?',
        category, tx.counterparty || '', amt * 0.8, amt * 1.2
      );
      updated = result;
    }

    // Optionally create a rule
    if (create_rule && rule) {
      if (rule.match_type === 'regex') {
        try { new RegExp(rule.pattern); } catch { return res.status(400).json({ error: 'Ungültiger regulärer Ausdruck' }); }
      }
      await prisma.categoryRule.create({
        data: {
          category,
          pattern: rule.pattern,
          match_field: rule.match_field || 'description',
          match_type: rule.match_type || 'keyword',
          priority: rule.priority ?? 100,
          is_default: false,
          created_at: new Date().toISOString(),
        },
      });
    }

    res.json({ success: true, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI suggest pattern
router.post('/ai/suggest-pattern', async (req: Request, res: Response) => {
  try {
    const { transaction_id, category } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id: transaction_id } });
    if (!tx) return res.status(404).json({ error: 'Transaktion nicht gefunden' });

    // Get similar transactions for context
    const samples: any[] = await prisma.$queryRawUnsafe(
      `SELECT description, counterparty, amount FROM transactions
       WHERE counterparty = ? OR description LIKE ?
       LIMIT 5`,
      tx.counterparty || '', `%${(tx.counterparty || '').substring(0, 10)}%`
    );

    const result = await suggestCategoryPattern({
      counterparty: tx.counterparty || '',
      description: tx.description || '',
      category,
      sampleDescriptions: samples.map((s: any) => `${s.counterparty}: ${s.description}`),
    });

    res.json(result);
  } catch (err: any) {
    console.error('AI suggest-pattern error:', err.message || err);
    // Fallback: simple counterparty-based pattern
    const tx = await prisma.transaction.findUnique({ where: { id: req.body.transaction_id } });
    const escaped = (tx?.counterparty || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let explanation = 'KI-Vorschlag fehlgeschlagen – Fallback auf einfaches Stichwort.';
    const msg = err.message || '';
    if (msg.includes('not configured')) {
      explanation = 'OPENROUTER_API_KEY nicht konfiguriert. Bitte in .env setzen.';
    } else if (msg.includes('403') || msg.includes('limit')) {
      explanation = 'OpenRouter API-Limit erreicht. Bitte Limit unter openrouter.ai/settings/keys erhöhen.';
    } else if (msg.includes('401')) {
      explanation = 'OpenRouter API-Key ungültig. Bitte unter openrouter.ai/settings/keys prüfen.';
    }

    res.json({
      pattern: escaped || 'Sonstiges',
      match_type: 'keyword',
      match_field: 'counterparty',
      explanation,
    });
  }
});

// ── Batch AI Categorization ─────────────────────────────────────────

// Step 1: Return grouped "Sonstiges" transactions (no AI, instant)
router.post('/ai/batch-groups', async (req: Request, res: Response) => {
  try {
    const { limit = 50, year, month, account_id, include_savings } = req.body || {};

    const catRows = await prisma.category.findMany({
      where: { NOT: { name: 'Sonstiges' } },
      orderBy: { name: 'asc' },
    });
    const existingCategories = catRows.map(r => r.name);

    let sql = `SELECT id, counterparty, description, amount, direction
       FROM transactions t WHERE category = 'Sonstiges'`;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings });
    if (year) { sql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }
    if (month) { sql += ' AND strftime("%m", t.bu_date) = ?'; params.push(String(month).padStart(2, '0')); }
    sql += ' ORDER BY t.bu_date DESC';

    const sonstige: any[] = await prisma.$queryRawUnsafe(sql, ...params);

    if (sonstige.length === 0) {
      return res.json({ groups: [], existing_categories: existingCategories, total_transactions: 0 });
    }

    const groupMap = new Map<string, { ids: number[]; descriptions: string[]; amounts: number[]; directions: string[] }>();
    for (const tx of sonstige) {
      const key = (tx.counterparty && tx.counterparty.trim() !== '')
        ? tx.counterparty
        : (tx.description || '').substring(0, 30).trim() || 'unbekannt';
      const group = groupMap.get(key) || { ids: [], descriptions: [], amounts: [], directions: [] };
      group.ids.push(Number(tx.id));
      if (group.descriptions.length < 5) group.descriptions.push(tx.description || '');
      if (group.amounts.length < 5) group.amounts.push(Number(tx.amount) || 0);
      group.directions.push(tx.direction || 'debit');
      groupMap.set(key, group);
    }

    const sortedEntries = [...groupMap.entries()].sort((a, b) => b[1].ids.length - a[1].ids.length);
    const cappedEntries = sortedEntries.slice(0, limit);

    const groups: CounterpartyGroup[] = cappedEntries.map(([key, g]) => {
      const debitCount = g.directions.filter(d => d === 'debit').length;
      const direction = debitCount >= g.directions.length / 2 ? 'debit' : 'credit';
      return {
        counterparty: key,
        transaction_ids: g.ids,
        sample_descriptions: g.descriptions,
        sample_amounts: g.amounts,
        direction,
        count: g.ids.length,
      };
    });

    res.json({ groups, existing_categories: existingCategories, total_transactions: sonstige.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Step 2: Categorize a single group (one AI call)
router.post('/ai/batch-categorize', async (req: Request, res: Response) => {
  try {
    const { group, existing_categories } = req.body as {
      group: CounterpartyGroup;
      existing_categories: string[];
    };
    const suggestion = await categorizeGroup(group, existing_categories);
    res.json(suggestion);
  } catch (err: any) {
    console.error('Batch categorize error:', err.message || err);
    const status = err.message?.includes('nicht konfiguriert') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Batch apply categorization changes
router.post('/ai/batch-apply', async (req: Request, res: Response) => {
  try {
    const { actions } = req.body as {
      actions: Array<{
        counterparty: string;
        transaction_ids: number[];
        category: string;
        create_rule: boolean;
        rule?: { pattern: string; match_type: string; match_field: string };
      }>;
    };

    let updatedTransactions = 0;
    let rulesCreated = 0;

    for (const action of actions) {
      await ensureCategoryExists(action.category);
      // Update transactions
      if (action.transaction_ids.length > 0) {
        const placeholders = action.transaction_ids.map(() => '?').join(',');
        const result = await prisma.$executeRawUnsafe(
          `UPDATE transactions SET category = ? WHERE id IN (${placeholders})`,
          action.category,
          ...action.transaction_ids,
        );
        updatedTransactions += result;
      }

      // Create rule if requested
      if (action.create_rule && action.rule) {
        // Check for duplicate
        const existing = await prisma.categoryRule.findFirst({
          where: {
            pattern: action.rule.pattern,
            match_field: action.rule.match_field,
            category: action.category,
          },
        });
        if (!existing) {
          if (action.rule.match_type === 'regex') {
            try { new RegExp(action.rule.pattern); } catch { continue; }
          }
          await prisma.categoryRule.create({
            data: {
              category: action.category,
              pattern: action.rule.pattern,
              match_field: action.rule.match_field || 'counterparty',
              match_type: action.rule.match_type || 'keyword',
              priority: 100,
              is_default: false,
              created_at: new Date().toISOString(),
            },
          });
          rulesCreated++;
        }
      }
    }

    res.json({ success: true, updated_transactions: updatedTransactions, rules_created: rulesCreated });
  } catch (err: any) {
    console.error('Batch apply error:', err.message || err);
    res.status(500).json({ error: err.message });
  }
});

// ── AI Model Settings ───────────────────────────────────────────────

router.get('/settings/ai-model', async (_req: Request, res: Response) => {
  try {
    const [setting, customModels, zdrIds, availableIds] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'ai_model' } }),
      prisma.setting.findUnique({ where: { key: 'custom_models' } }),
      fetchZdrModelIds().catch(() => new Set<string>()),
      fetchAvailableModelIds(),
    ]);
    const custom: string[] = customModels?.value ? JSON.parse(customModels.value) : [];
    res.json({
      current: setting?.value || 'google/gemini-3.1-flash-lite-preview',
      presets: PRESET_MODELS,
      freeModel: FREE_MODEL,
      custom,
      hasApiKey: hasApiKey(),
      zdrModelIds: [...zdrIds],
      availableModelIds: [...availableIds],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/settings/ai-model', async (req: Request, res: Response) => {
  try {
    const { model } = req.body;
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Model ID erforderlich' });
    }
    await prisma.setting.upsert({
      where: { key: 'ai_model' },
      update: { value: model.trim() },
      create: { key: 'ai_model', value: model.trim() },
    });
    res.json({ success: true, model: model.trim() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings/ai-model/browse', async (_req: Request, res: Response) => {
  try {
    const result = await fetchAllModels();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/ai-model/custom', async (req: Request, res: Response) => {
  try {
    const { model } = req.body;
    if (!model || typeof model !== 'string' || !model.includes('/')) {
      return res.status(400).json({ error: 'Model ID im Format "provider/model-name" erforderlich' });
    }
    const existing = await prisma.setting.findUnique({ where: { key: 'custom_models' } });
    const custom: string[] = existing?.value ? JSON.parse(existing.value) : [];
    const trimmed = model.trim();
    if (!custom.includes(trimmed)) {
      custom.push(trimmed);
      await prisma.setting.upsert({
        where: { key: 'custom_models' },
        update: { value: JSON.stringify(custom) },
        create: { key: 'custom_models', value: JSON.stringify(custom) },
      });
    }
    res.json({ success: true, custom });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/settings/ai-model/custom', async (req: Request, res: Response) => {
  try {
    const { model } = req.body;
    const existing = await prisma.setting.findUnique({ where: { key: 'custom_models' } });
    const custom: string[] = existing?.value ? JSON.parse(existing.value) : [];
    const filtered = custom.filter(m => m !== model);
    await prisma.setting.upsert({
      where: { key: 'custom_models' },
      update: { value: JSON.stringify(filtered) },
      create: { key: 'custom_models', value: JSON.stringify(filtered) },
    });
    res.json({ success: true, custom: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analysis: Flow (Sankey) ─────────────────────────────────────────
router.get('/analysis/flow', async (req: Request, res: Response) => {
  try {
    const { year, month, account_id, include_savings } = req.query as Record<string, string>;

    let baseSql = ' WHERE 1=1';
    const params: any[] = [];
    baseSql += accountFilterSql(params, { account_id, include_savings });
    if (year) { baseSql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }
    if (month) { baseSql += ' AND strftime("%m", t.bu_date) = ?'; params.push(month.padStart(2, '0')); }

    // Income: group by counterparty_iban where available, fall back to counterparty text
    const incomeByIban: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.counterparty_iban as group_key, MIN(t.counterparty) as label, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t ${baseSql} AND t.direction = 'credit' AND t.counterparty_iban IS NOT NULL
       GROUP BY t.counterparty_iban ORDER BY total DESC LIMIT 10`,
      ...params,
    );
    const incomeByText: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.counterparty as group_key, t.counterparty as label, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t ${baseSql} AND t.direction = 'credit' AND t.counterparty_iban IS NULL
       GROUP BY t.counterparty ORDER BY total DESC LIMIT 10`,
      ...params,
    );
    // Merge, deduplicate, top 10
    const incomeRows = [...incomeByIban, ...incomeByText]
      .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
      .slice(0, 10)
      .map(r => ({ counterparty: r.label || 'Unbekannt', total: r.total }));

    // Remaining income → "Sonstige Einnahmen"
    const incomeTotal: any[] = await prisma.$queryRawUnsafe(
      `SELECT CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t ${baseSql} AND t.direction = 'credit'`,
      ...params,
    );
    const topIncomeTotal = incomeRows.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
    const allIncomeTotal = Number(incomeTotal[0]?.total) || 0;
    const otherIncome = allIncomeTotal - topIncomeTotal;

    // Expenses by category
    const expenseRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.category, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t ${baseSql} AND t.direction = 'debit'
       GROUP BY t.category ORDER BY total DESC`,
      ...params,
    );

    // Build Sankey nodes & links
    const incomeColors = ['#0D9373', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#22C55E', '#16A34A', '#15803D', '#4ADE80', '#86EFAC'];
    const expenseColors = ['#DC5944', '#D4930D', '#7C5CDB', '#E07B53', '#3BA0A8', '#A85C9E', '#6B9E42', '#C7633D', '#4A7AE5', '#9CA3AF'];

    const nodes: { id: string; label: string; color: string }[] = [];
    const links: { source: string; target: string; value: number }[] = [];

    // Income source nodes
    for (let i = 0; i < incomeRows.length; i++) {
      const r = incomeRows[i];
      const name = r.counterparty || 'Unbekannt';
      const id = `in_${i}`;
      nodes.push({ id, label: name, color: incomeColors[i % incomeColors.length] });
      links.push({ source: id, target: 'konto', value: Number(r.total) || 0 });
    }
    if (otherIncome > 0) {
      nodes.push({ id: 'in_other', label: 'Sonstige Einnahmen', color: '#A8A29E' });
      links.push({ source: 'in_other', target: 'konto', value: otherIncome });
    }

    // Account node
    nodes.push({ id: 'konto', label: 'Konto', color: '#4A7AE5' });

    // Expense category nodes
    for (let i = 0; i < expenseRows.length; i++) {
      const r = expenseRows[i];
      const id = `out_${i}`;
      nodes.push({ id, label: r.category || 'Sonstiges', color: expenseColors[i % expenseColors.length] });
      links.push({ source: 'konto', target: id, value: Number(r.total) || 0 });
    }

    // Filter out zero-value links and orphan nodes
    const validLinks = links.filter(l => l.value > 0);
    const usedNodeIds = new Set(validLinks.flatMap(l => [l.source, l.target]));
    const validNodes = nodes.filter(n => usedNodeIds.has(n.id));

    res.json(serialize({ nodes: validNodes, links: validLinks }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analysis: Daily spending (Calendar heatmap) ─────────────────────
router.get('/analysis/daily', async (req: Request, res: Response) => {
  try {
    const { year, account_id, include_savings } = req.query as Record<string, string>;
    const targetYear = year || String(new Date().getFullYear());

    let sql = `
      SELECT t.bu_date as day, CAST(SUM(t.amount) AS REAL) as value
      FROM transactions t
      WHERE t.direction = 'debit' AND strftime('%Y', t.bu_date) = ?
    `;
    const params: any[] = [targetYear];
    sql += accountFilterSql(params, { account_id, include_savings });
    sql += ' GROUP BY t.bu_date ORDER BY t.bu_date ASC';

    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    res.json(serialize(rows));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analysis: Category monthly (Stacked area) ──────────────────────
router.get('/analysis/category-monthly', async (req: Request, res: Response) => {
  try {
    const { year, account_id, include_savings } = req.query as Record<string, string>;

    let baseSql = ' WHERE t.direction = \'debit\'';
    const params: any[] = [];
    baseSql += accountFilterSql(params, { account_id, include_savings });
    if (year) { baseSql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }

    // Pass 1: top 8 categories by total
    const topCats: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.category, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t ${baseSql}
       GROUP BY t.category ORDER BY total DESC LIMIT 8`,
      ...params,
    );
    const topCatNames = new Set(topCats.map((r: any) => r.category));

    // Pass 2: monthly breakdown
    const monthlyRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT strftime('%Y-%m', t.bu_date) as month, t.category, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t ${baseSql}
       GROUP BY month, t.category ORDER BY month ASC`,
      ...params,
    );

    // Aggregate
    const monthMap = new Map<string, Record<string, number>>();
    for (const row of monthlyRows) {
      if (!row.month) continue;
      if (!monthMap.has(row.month)) monthMap.set(row.month, {});
      const cats = monthMap.get(row.month)!;
      const cat = topCatNames.has(row.category) ? row.category : 'Sonstige';
      cats[cat] = (cats[cat] || 0) + (Number(row.total) || 0);
    }

    const result = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, categories]) => ({ month, categories }));

    res.json(serialize(result));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Backfill: Extract counterparty_iban from existing transaction descriptions ──
router.post('/backfill/counterparty-iban', async (_req: Request, res: Response) => {
  try {
    const transactions: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, description FROM transactions WHERE description IS NOT NULL`
    );
    let updated = 0;
    for (const tx of transactions) {
      const iban = extractCounterpartyIban(tx.description);
      if (iban) {
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET counterparty_iban = ? WHERE id = ?`,
          iban, tx.id
        );
        updated++;
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET counterparty_iban = NULL WHERE id = ?`,
          tx.id
        );
      }
    }
    res.json({ success: true, scanned: transactions.length, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reset: Delete all data and re-seed default category rules + categories ───
router.delete('/reset', async (_req: Request, res: Response) => {
  await prisma.transaction.deleteMany();
  await prisma.importLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.categoryRule.deleteMany();
  await prisma.category.deleteMany();

  // Re-seed default categories
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.create({
      data: { name: cat.name, is_default: true, category_type: cat.type, created_at: new Date().toISOString() },
    });
  }

  // Re-seed default category rules
  for (let i = 0; i < DEFAULT_RULES.length; i++) {
    const rule = DEFAULT_RULES[i];
    await prisma.categoryRule.create({
      data: {
        category: rule.category,
        pattern: rule.pattern,
        match_field: 'description',
        match_type: 'regex',
        priority: (i + 1) * 10,
        is_default: true,
        created_at: new Date().toISOString(),
      },
    });
  }

  res.json({ ok: true });
});

export default router;
