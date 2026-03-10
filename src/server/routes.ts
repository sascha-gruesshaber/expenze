import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from './prisma.js';
import { parseFile, detectTemplates } from './parser.js';
import { Prisma } from '../generated/prisma/client.js';
import { categorizeWithRules, computeHash, extractCounterpartyIban, type DbCategoryRule, type BankTemplateConfig } from './parsers/types.js';
import { ensureBuiltinTemplates, invalidateTemplateCache } from './parsers/registry.js';
import { parseWithTemplate } from './parsers/template-parser.js';
import { suggestCategoryPattern, categorizeGroup, generateTemplateConfig, PRESET_MODELS, FREE_MODEL, hasApiKey, fetchAllModels, fetchZdrModelIds, fetchAvailableModelIds, type CounterpartyGroup } from './ai.js';
import { DEFAULT_RULES, DEFAULT_CATEGORIES } from './defaultRules.js';
import { requireAuth } from './authMiddleware.js';
import { chatRouter } from './chat.js';
import { createJob, getJob, processImportInBackground } from './importManager.js';

const router = Router();

// All API routes require authentication
router.use(requireAuth);
router.use(chatRouter);

function getUserId(req: Request): string {
  return (req as any).userId;
}

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

// ── Cross-format deduplication ─────────────────────────────────────
function computeDedupKey(tx: {
  iban: string | null;
  account_number: string;
  bu_date: string | null;
  amount: number;
  direction: string;
}): string {
  const rawAccount = (tx.iban || tx.account_number || '').replace(/\s/g, '');
  const normalizedAccount = rawAccount.slice(-10).replace(/^0+/, '');
  const amountCents = Math.round(tx.amount * 100);
  return computeHash([normalizedAccount, tx.bu_date || '', String(amountCents), tx.direction]);
}

// Backfill dedup_key for transactions imported before the column existed.
async function backfillDedupKeys(): Promise<void> {
  const rows = await prisma.transaction.findMany({
    where: { dedup_key: null },
    select: { id: true, account_number: true, bu_date: true, amount: true, direction: true },
  });
  if (rows.length === 0) return;
  console.log(`  Backfilling dedup_key for ${rows.length} transactions…`);
  for (const row of rows) {
    const key = computeDedupKey({
      iban: null,
      account_number: row.account_number || '',
      bu_date: row.bu_date || null,
      amount: row.amount || 0,
      direction: row.direction || '',
    });
    await prisma.transaction.update({ where: { id: row.id }, data: { dedup_key: key } });
  }
  console.log(`  Backfill complete.`);
}
backfillDedupKeys().catch(e => console.error('Dedup backfill error:', e));

// Auto-create category in table if it doesn't exist (user-scoped)
async function ensureCategoryExists(name: string, userId: string) {
  const existing = await prisma.category.findFirst({ where: { name, userId } });
  if (!existing) {
    await prisma.category.create({
      data: { name, is_default: false, userId, created_at: new Date().toISOString() },
    });
  }
}

// Helper: upsert a setting for a user
async function upsertSetting(key: string, value: string, userId: string) {
  const existing = await prisma.setting.findFirst({ where: { key, userId } });
  if (existing) {
    return prisma.setting.update({ where: { id: existing.id }, data: { value } });
  }
  return prisma.setting.create({ data: { key, value, userId } });
}

