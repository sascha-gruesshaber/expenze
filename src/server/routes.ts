import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from './prisma.js';
import { parsePdf } from './parser.js';
import { Prisma } from '@prisma/client';
import { categorizeWithRules, type DbCategoryRule } from './parsers/types.js';
import { suggestCategoryPattern } from './ai.js';

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
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
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
      take: 10,
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
    const rows = await prisma.transaction.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    res.json(rows.map(r => r.category));
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
router.get('/categories/overview', async (_req: Request, res: Response) => {
  try {
    const categories: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        t.category,
        COUNT(*) as tx_count,
        SUM(CASE WHEN t.direction='debit' THEN t.amount ELSE 0 END) as total_debit,
        SUM(CASE WHEN t.direction='credit' THEN t.amount ELSE 0 END) as total_credit
      FROM transactions t
      GROUP BY t.category
      ORDER BY tx_count DESC
    `);

    const rules = await prisma.categoryRule.findMany();
    const ruleCountMap: Record<string, number> = {};
    for (const r of rules) {
      ruleCountMap[r.category] = (ruleCountMap[r.category] || 0) + 1;
    }

    res.json(serialize(categories.map(c => ({
      ...c,
      rule_count: ruleCountMap[c.category] || 0,
    }))));
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
    // Fallback: simple counterparty-based pattern
    const tx = await prisma.transaction.findUnique({ where: { id: req.body.transaction_id } });
    const escaped = (tx?.counterparty || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    res.json({
      pattern: escaped || 'Sonstiges',
      match_type: 'keyword',
      match_field: 'counterparty',
      explanation: 'KI nicht verfügbar – einfaches Stichwort basierend auf dem Empfänger vorgeschlagen.',
    });
  }
});

// ── Reset: Delete all data ──────────────────────────────────────────
router.delete('/reset', async (_req: Request, res: Response) => {
  await prisma.transaction.deleteMany();
  await prisma.importLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.categoryRule.deleteMany();
  res.json({ ok: true });
});

export default router;
