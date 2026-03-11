import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedAccount, seedTransaction, seedCategory } from './helpers.js';
import { prisma } from '../prisma.js';

beforeAll(async () => { await createTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

async function seedAnalysisData() {
  await seedCategory('Lebensmittel');
  await seedCategory('Gehalt & Lohn');
  await seedCategory('Sonstiges', { category_type: 'fallback' });

  const account = await seedAccount();
  await seedTransaction(account.id, { bu_date: '2025-01-15', amount: 50, direction: 'debit', category: 'Lebensmittel' });
  await seedTransaction(account.id, { bu_date: '2025-01-20', amount: 30, direction: 'debit', category: 'Lebensmittel' });
  await seedTransaction(account.id, { bu_date: '2025-01-05', amount: 3000, direction: 'credit', category: 'Gehalt & Lohn', counterparty: 'Arbeitgeber GmbH', counterparty_iban: 'DE11111111111111111111' });
  await seedTransaction(account.id, { bu_date: '2025-02-10', amount: 25, direction: 'debit', category: 'Sonstiges' });
  return account;
}

describe('GET /api/analysis/monthly', () => {
  it('returns monthly income and expenses', async () => {
    await seedAnalysisData();

    const res = await api().get('/api/analysis/monthly');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const jan = res.body.find((m: any) => m.month === '2025-01');
    expect(jan).toBeDefined();
    expect(jan.income).toBe(3000);
    expect(jan.expenses).toBe(80);
  });
});

describe('GET /api/analysis/categories', () => {
  it('returns category breakdown for debit', async () => {
    await seedAnalysisData();

    const res = await api().get('/api/analysis/categories?year=2025&direction=debit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const lebensmittel = res.body.find((c: any) => c.category === 'Lebensmittel');
    expect(lebensmittel).toBeDefined();
    expect(lebensmittel.total).toBe(80);
    expect(lebensmittel.count).toBe(2);
  });
});

describe('GET /api/analysis/summary', () => {
  it('returns stats and import log', async () => {
    await seedAnalysisData();

    const res = await api().get('/api/analysis/summary');
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.total_transactions).toBe(4);
    expect(res.body.imports).toEqual([]);
  });
});

describe('GET /api/analysis/flow', () => {
  it('returns Sankey nodes and links', async () => {
    await seedAnalysisData();

    const res = await api().get('/api/analysis/flow?year=2025');
    expect(res.status).toBe(200);
    expect(res.body.nodes).toBeDefined();
    expect(res.body.links).toBeDefined();
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.links)).toBe(true);

    // Should have konto node
    const kontoNode = res.body.nodes.find((n: any) => n.id === 'konto');
    expect(kontoNode).toBeDefined();
  });
});

describe('GET /api/analysis/daily', () => {
  it('returns daily spending heatmap data', async () => {
    await seedAnalysisData();

    const res = await api().get('/api/analysis/daily?year=2025');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Should have entries for debit days
    const jan15 = res.body.find((d: any) => d.day === '2025-01-15');
    expect(jan15).toBeDefined();
    expect(jan15.value).toBe(50);
  });
});

describe('GET /api/analysis/category-monthly', () => {
  it('returns category monthly trends', async () => {
    await seedAnalysisData();

    const res = await api().get('/api/analysis/category-monthly?year=2025');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const jan = res.body.find((m: any) => m.month === '2025-01');
    expect(jan).toBeDefined();
    expect(jan.categories).toBeDefined();
    expect(jan.categories['Lebensmittel']).toBe(80);
  });
});

describe('Filter by account group', () => {
  it('summary filters by group_id', async () => {
    await seedCategory('Sonstiges');
    const a1 = await seedAccount({ name: 'Alt' });
    const a2 = await seedAccount({ name: 'Neu', iban: 'DE11111111111111111111' });
    const a3 = await seedAccount({ name: 'Fremd', iban: 'DE33333333333333333333' });

    await seedTransaction(a1.id, { amount: 100, direction: 'debit' });
    await seedTransaction(a2.id, { amount: 200, direction: 'debit' });
    await seedTransaction(a3.id, { amount: 500, direction: 'debit' });

    // Create a group with a1 and a2
    const group = await prisma.accountGroup.create({ data: { name: 'Merged', userId: 'test-user-id' } });
    await prisma.bankAccount.updateMany({ where: { id: { in: [a1.id, a2.id] } }, data: { group_id: group.id } });

    const res = await api().get(`/api/analysis/summary?group_id=${group.id}`);
    expect(res.status).toBe(200);
    // Should only include a1 (100) + a2 (200), not a3 (500)
    expect(res.body.stats.total_transactions).toBe(2);
    expect(res.body.stats.total_expenses).toBe(300);
  });
});
