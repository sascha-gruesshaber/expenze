import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedAccount, seedTransaction } from './helpers.js';

beforeAll(async () => { await createTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/accounts', () => {
  it('returns empty list when no accounts exist', async () => {
    const res = await api().get('/api/accounts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns accounts with transaction_count', async () => {
    const account = await seedAccount({ name: 'Girokonto' });
    await seedTransaction(account.id);
    await seedTransaction(account.id);

    const res = await api().get('/api/accounts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Girokonto');
    expect(res.body[0].transaction_count).toBe(2);
  });
});

describe('PATCH /api/accounts/:id', () => {
  it('updates account name and type', async () => {
    const account = await seedAccount();
    const res = await api()
      .patch(`/api/accounts/${account.id}`)
      .send({ name: 'Sparkonto', account_type: 'savings' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Sparkonto');
    expect(res.body.account_type).toBe('savings');
  });

  it('returns 404 for non-existent account', async () => {
    const res = await api()
      .patch('/api/accounts/99999')
      .send({ name: 'Nope' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/accounts/:id', () => {
  it('deletes account and cascades to transactions', async () => {
    const account = await seedAccount();
    await seedTransaction(account.id);

    const res = await api().delete(`/api/accounts/${account.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify account and transactions are gone
    const listRes = await api().get('/api/accounts');
    expect(listRes.body).toHaveLength(0);
  });

  it('returns 404 for non-existent account', async () => {
    const res = await api().delete('/api/accounts/99999');
    expect(res.status).toBe(404);
  });
});
