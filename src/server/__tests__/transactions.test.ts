import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedAccount, seedTransaction, seedCategory } from './helpers.js';

beforeAll(async () => { await createTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/transactions', () => {
  it('returns empty list when no transactions', async () => {
    const res = await api().get('/api/transactions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns transactions with bank_name', async () => {
    const account = await seedAccount({ bank: 'Volksbank' });
    await seedTransaction(account.id, { description: 'REWE Einkauf' });

    const res = await api().get('/api/transactions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('REWE Einkauf');
    expect(res.body[0].bank_name).toBe('Volksbank');
  });

  it('filters by year', async () => {
    const account = await seedAccount();
    await seedTransaction(account.id, { bu_date: '2025-01-15' });
    await seedTransaction(account.id, { bu_date: '2024-06-01' });

    const res = await api().get('/api/transactions?year=2025');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].bu_date).toBe('2025-01-15');
  });

  it('filters by month', async () => {
    const account = await seedAccount();
    await seedTransaction(account.id, { bu_date: '2025-01-15' });
    await seedTransaction(account.id, { bu_date: '2025-03-01' });

    const res = await api().get('/api/transactions?year=2025&month=1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by direction', async () => {
    const account = await seedAccount();
    await seedTransaction(account.id, { direction: 'debit' });
    await seedTransaction(account.id, { direction: 'credit' });

    const res = await api().get('/api/transactions?direction=credit');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].direction).toBe('credit');
  });

  it('filters by category', async () => {
    const account = await seedAccount();
    await seedTransaction(account.id, { category: 'Lebensmittel' });
    await seedTransaction(account.id, { category: 'Sonstiges' });

    const res = await api().get('/api/transactions?category=Lebensmittel');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by search term', async () => {
    const account = await seedAccount();
    await seedTransaction(account.id, { description: 'REWE MARKT 1234', counterparty: 'REWE Markt' });
    await seedTransaction(account.id, { description: 'LIDL FILIALE', counterparty: 'LIDL' });

    const res = await api().get('/api/transactions?search=REWE');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toContain('REWE');
  });
});

describe('PATCH /api/transactions/:id/category', () => {
  it('updates transaction category', async () => {
    const account = await seedAccount();
    const tx = await seedTransaction(account.id, { category: 'Sonstiges' });

    const res = await api()
      .patch(`/api/transactions/${tx.id}/category`)
      .send({ category: 'Lebensmittel' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 for non-existent transaction', async () => {
    const res = await api()
      .patch('/api/transactions/99999/category')
      .send({ category: 'Test' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/transactions/recategorize/preview', () => {
  it('previews single-mode recategorization', async () => {
    const account = await seedAccount();
    const tx = await seedTransaction(account.id);

    const res = await api()
      .post('/api/transactions/recategorize/preview')
      .send({ transaction_id: tx.id, category: 'Lebensmittel', mode: 'single' });

    expect(res.status).toBe(200);
    expect(res.body.affected_count).toBe(1);
    expect(res.body.sample_transactions).toHaveLength(1);
  });
});

describe('POST /api/transactions/recategorize', () => {
  it('applies single-mode recategorization', async () => {
    const account = await seedAccount();
    const tx = await seedTransaction(account.id, { category: 'Sonstiges' });
    await seedCategory('Lebensmittel');

    const res = await api()
      .post('/api/transactions/recategorize')
      .send({ transaction_id: tx.id, category: 'Lebensmittel', mode: 'single' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updated).toBe(1);

    // Verify the transaction was updated
    const txRes = await api().get('/api/transactions');
    expect(txRes.body[0].category).toBe('Lebensmittel');
  });
});
