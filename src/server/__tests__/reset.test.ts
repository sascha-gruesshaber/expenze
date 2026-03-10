import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedAccount, seedTransaction, seedCategory, seedRule } from './helpers.js';

beforeAll(async () => { await createTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

describe('DELETE /api/reset', () => {
  it('clears all user data and re-seeds defaults', async () => {
    // Seed some data
    const account = await seedAccount();
    await seedTransaction(account.id);
    await seedCategory('Custom Category');
    await seedRule({ category: 'Custom Category', pattern: 'TEST' });

    // Reset
    const res = await api().delete('/api/reset');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify accounts are gone
    const accountsRes = await api().get('/api/accounts');
    expect(accountsRes.body).toHaveLength(0);

    // Verify transactions are gone
    const txRes = await api().get('/api/transactions');
    expect(txRes.body).toHaveLength(0);

    // Verify default categories were re-seeded
    const catsRes = await api().get('/api/categories');
    expect(catsRes.body.length).toBeGreaterThan(10);
    expect(catsRes.body).toContain('Lebensmittel');
    expect(catsRes.body).toContain('Sonstiges');

    // Verify default rules were re-seeded
    const rulesRes = await api().get('/api/category-rules');
    expect(rulesRes.body.length).toBeGreaterThan(10);
    expect(rulesRes.body.every((r: any) => r.is_default)).toBe(true);
  });
});