// Find or create bank account from parsed transaction data (user-scoped)
async function findOrCreateAccount(tx: { iban: string | null; account_number: string; bank_name: string }, userId: string): Promise<number> {
  const hasIban = !!tx.iban;
  const hasAccNum = tx.account_number !== '' && tx.account_number !== 'unknown';

  // 1. Exact match by IBAN
  if (hasIban) {
    const existing = await prisma.bankAccount.findFirst({ where: { iban: tx.iban!, userId } });
    if (existing) {
      if (!existing.account_number && hasAccNum) {
        await prisma.bankAccount.update({ where: { id: existing.id }, data: { account_number: tx.account_number } });
      }
      return existing.id;
    }
  }

  // 2. Exact match by account_number
  if (hasAccNum) {
    const existing = await prisma.bankAccount.findFirst({ where: { account_number: tx.account_number, userId } });
    if (existing) {
      if (!existing.iban && hasIban) {
        await prisma.bankAccount.update({ where: { id: existing.id }, data: { iban: tx.iban } });
      }
      return existing.id;
    }
  }

  // 3. Cross-match: account_number embedded in an existing account's IBAN
  if (hasAccNum) {
    const withIban = await prisma.bankAccount.findMany({ where: { iban: { not: null }, userId } });
    const match = withIban.find(a => a.iban!.includes(tx.account_number));
    if (match) {
      if (!match.account_number) {
        await prisma.bankAccount.update({ where: { id: match.id }, data: { account_number: tx.account_number } });
      }
      return match.id;
    }
  }

  // 4. Cross-match: existing account_number embedded in the incoming IBAN
  if (hasIban) {
    const withAccNum = await prisma.bankAccount.findMany({ where: { account_number: { not: null }, userId } });
    const match = withAccNum.find(a => tx.iban!.includes(a.account_number!));
    if (match) {
      if (!match.iban) {
        await prisma.bankAccount.update({ where: { id: match.id }, data: { iban: tx.iban } });
      }
      return match.id;
    }
  }

  // 5. Auto-create
  const name = tx.bank_name === 'C24' ? 'C24 Smartkonto' : `${tx.bank_name} Girokonto`;
  const account = await prisma.bankAccount.create({
    data: {
      name,
      iban: tx.iban || null,
      account_number: hasAccNum ? tx.account_number : null,
      bank: tx.bank_name,
      account_type: 'checking',
      created_at: new Date().toISOString(),
      userId,
    },
  });
  return account.id;
}

// Import CSV — non-blocking with progress tracking
router.post('/import', upload.array('files'), async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const files = req.files as Express.Multer.File[];
    const templateId = req.body?.templateId as string | undefined;
    const results = [];

    // Fetch DB rules for this user
    const dbRules = await prisma.categoryRule.findMany({ where: { userId } }) as unknown as DbCategoryRule[];

    for (const file of files) {
      // If no explicit templateId, check for conflicts
      if (!templateId) {
        const matchingTemplates = await detectTemplates(file.buffer, file.originalname);
        if (matchingTemplates.length > 1) {
          results.push({ filename: file.originalname, conflict: true, matchingTemplates });
          continue;
        }
      }

      const { transactions, detectedBank } = await parseFile(file.buffer, file.originalname, templateId);

      // Pre-compute dedup keys and batch-check for existing duplicates (user-scoped)
      const dedupKeys = transactions.map(tx => computeDedupKey(tx));
      const uniqueDedupKeys = [...new Set(dedupKeys.filter(Boolean))];
      const existingDedupKeys = new Set<string>();
      for (let i = 0; i < uniqueDedupKeys.length; i += 500) {
        const batch = uniqueDedupKeys.slice(i, i + 500);
        const rows = await prisma.transaction.findMany({
          where: {
            dedup_key: { in: batch },
            account: { userId },
          },
          select: { dedup_key: true },
        });
        for (const r of rows) {
          if (r.dedup_key) existingDedupKeys.add(r.dedup_key);
        }
      }

      // Create background job and respond immediately
      const importId = createJob(file.originalname, transactions.length, detectedBank);
      processImportInBackground(importId, transactions, existingDedupKeys, dedupKeys, dbRules, userId);

      results.push({ filename: file.originalname, importId, total: transactions.length, bank: detectedBank });
    }

    res.json({ success: true, results });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Import progress polling
router.get('/import/:id/status', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: 'Import not found' });
    return;
  }
  res.json(job);
});

// Helper: exclude transfer categories (Umbuchungen) from analysis queries
function excludeTransfersSql(params: any[], userId: string): string {
  params.push(userId);
  return ` AND COALESCE(t.category, '') NOT IN (SELECT name FROM categories WHERE category_type = 'transfer' AND userId = ?)`;
}

