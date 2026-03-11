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

// ── Account Groups ───────────────────────────────────────────────

describe('Account Groups CRUD', () => {
  it('creates a group and lists it', async () => {
    const res = await api().post('/api/account-groups').send({ name: 'OLB Gesamt' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('OLB Gesamt');

    const list = await api().get('/api/account-groups');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('OLB Gesamt');
    expect(list.body[0].accounts).toEqual([]);
  });

  it('creates a group with initial accounts', async () => {
    const a1 = await seedAccount({ name: 'Konto A' });
    const a2 = await seedAccount({ name: 'Konto B', iban: 'DE11111111111111111111' });

    const res = await api().post('/api/account-groups').send({ name: 'Beide', accountIds: [a1.id, a2.id] });
    expect(res.status).toBe(200);

    const list = await api().get('/api/account-groups');
    expect(list.body[0].accounts).toHaveLength(2);
  });

  it('renames a group', async () => {
    const create = await api().post('/api/account-groups').send({ name: 'Alt' });
    const res = await api().patch(`/api/account-groups/${create.body.id}`).send({ name: 'Neu' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Neu');
  });

  it('deletes a group and preserves accounts', async () => {
    const account = await seedAccount();
    const create = await api().post('/api/account-groups').send({ name: 'Temp', accountIds: [account.id] });

    const del = await api().delete(`/api/account-groups/${create.body.id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    // Account still exists and is ungrouped
    const accounts = await api().get('/api/accounts');
    expect(accounts.body).toHaveLength(1);
    expect(accounts.body[0].group_id).toBeNull();
  });

  it('assigns and removes accounts from a group', async () => {
    const a1 = await seedAccount({ name: 'Konto 1' });
    const a2 = await seedAccount({ name: 'Konto 2', iban: 'DE22222222222222222222' });
    const create = await api().post('/api/account-groups').send({ name: 'Gruppe' });
    const groupId = create.body.id;

    // Assign
    const assign = await api().post(`/api/account-groups/${groupId}/accounts`).send({ accountIds: [a1.id, a2.id] });
    expect(assign.status).toBe(200);

    let list = await api().get('/api/account-groups');
    expect(list.body[0].accounts).toHaveLength(2);

    // Remove one
    const remove = await api().delete(`/api/account-groups/${groupId}/accounts/${a1.id}`);
    expect(remove.status).toBe(200);

    list = await api().get('/api/account-groups');
    expect(list.body[0].accounts).toHaveLength(1);
    expect(list.body[0].accounts[0].id).toBe(a2.id);
  });

  it('returns 404 for non-existent group', async () => {
    expect((await api().patch('/api/account-groups/99999').send({ name: 'x' })).status).toBe(404);
    expect((await api().delete('/api/account-groups/99999')).status).toBe(404);
  });

  it('cascades account_type change to member accounts', async () => {
    const a1 = await seedAccount({ name: 'Konto A' });
    const a2 = await seedAccount({ name: 'Konto B', iban: 'DE33333333333333333333' });
    const create = await api().post('/api/account-groups').send({ name: 'Typ-Test', accountIds: [a1.id, a2.id] });
    const groupId = create.body.id;

    // Change group type to savings
    const res = await api().patch(`/api/account-groups/${groupId}`).send({ account_type: 'savings' });
    expect(res.status).toBe(200);
    expect(res.body.account_type).toBe('savings');

    // Verify member accounts were updated
    const accounts = await api().get('/api/accounts');
    const members = accounts.body.filter((a: any) => a.group_id === groupId);
    expect(members).toHaveLength(2);
    for (const m of members) {
      expect(m.account_type).toBe('savings');
    }
  });

  it('cascades is_active change to member accounts', async () => {
    const a1 = await seedAccount({ name: 'Konto C' });
    const create = await api().post('/api/account-groups').send({ name: 'Active-Test', accountIds: [a1.id] });
    const groupId = create.body.id;

    // Hide the group
    const res = await api().patch(`/api/account-groups/${groupId}`).send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);

    // Verify member account is also hidden
    const accounts = await api().get('/api/accounts');
    const member = accounts.body.find((a: any) => a.id === a1.id);
    expect(member.is_active).toBe(false);
  });

  it('cascades group properties when assigning accounts', async () => {
    const a1 = await seedAccount({ name: 'Konto D' });
    const create = await api().post('/api/account-groups').send({ name: 'Assign-Test', account_type: 'investment' });
    const groupId = create.body.id;

    // Change group to inactive
    await api().patch(`/api/account-groups/${groupId}`).send({ is_active: false });

    // Now assign account — should cascade both type and active
    await api().post(`/api/account-groups/${groupId}/accounts`).send({ accountIds: [a1.id] });

    const accounts = await api().get('/api/accounts');
    const member = accounts.body.find((a: any) => a.id === a1.id);
    expect(member.account_type).toBe('investment');
    expect(member.is_active).toBe(false);
  });
});
