import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedRule, seedCategory, seedAccount, seedTransaction } from './helpers.js';

beforeAll(async () => { await createTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/category-rules', () => {
  it('returns rules with tx_count', async () => {
    await seedCategory('Lebensmittel');
    const account = await seedAccount();
    await seedTransaction(account.id, { category: 'Lebensmittel' });
    await seedRule({ category: 'Lebensmittel', pattern: 'REWE' });

    const res = await api().get('/api/category-rules');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].pattern).toBe('REWE');
    expect(res.body[0].tx_count).toBe(1);
  });
});

describe('POST /api/category-rules', () => {
  it('creates a keyword rule', async () => {
    const res = await api()
      .post('/api/category-rules')
      .send({ category: 'Lebensmittel', pattern: 'ALDI', match_type: 'keyword' });

    expect(res.status).toBe(200);
    expect(res.body.pattern).toBe('ALDI');
    expect(res.body.match_type).toBe('keyword');
  });

  it('creates a regex rule', async () => {
    const res = await api()
      .post('/api/category-rules')
      .send({ category: 'Lebensmittel', pattern: 'REWE|LIDL', match_type: 'regex' });

    expect(res.status).toBe(200);
    expect(res.body.match_type).toBe('regex');
  });

  it('rejects invalid regex', async () => {
    const res = await api()
      .post('/api/category-rules')
      .send({ category: 'Test', pattern: '[invalid', match_type: 'regex' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/category-rules/:id', () => {
  it('updates rule pattern', async () => {
    await seedCategory('Lebensmittel');
    const rule = await seedRule({ category: 'Lebensmittel', pattern: 'REWE' });

    const res = await api()
      .patch(`/api/category-rules/${rule.id}`)
      .send({ pattern: 'REWE|EDEKA' });

    expect(res.status).toBe(200);
    expect(res.body.pattern).toBe('REWE|EDEKA');
  });

  it('returns 404 for non-existent rule', async () => {
    const res = await api()
      .patch('/api/category-rules/99999')
      .send({ pattern: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/category-rules/:id', () => {
  it('deletes a rule', async () => {
    await seedCategory('Lebensmittel');
    const rule = await seedRule({ category: 'Lebensmittel' });

    const res = await api().delete(`/api/category-rules/${rule.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const listRes = await api().get('/api/category-rules');
    expect(listRes.body).toHaveLength(0);
  });
});