// Helper: build account filter SQL clause (user-scoped)
// Requires the main query to use INNER JOIN bank_accounts a ON t.account_id = a.id
function accountFilterSql(params: any[], query: Record<string, string>, userId: string): string {
  let sql = ' AND a.userId = ?';
  params.push(userId);

  const { account_id, include_savings } = query;
  if (account_id) {
    sql += ' AND t.account_id = ?';
    params.push(parseInt(account_id));
  } else {
    sql += ' AND a.is_active = 1';
    if (include_savings !== 'true') {
      sql += " AND a.account_type != 'savings'";
    }
  }
  return sql;
}

// Get transactions with optional filters
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { month, year, direction, category, search, limit = '500', account_id, include_savings } = req.query as Record<string, string>;

    let sql = 'SELECT t.*, a.bank as bank_name FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE 1=1';
    const params: any[] = [];

    sql += accountFilterSql(params, { account_id, include_savings }, userId);
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
    const userId = getUserId(req);
    const { account_id, include_savings } = req.query as Record<string, string>;
    let sql = `
      SELECT
        strftime('%Y-%m', t.bu_date) as month,
        SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) as income,
        SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) as expenses,
        COUNT(*) as count
      FROM transactions t
      INNER JOIN bank_accounts a ON t.account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings }, userId);
    sql += excludeTransfersSql(params, userId);
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
    const userId = getUserId(req);
    const { year, month, direction = 'debit', account_id, include_savings } = req.query as Record<string, string>;

    let sql = `
      SELECT t.category,
        CAST(SUM(t.amount) AS REAL) as total,
        COUNT(*) as count,
        COALESCE(c.category_type, 'default') as category_type
      FROM transactions t
      INNER JOIN bank_accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON c.name = t.category AND c.userId = ?
      WHERE t.direction = ?
    `;
    const params: any[] = [userId, direction];

    sql += accountFilterSql(params, { account_id, include_savings }, userId);
    sql += excludeTransfersSql(params, userId);
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
    const userId = getUserId(req);
    const { account_id, include_savings } = req.query as Record<string, string>;
    let sql = `
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) as total_income,
        SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) as total_expenses,
        MIN(t.bu_date) as earliest,
        MAX(t.bu_date) as latest
      FROM transactions t
      INNER JOIN bank_accounts a ON t.account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings }, userId);
    sql += excludeTransfersSql(params, userId);

    const totals: any[] = await prisma.$queryRawUnsafe(sql, ...params);
    const importLog = await prisma.importLog.findMany({
      where: { userId },
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
    const userId = getUserId(req);
    const { category } = req.body;
    const txId = parseInt(req.params.id as string);
    // Verify ownership
    const tx = await prisma.transaction.findFirst({ where: { id: txId, account: { userId } } });
    if (!tx) return res.status(404).json({ error: 'Transaktion nicht gefunden' });
    await prisma.transaction.update({ where: { id: txId }, data: { category } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all available categories (user-scoped)
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const rows = await prisma.category.findMany({ where: { userId }, orderBy: { name: 'asc' } });
    res.json(rows.map(r => r.name));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List all bank accounts with transaction counts (user-scoped)
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const accounts = await prisma.bankAccount.findMany({
      where: { userId },
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

// Update bank account
router.patch('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id as string);
    const existing = await prisma.bankAccount.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'Konto nicht gefunden' });

    const { name, account_type, bank, is_active } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (account_type !== undefined) data.account_type = account_type;
    if (bank !== undefined) data.bank = bank;
    if (is_active !== undefined) data.is_active = is_active;

    const account = await prisma.bankAccount.update({ where: { id }, data });
    res.json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete bank account and its transactions
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id as string);
    const existing = await prisma.bankAccount.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'Konto nicht gefunden' });

    await prisma.transaction.deleteMany({ where: { account_id: id } });
    await prisma.bankAccount.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Category Rules CRUD ====================

// List all rules with tx count per category (user-scoped)
router.get('/category-rules', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const rules = await prisma.categoryRule.findMany({ where: { userId }, orderBy: { priority: 'asc' } });
    const counts: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.category, COUNT(*) as count FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE a.userId = ? GROUP BY t.category`,
      userId
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
    const userId = getUserId(req);
    const { category, pattern, match_field, match_type, priority } = req.body;
    await ensureCategoryExists(category, userId);
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
        userId,
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
    const userId = getUserId(req);
    const id = parseInt(req.params.id as string);
    const existing = await prisma.categoryRule.findFirst({ where: { id, userId } });
    if (!existing) return res.status(404).json({ error: 'Regel nicht gefunden' });

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

    const rule = await prisma.categoryRule.update({ where: { id }, data });
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete rule
router.delete('/category-rules/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const existing = await prisma.categoryRule.findFirst({ where: { id: parseInt(req.params.id as string), userId } });
    if (!existing) return res.status(404).json({ error: 'Regel nicht gefunden' });
    await prisma.categoryRule.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Categories overview with tx counts, totals, rule counts (user-scoped)
router.get('/categories/overview', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { year, month, account_id, include_savings } = req.query as Record<string, string>;

    const allCats = await prisma.category.findMany({ where: { userId }, orderBy: { name: 'asc' } });

    let sql = `
      SELECT
        t.category,
        COUNT(*) as tx_count,
        CAST(SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) AS REAL) as total_debit,
        CAST(SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) AS REAL) as total_credit
      FROM transactions t
      INNER JOIN bank_accounts a ON t.account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings }, userId);
    if (year) { sql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }
    if (month) { sql += ' AND strftime("%m", t.bu_date) = ?'; params.push(month.padStart(2, '0')); }
    sql += ' GROUP BY t.category';

    const txStatsRaw: any[] = await prisma.$queryRawUnsafe(sql, ...params);
    const txStats = serialize(txStatsRaw);
    const statsMap: Record<string, any> = {};
    for (const s of txStats) {
      statsMap[s.category] = s;
    }

    const rules = await prisma.categoryRule.findMany({ where: { userId } });
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

    result.sort((a, b) => {
      // Used categories first, then unused
      if (a.tx_count > 0 && b.tx_count === 0) return -1;
      if (a.tx_count === 0 && b.tx_count > 0) return 1;
      // Within each group, sort by name
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
    const userId = getUserId(req);
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name darf nicht leer sein' });
    }
    const trimmed = name.trim();
    const existing = await prisma.category.findFirst({ where: { name: trimmed, userId } });
    if (existing) {
      return res.status(409).json({ error: 'Kategorie existiert bereits' });
    }
    const cat = await prisma.category.create({
      data: { name: trimmed, is_default: false, userId, created_at: new Date().toISOString() },
    });
    res.json(cat);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update a category (rename and/or change type)
router.patch('/categories/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = parseInt(req.params.id as string);
    const { name, category_type } = req.body;
    const cat = await prisma.category.findFirst({ where: { id, userId } });
    if (!cat) return res.status(404).json({ error: 'Kategorie nicht gefunden' });

    const data: any = {};

    if (category_type !== undefined && ['default', 'savings', 'transfer'].includes(category_type)) {
      data.category_type = category_type;
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name darf nicht leer sein' });
      }
      if (cat.name === 'Sonstiges') return res.status(400).json({ error: '"Sonstiges" kann nicht umbenannt werden' });

      const trimmed = name.trim();
      if (trimmed !== cat.name) {
        const duplicate = await prisma.category.findFirst({ where: { name: trimmed, userId } });
        if (duplicate) return res.status(409).json({ error: 'Kategorie existiert bereits' });
        data.name = trimmed;
      }
    }

    if (Object.keys(data).length === 0) return res.json(cat);

    const updated = await prisma.category.update({ where: { id }, data });

    // If renamed, cascade to transactions and rules (scoped to user)
    if (data.name && data.name !== cat.name) {
      await prisma.$executeRawUnsafe(
        `UPDATE transactions SET category = ? WHERE category = ? AND account_id IN (SELECT id FROM bank_accounts WHERE userId = ?)`,
        data.name, cat.name, userId
      );
      await prisma.$executeRawUnsafe(
        `UPDATE category_rules SET category = ? WHERE category = ? AND userId = ?`,
        data.name, cat.name, userId
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
    const userId = getUserId(req);
    const id = parseInt(req.params.id as string);
    const { replacement_category } = req.body;
    const cat = await prisma.category.findFirst({ where: { id, userId } });
    if (!cat) return res.status(404).json({ error: 'Kategorie nicht gefunden' });
    if (cat.name === 'Sonstiges') return res.status(400).json({ error: '"Sonstiges" kann nicht gelöscht werden' });

    const replacement = replacement_category || 'Sonstiges';
    await ensureCategoryExists(replacement, userId);

    const txUpdated = await prisma.$executeRawUnsafe(
      `UPDATE transactions SET category = ? WHERE category = ? AND account_id IN (SELECT id FROM bank_accounts WHERE userId = ?)`,
      replacement, cat.name, userId
    );
    await prisma.$executeRawUnsafe(
      `UPDATE category_rules SET category = ? WHERE category = ? AND userId = ?`,
      replacement, cat.name, userId
    );
    await prisma.category.delete({ where: { id } });

    res.json({ success: true, reassigned_transactions: txUpdated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recategorize preview
router.post('/transactions/recategorize/preview', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { transaction_id, category, mode } = req.body;
    const tx = await prisma.transaction.findFirst({ where: { id: transaction_id, account: { userId } } });
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
      `SELECT COUNT(*) as cnt FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE a.userId = ? AND ${where}`, userId, ...params
    );
    const samples: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.*, a.bank as bank_name FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE a.userId = ? AND ${where} LIMIT 5`, userId, ...params
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
    const userId = getUserId(req);
    const { transaction_id, category, mode, create_rule, rule } = req.body;
    const tx = await prisma.transaction.findFirst({ where: { id: transaction_id, account: { userId } } });
    if (!tx) return res.status(404).json({ error: 'Transaktion nicht gefunden' });

    await ensureCategoryExists(category, userId);

    const userAccountFilter = `AND account_id IN (SELECT id FROM bank_accounts WHERE userId = ?)`;
    let updated = 0;

    if (mode === 'single') {
      await prisma.transaction.update({ where: { id: transaction_id }, data: { category } });
      updated = 1;
    } else if (mode === 'counterparty') {
      const result = await prisma.$executeRawUnsafe(
        `UPDATE transactions SET category = ? WHERE counterparty = ? ${userAccountFilter}`,
        category, tx.counterparty || '', userId
      );
      updated = result;
    } else if (mode === 'pattern') {
      const amt = Math.abs(tx.amount || 0);
      const result = await prisma.$executeRawUnsafe(
        `UPDATE transactions SET category = ? WHERE counterparty = ? AND amount BETWEEN ? AND ? ${userAccountFilter}`,
        category, tx.counterparty || '', amt * 0.8, amt * 1.2, userId
      );
      updated = result;
    }

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
          userId,
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
    const userId = getUserId(req);
    const { transaction_id, category } = req.body;
    const tx = await prisma.transaction.findFirst({ where: { id: transaction_id, account: { userId } } });
    if (!tx) return res.status(404).json({ error: 'Transaktion nicht gefunden' });

    const samples: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.description, t.counterparty, t.amount FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id
       WHERE a.userId = ? AND (t.counterparty = ? OR t.description LIKE ?)
       LIMIT 5`,
      userId, tx.counterparty || '', `%${(tx.counterparty || '').substring(0, 10)}%`
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
    const userId = getUserId(req);
    const { limit = 50, year, month, account_id, include_savings } = req.body || {};

    const catRows = await prisma.category.findMany({
      where: { NOT: { name: 'Sonstiges' }, userId },
      orderBy: { name: 'asc' },
    });
    const existingCategories = catRows.map(r => r.name);

    let sql = `SELECT t.id, t.counterparty, t.description, t.amount, t.direction
       FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id
       WHERE t.category = 'Sonstiges'`;
    const params: any[] = [];
    sql += accountFilterSql(params, { account_id, include_savings }, userId);
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
    const userId = getUserId(req);
    const { actions } = req.body as {
      actions: Array<{
        counterparty: string;
        transaction_ids: number[];
        category: string;
        create_rule: boolean;
        rule?: { pattern: string; match_type: string; match_field: string };
      }>;
    };

    const userAccountFilter = `AND account_id IN (SELECT id FROM bank_accounts WHERE userId = ?)`;
    let updatedTransactions = 0;
    let rulesCreated = 0;

    for (const action of actions) {
      await ensureCategoryExists(action.category, userId);
      if (action.transaction_ids.length > 0) {
        const placeholders = action.transaction_ids.map(() => '?').join(',');
        const result = await prisma.$executeRawUnsafe(
          `UPDATE transactions SET category = ? WHERE id IN (${placeholders}) ${userAccountFilter}`,
          action.category,
          ...action.transaction_ids,
          userId,
        );
        updatedTransactions += result;
      }

      if (action.create_rule && action.rule) {
        const existing = await prisma.categoryRule.findFirst({
          where: {
            pattern: action.rule.pattern,
            match_field: action.rule.match_field,
            category: action.category,
            userId,
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
              userId,
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

// ── AI Template Generation ──────────────────────────────────────────

router.post('/ai/generate-template', async (req: Request, res: Response) => {
  try {
    let { csvSample } = req.body as { csvSample: string };
    if (!csvSample || typeof csvSample !== 'string' || csvSample.trim().length < 10) {
      res.status(400).json({ error: 'CSV-Daten zu kurz oder fehlen.' });
      return;
    }
    const lines = csvSample.split('\n').slice(0, 50);
    csvSample = lines.join('\n').slice(0, 10_000);

    const config = await generateTemplateConfig(csvSample);
    res.json({ config });
  } catch (err: any) {
    const isNoKey = err.message?.includes('OPENROUTER_API_KEY');
    res.status(isNoKey ? 400 : 500).json({
      error: err.message,
      code: isNoKey ? 'NO_API_KEY' : undefined,
    });
  }
});

// ── AI Model Settings (user-scoped) ─────────────────────────────────

router.get('/settings/ai-model', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const [setting, customModels, zdrIds, availableIds] = await Promise.all([
      prisma.setting.findFirst({ where: { key: 'ai_model', userId } }),
      prisma.setting.findFirst({ where: { key: 'custom_models', userId } }),
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
    const userId = getUserId(req);
    const { model } = req.body;
    if (!model || typeof model !== 'string') {
      return res.status(400).json({ error: 'Model ID erforderlich' });
    }
    await upsertSetting('ai_model', model.trim(), userId);
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
    const userId = getUserId(req);
    const { model } = req.body;
    if (!model || typeof model !== 'string' || !model.includes('/')) {
      return res.status(400).json({ error: 'Model ID im Format "provider/model-name" erforderlich' });
    }
    const existing = await prisma.setting.findFirst({ where: { key: 'custom_models', userId } });
    const custom: string[] = existing?.value ? JSON.parse(existing.value) : [];
    const trimmed = model.trim();
    if (!custom.includes(trimmed)) {
      custom.push(trimmed);
      await upsertSetting('custom_models', JSON.stringify(custom), userId);
    }
    res.json({ success: true, custom });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/settings/ai-model/custom', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { model } = req.body;
    const existing = await prisma.setting.findFirst({ where: { key: 'custom_models', userId } });
    const custom: string[] = existing?.value ? JSON.parse(existing.value) : [];
    const filtered = custom.filter(m => m !== model);
    await upsertSetting('custom_models', JSON.stringify(filtered), userId);
    res.json({ success: true, custom: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analysis: Flow (Sankey) ─────────────────────────────────────────
router.get('/analysis/flow', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { year, month, account_id, include_savings } = req.query as Record<string, string>;

    let baseSql = ' WHERE 1=1';
    const params: any[] = [];
    baseSql += accountFilterSql(params, { account_id, include_savings }, userId);
    baseSql += excludeTransfersSql(params, userId);
    if (year) { baseSql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }
    if (month) { baseSql += ' AND strftime("%m", t.bu_date) = ?'; params.push(month.padStart(2, '0')); }

    const incomeByIban: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.counterparty_iban as group_key, MIN(t.counterparty) as label, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id ${baseSql} AND t.direction = 'credit' AND t.counterparty_iban IS NOT NULL
       GROUP BY t.counterparty_iban ORDER BY total DESC LIMIT 10`,
      ...params,
    );
    const incomeByText: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.counterparty as group_key, t.counterparty as label, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id ${baseSql} AND t.direction = 'credit' AND t.counterparty_iban IS NULL
       GROUP BY t.counterparty ORDER BY total DESC LIMIT 10`,
      ...params,
    );
    const incomeRows = [...incomeByIban, ...incomeByText]
      .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
      .slice(0, 10)
      .map(r => ({ counterparty: r.label || 'Unbekannt', total: r.total }));

    const incomeTotal: any[] = await prisma.$queryRawUnsafe(
      `SELECT CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id ${baseSql} AND t.direction = 'credit'`,
      ...params,
    );
    const topIncomeTotal = incomeRows.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
    const allIncomeTotal = Number(incomeTotal[0]?.total) || 0;
    const otherIncome = allIncomeTotal - topIncomeTotal;

    const expenseRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.category, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id ${baseSql} AND t.direction = 'debit'
       GROUP BY t.category ORDER BY total DESC`,
      ...params,
    );

    const incomeColors = ['#0D9373', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#22C55E', '#16A34A', '#15803D', '#4ADE80', '#86EFAC'];
    const expenseColors = ['#DC5944', '#D4930D', '#7C5CDB', '#E07B53', '#3BA0A8', '#A85C9E', '#6B9E42', '#C7633D', '#4A7AE5', '#9CA3AF'];

    const nodes: { id: string; label: string; color: string }[] = [];
    const links: { source: string; target: string; value: number }[] = [];

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

    nodes.push({ id: 'konto', label: 'Konto', color: '#4A7AE5' });

    for (let i = 0; i < expenseRows.length; i++) {
      const r = expenseRows[i];
      const id = `out_${i}`;
      nodes.push({ id, label: r.category || 'Sonstiges', color: expenseColors[i % expenseColors.length] });
      links.push({ source: 'konto', target: id, value: Number(r.total) || 0 });
    }

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
    const userId = getUserId(req);
    const { year, account_id, include_savings } = req.query as Record<string, string>;
    const targetYear = year || String(new Date().getFullYear());

    let sql = `
      SELECT t.bu_date as day, CAST(SUM(t.amount) AS REAL) as value
      FROM transactions t
      INNER JOIN bank_accounts a ON t.account_id = a.id
      WHERE t.direction = 'debit' AND strftime('%Y', t.bu_date) = ?
    `;
    const params: any[] = [targetYear];
    sql += accountFilterSql(params, { account_id, include_savings }, userId);
    sql += excludeTransfersSql(params, userId);
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
    const userId = getUserId(req);
    const { year, account_id, include_savings } = req.query as Record<string, string>;

    let baseSql = ' WHERE t.direction = \'debit\'';
    const params: any[] = [];
    baseSql += accountFilterSql(params, { account_id, include_savings }, userId);
    baseSql += excludeTransfersSql(params, userId);
    if (year) { baseSql += ' AND strftime("%Y", t.bu_date) = ?'; params.push(year); }

    const topCats: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.category, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id ${baseSql}
       GROUP BY t.category ORDER BY total DESC LIMIT 8`,
      ...params,
    );
    const topCatNames = new Set(topCats.map((r: any) => r.category));

    const monthlyRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT strftime('%Y-%m', t.bu_date) as month, t.category, CAST(SUM(t.amount) AS REAL) as total
       FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id ${baseSql}
       GROUP BY month, t.category ORDER BY month ASC`,
      ...params,
    );

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
router.post('/backfill/counterparty-iban', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const transactions: any[] = await prisma.$queryRawUnsafe(
      `SELECT t.id, t.description FROM transactions t INNER JOIN bank_accounts a ON t.account_id = a.id WHERE a.userId = ? AND t.description IS NOT NULL`,
      userId
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

// ── Bank Templates CRUD ─────────────────────────────────────────────

router.get('/bank-templates', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const templates = await prisma.bankTemplate.findMany({
    where: { OR: [{ userId }, { is_builtin: true }] },
  });
  res.json(templates.map(t => ({ ...t, config: JSON.parse(t.config) })));
});

router.get('/bank-templates/:id', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const id = req.params.id as string;
  const template = await prisma.bankTemplate.findFirst({ where: { id, OR: [{ userId }, { is_builtin: true }] } });
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
  res.json({ ...template, config: JSON.parse(template.config) });
});

router.post('/bank-templates', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { id, name, config } = req.body;
  if (!id || !name || !config) { res.status(400).json({ error: 'id, name, config required' }); return; }
  const template = await prisma.bankTemplate.create({
    data: {
      id,
      name,
      config: JSON.stringify(config),
      is_builtin: false,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      userId,
    },
  });
  invalidateTemplateCache();
  res.json({ ...template, config: JSON.parse(template.config) });
});

router.patch('/bank-templates/:id', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const id = req.params.id as string;
  const existing = await prisma.bankTemplate.findFirst({ where: { id, OR: [{ userId }, { is_builtin: true }] } });
  if (!existing) { res.status(404).json({ error: 'Template not found' }); return; }

  const { name, config, enabled } = req.body;
  const data: any = { updated_at: new Date().toISOString() };
  if (name !== undefined) data.name = name;
  if (config !== undefined) data.config = JSON.stringify(config);
  if (enabled !== undefined) data.enabled = enabled;
  const template = await prisma.bankTemplate.update({ where: { id }, data });
  invalidateTemplateCache();
  res.json({ ...template, config: JSON.parse(template.config) });
});

router.delete('/bank-templates/:id', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const id = req.params.id as string;
  const template = await prisma.bankTemplate.findFirst({ where: { id, userId } });
  if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
  if (template.is_builtin) { res.status(400).json({ error: 'Cannot delete builtin template' }); return; }
  await prisma.bankTemplate.delete({ where: { id } });
  invalidateTemplateCache();
  res.json({ success: true });
});

router.post('/bank-templates/test', async (req: Request, res: Response) => {
  const { config, csvText, bankName } = req.body;
  if (!config || !csvText) { res.status(400).json({ error: 'config, csvText required' }); return; }
  try {
    const templateConfig = config as BankTemplateConfig;
    const transactions = parseWithTemplate(templateConfig, bankName || 'Test', csvText, 'test.csv');
    res.json({ transactions: transactions.slice(0, 20), total: transactions.length });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ── Reset: Delete current user's data and re-seed defaults ───────────
router.delete('/reset', async (req: Request, res: Response) => {
  const userId = getUserId(req);

  // Delete user's transactions (through their bank accounts)
  const userAccountIds = (await prisma.bankAccount.findMany({ where: { userId }, select: { id: true } })).map(a => a.id);
  if (userAccountIds.length > 0) {
    await prisma.transaction.deleteMany({ where: { account_id: { in: userAccountIds } } });
  }

  await prisma.importLog.deleteMany({ where: { userId } });
  await prisma.bankAccount.deleteMany({ where: { userId } });
  await prisma.categoryRule.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.bankTemplate.deleteMany({ where: { userId, is_builtin: false } });

  // Re-seed default categories for this user
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.create({
      data: { name: cat.name, is_default: true, category_type: cat.type, userId, created_at: new Date().toISOString() },
    });
  }

  // Re-seed default category rules for this user
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
        userId,
        created_at: new Date().toISOString(),
      },
    });
  }

  // Re-seed builtin bank templates (global, not user-scoped)
  await ensureBuiltinTemplates();
  invalidateTemplateCache();

  res.json({ ok: true });
});

export default router;
