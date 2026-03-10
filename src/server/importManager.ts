import crypto from 'crypto';
import { prisma } from './prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { categorizeWithRules, computeHash, type DbCategoryRule, type ParsedTransaction } from './parsers/types.js';

export interface ImportProgress {
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

// In-memory job tracker — auto-purge entries older than 1 hour
const importJobs = new Map<string, ImportProgress & { createdAt: number }>();

function purgeOldJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of importJobs) {
    if (job.createdAt < cutoff) importJobs.delete(id);
  }
}

export function createJob(filename: string, total: number, bank: string): string {
  purgeOldJobs();
  const id = crypto.randomUUID();
  importJobs.set(id, {
    id,
    status: 'processing',
    filename,
    total,
    processed: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    bank,
    createdAt: Date.now(),
  });
  return id;
}

export function getJob(id: string): ImportProgress | undefined {
  const job = importJobs.get(id);
  if (!job) return undefined;
  // Strip internal createdAt
  const { createdAt, ...progress } = job;
  return progress;
}

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

// In-memory account matching (same 4-step logic as findOrCreateAccount)
interface InMemoryAccount {
  id: number;
  iban: string | null;
  account_number: string | null;
  bank: string;
}

async function resolveAccountInMemory(
  tx: { iban: string | null; account_number: string; bank_name: string },
  userId: string,
  accounts: InMemoryAccount[],
): Promise<number> {
  const hasIban = !!tx.iban;
  const hasAccNum = tx.account_number !== '' && tx.account_number !== 'unknown';

  // 1. Exact match by IBAN
  if (hasIban) {
    const existing = accounts.find(a => a.iban === tx.iban);
    if (existing) {
      if (!existing.account_number && hasAccNum) {
        await prisma.bankAccount.update({ where: { id: existing.id }, data: { account_number: tx.account_number } });
        existing.account_number = tx.account_number;
      }
      return existing.id;
    }
  }

  // 2. Exact match by account_number
  if (hasAccNum) {
    const existing = accounts.find(a => a.account_number === tx.account_number);
    if (existing) {
      if (!existing.iban && hasIban) {
        await prisma.bankAccount.update({ where: { id: existing.id }, data: { iban: tx.iban } });
        existing.iban = tx.iban!;
      }
      return existing.id;
    }
  }

  // 3. Cross-match: account_number embedded in existing IBAN
  if (hasAccNum) {
    const match = accounts.find(a => a.iban && a.iban.includes(tx.account_number));
    if (match) {
      if (!match.account_number) {
        await prisma.bankAccount.update({ where: { id: match.id }, data: { account_number: tx.account_number } });
        match.account_number = tx.account_number;
      }
      return match.id;
    }
  }

  // 4. Cross-match: existing account_number embedded in incoming IBAN
  if (hasIban) {
    const match = accounts.find(a => a.account_number && tx.iban!.includes(a.account_number));
    if (match) {
      if (!match.iban) {
        await prisma.bankAccount.update({ where: { id: match.id }, data: { iban: tx.iban } });
        match.iban = tx.iban!;
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
  // Add to in-memory list for subsequent lookups
  accounts.push({ id: account.id, iban: account.iban, account_number: account.account_number, bank: account.bank });
  return account.id;
}

export function processImportInBackground(
  importId: string,
  transactions: ParsedTransaction[],
  existingDedupKeys: Set<string>,
  dedupKeys: string[],
  dbRules: DbCategoryRule[],
  userId: string,
) {
  // Fire-and-forget — do NOT await this
  (async () => {
    const job = importJobs.get(importId);
    if (!job) return;

    try {
      // Pre-load all user bank accounts
      const rawAccounts = await prisma.bankAccount.findMany({
        where: { userId },
        select: { id: true, iban: true, account_number: true, bank: true },
      });
      const accounts: InMemoryAccount[] = rawAccounts.map(a => ({ ...a }));

      // Account resolution cache (accountKey → accountId)
      const accountCache = new Map<string, number>();

      // Build data for createMany in chunks
      const CHUNK_SIZE = 100;
      const toInsert: {
        account_number: string; bu_date: string | null; value_date: string | null;
        type: string; description: string; counterparty: string; counterparty_iban: string | null;
        counterparty_bic: string | null; purpose: string | null; currency: string | null;
        balance_after: number | null; creditor_id: string | null; mandate_reference: string | null;
        original_category: string | null; amount: number; direction: string; category: string;
        source_file: string; hash: string; dedup_key: string; account_id: number | null;
      }[] = [];

      // Phase 1: categorize + resolve accounts, building toInsert array
      for (let idx = 0; idx < transactions.length; idx++) {
        const tx = transactions[idx];
        const dedupKey = dedupKeys[idx];

        if (dedupKey && existingDedupKeys.has(dedupKey)) {
          job.duplicates++;
          job.processed++;
          continue;
        }

        // Resolve account
        const accountKey = tx.iban || tx.account_number || '';
        let accountId: number | null = null;
        if (accountKey) {
          if (accountCache.has(accountKey)) {
            accountId = accountCache.get(accountKey)!;
          } else {
            accountId = await resolveAccountInMemory(tx, userId, accounts);
            accountCache.set(accountKey, accountId);
          }
        }

        const category = categorizeWithRules(tx.description || '', tx.counterparty || '', dbRules);

        toInsert.push({
          account_number: tx.account_number,
          bu_date: tx.bu_date,
          value_date: tx.value_date,
          type: tx.type,
          description: tx.description,
          counterparty: tx.counterparty,
          counterparty_iban: tx.counterparty_iban,
          counterparty_bic: tx.counterparty_bic,
          purpose: tx.purpose,
          currency: tx.currency,
          balance_after: tx.balance_after,
          creditor_id: tx.creditor_id,
          mandate_reference: tx.mandate_reference,
          original_category: tx.original_category,
          amount: tx.amount,
          direction: tx.direction,
          category,
          source_file: tx.source_file,
          hash: tx.hash,
          dedup_key: dedupKey,
          account_id: accountId,
        });
      }

      // Phase 2: insert rows in chunks with event loop yields
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        for (const row of chunk) {
          try {
            await prisma.transaction.create({ data: row });
            job.imported++;
          } catch (e: any) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
              job.skipped++;
            } else {
              throw e;
            }
          }
        }
        job.processed += chunk.length;

        // Yield event loop so other requests can be served
        await new Promise<void>(r => setImmediate(r));
      }

      // Create import log
      await prisma.importLog.create({
        data: {
          filename: job.filename,
          imported_at: new Date().toISOString(),
          records_imported: job.imported,
          records_skipped: job.skipped + job.duplicates,
          userId,
        },
      });

      job.status = 'done';
    } catch (err: any) {
      console.error('Background import error:', err);
      job.status = 'error';
      job.error = err.message || 'Unbekannter Fehler';
    }
  })();
}
