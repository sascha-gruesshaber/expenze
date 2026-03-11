import express from 'express';
import request from 'supertest';
import { execSync } from 'child_process';
import { prisma } from '../prisma.js';
import type { Express } from 'express';

let app: Express | null = null;

export async function createTestApp(): Promise<Express> {
  if (app) return app;

  // Push schema to test DB (creates tables)
  execSync('npx prisma db push --accept-data-loss', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: 'file:./prisma/test.db' },
  });

  // Ensure test user exists
  await prisma.user.upsert({
    where: { id: 'test-user-id' },
    update: {},
    create: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  app = express();
  app.use(express.json({ limit: '20mb' }));

  // Dynamic import so vi.mock is applied
  const { default: routes } = await import('../routes.js');
  app.use('/api', routes);

  return app;
}

export function api() {
  if (!app) throw new Error('Call createTestApp() first');
  return request(app);
}

export async function cleanDatabase() {
  // Delete in dependency order
  await prisma.transaction.deleteMany();
  await prisma.importLog.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.accountGroup.deleteMany();
  await prisma.categoryRule.deleteMany();
  await prisma.category.deleteMany();
  await prisma.bankTemplate.deleteMany({ where: { is_builtin: false } });
  await prisma.setting.deleteMany();
}

// ── Seed helpers ───────────────────────────────────────────────────

export async function seedAccount(overrides: Partial<{
  name: string; iban: string; bank: string; account_type: string; is_active: boolean;
}> = {}) {
  return prisma.bankAccount.create({
    data: {
      name: overrides.name ?? 'Test Konto',
      iban: overrides.iban ?? 'DE89370400440532013000',
      bank: overrides.bank ?? 'Testbank',
      account_type: overrides.account_type ?? 'checking',
      is_active: overrides.is_active ?? true,
      created_at: new Date().toISOString(),
      userId: 'test-user-id',
    },
  });
}

export async function seedTransaction(accountId: number, overrides: Partial<{
  bu_date: string; amount: number; direction: string; category: string;
  description: string; counterparty: string; hash: string; dedup_key: string;
  counterparty_iban: string;
}> = {}) {
  return prisma.transaction.create({
    data: {
      account_id: accountId,
      account_number: '0532013000',
      bu_date: overrides.bu_date ?? '2025-01-15',
      value_date: overrides.bu_date ?? '2025-01-15',
      amount: overrides.amount ?? 42.50,
      direction: overrides.direction ?? 'debit',
      category: overrides.category ?? 'Sonstiges',
      description: overrides.description ?? 'REWE MARKT',
      counterparty: overrides.counterparty ?? 'REWE',
      type: 'Lastschrift',
      source_file: 'test.csv',
      hash: overrides.hash ?? `hash-${Math.random().toString(36).slice(2)}`,
      dedup_key: overrides.dedup_key ?? `dedup-${Math.random().toString(36).slice(2)}`,
      counterparty_iban: overrides.counterparty_iban ?? null,
    },
  });
}

export async function seedCategory(name: string, overrides: Partial<{
  is_default: boolean; category_type: string;
}> = {}) {
  return prisma.category.create({
    data: {
      name,
      is_default: overrides.is_default ?? false,
      category_type: overrides.category_type ?? 'default',
      userId: 'test-user-id',
      created_at: new Date().toISOString(),
    },
  });
}

export async function seedDefaultCategories() {
  const { DEFAULT_CATEGORIES } = await import('../defaultRules.js');
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.create({
      data: {
        name: cat.name,
        is_default: true,
        category_type: cat.type,
        userId: 'test-user-id',
        created_at: new Date().toISOString(),
      },
    });
  }
}

export async function seedImportLog(overrides: Partial<{
  filename: string; records_imported: number; records_skipped: number;
}> = {}) {
  return prisma.importLog.create({
    data: {
      filename: overrides.filename ?? 'test.csv',
      imported_at: new Date().toISOString(),
      records_imported: overrides.records_imported ?? 5,
      records_skipped: overrides.records_skipped ?? 0,
      userId: 'test-user-id',
    },
  });
}

export async function seedRule(overrides: Partial<{
  category: string; pattern: string; match_field: string; match_type: string; priority: number;
}> = {}) {
  return prisma.categoryRule.create({
    data: {
      category: overrides.category ?? 'Lebensmittel',
      pattern: overrides.pattern ?? 'REWE|LIDL',
      match_field: overrides.match_field ?? 'description',
      match_type: overrides.match_type ?? 'regex',
      priority: overrides.priority ?? 100,
      is_default: false,
      userId: 'test-user-id',
      created_at: new Date().toISOString(),
    },
  });
}
