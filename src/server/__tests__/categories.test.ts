import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedCategory, seedAccount, seedTransaction, seedRule } from './helpers.js';

beforeAll(async () => { await createTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/categories', () => {
  it('returns category names sorted alphabetically', async () => {
    await seedCategory('Lebensmittel');
    await seedCategory('Auto');

    const res = await api().get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['Auto', 'Lebensmittel']);
  });
});

describe('GET /api/categories/overview', () => {
  it('returns category stats with tx counts', async () => {
    await seedCategory('Lebensmittel');
    await seedCategory('Sonstiges', { category_type: 'fallback' });
    const account = await seedAccount();
    await seedTransaction(account.id, { category: 'Lebensmittel', direction: 'debit', amount: 50 });

    const res = await api().get('/api/categories/overview');
    expect(res.status).toBe(200);

    const lebensmittel = res.body.find((c: any) => c.category === 'Lebensmittel');
    expect(lebensmittel).toBeDefined();
    expect(lebensmittel.tx_count).toBe(1);
    expect(lebensmittel.total_debit).toBe(50);
  });
});

describe('POST /api/categories', () => {
  it('creates a new category', async () => {
    const res = await api()
      .post('/api/categories')
      .send({ name: 'Neue Kategorie' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Neue Kategorie');
  });

  it('rejects empty name', async () => {
    const res = await api()
      .post('/api/categories')
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate name', async () => {
    await seedCategory('Lebensmittel');
    const res = await api()
      .post('/api/categories')
      .send({ name: 'Lebensmittel' });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/categories/:id', () => {
  it('renames category and cascades to transactions and rules', async () => {
    const cat = await seedCategory('Essen');
    const account = await seedAccount();
    await seedTransaction(account.id, { category: 'Essen' });
    await seedRule({ category: 'Essen', pattern: 'REWE' });

    const res = await api()
      .patch(`/api/categories/${cat.id}`)
      .send({ name: 'Lebensmittel' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Lebensmittel');

    // Verify cascade to transactions
    const txRes = await api().get('/api/transactions');
    expect(txRes.body[0].category).toBe('Lebensmittel');

    // Verify cascade to rules
    const rulesRes = await api().get('/api/category-rules');
    expect(rulesRes.body[0].category).toBe('Lebensmittel');
  });
});

describe('POST /api/categories/:id/delete', () => {
  it('deletes category and reassigns transactions to replacement', async () => {
    const cat = await seedCategory('Essen');
    await seedCategory('Sonstiges', { category_type: 'fallback' });
    const account = await seedAccount();
    await seedTransaction(account.id, { category: 'Essen' });

    const res = await api()
      .post(`/api/categories/${cat.id}/delete`)
      .send({ replacement_category: 'Sonstiges' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify transactions reassigned
    const txRes = await api().get('/api/transactions');
    expect(txRes.body[0].category).toBe('Sonstiges');
  });

  it('cannot delete Sonstiges', async () => {
    const cat = await seedCategory('Sonstiges');
    const res = await api()
      .post(`/api/categories/${cat.id}/delete`)
      .send({});
    expect(res.status).toBe(400);
  });
});
