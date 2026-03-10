import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase } from './helpers.js';
import { ensureBuiltinTemplates } from '../parsers/registry.js';

beforeAll(async () => {
  await createTestApp();
  await ensureBuiltinTemplates();
});
beforeEach(async () => { await cleanDatabase(); });

describe('GET /api/bank-templates', () => {
  it('returns list including builtins', async () => {
    const res = await api().get('/api/bank-templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // All should have parsed config objects
    for (const t of res.body) {
      expect(typeof t.config).toBe('object');
    }
  });
});

describe('GET /api/bank-templates/:id', () => {
  it('returns a specific template', async () => {
    const listRes = await api().get('/api/bank-templates');
    const first = listRes.body[0];

    const res = await api().get(`/api/bank-templates/${first.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(first.id);
    expect(typeof res.body.config).toBe('object');
  });

  it('returns 404 for non-existent template', async () => {
    const res = await api().get('/api/bank-templates/nonexistent-id');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/bank-templates', () => {
  it('creates a custom template', async () => {
    const config = {
      detection: { headerStartsWith: 'MyBank' },
      csv: { delimiter: ';', minColumnsPerRow: 3 },
      columns: {
        bu_date: { column: 'Datum' },
        amount: { column: 'Betrag' },
        counterparty: { column: 'Empfänger' },
      },
      descriptionTemplate: '{counterparty}',
      hashFields: ['bu_date', 'amount', 'counterparty'],
    };

    const res = await api()
      .post('/api/bank-templates')
      .send({ id: 'test-custom-tpl', name: 'My Custom Bank', config });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('test-custom-tpl');
    expect(res.body.name).toBe('My Custom Bank');
    expect(res.body.is_builtin).toBe(false);
    expect(res.body.config.csv.delimiter).toBe(';');
  });

  it('rejects missing fields', async () => {
    const res = await api()
      .post('/api/bank-templates')
      .send({ id: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/bank-templates/:id', () => {
  it('updates a custom template', async () => {
    await api()
      .post('/api/bank-templates')
      .send({
        id: 'tpl-update-test',
        name: 'Before',
        config: { detection: { headerStartsWith: 'X' }, csv: { delimiter: ',' }, columns: {} },
      });

    const res = await api()
      .patch('/api/bank-templates/tpl-update-test')
      .send({ name: 'After' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('After');
  });
});

describe('DELETE /api/bank-templates/:id', () => {
  it('deletes a custom template', async () => {
    await api()
      .post('/api/bank-templates')
      .send({
        id: 'tpl-delete-test',
        name: 'To Delete',
        config: { detection: { headerStartsWith: 'Y' }, csv: { delimiter: ',' }, columns: {} },
      });

    const res = await api().delete('/api/bank-templates/tpl-delete-test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const getRes = await api().get('/api/bank-templates/tpl-delete-test');
    expect(getRes.status).toBe(404);
  });
});

describe('POST /api/bank-templates/test', () => {
  it('tests a template against CSV sample', async () => {
    const config = {
      detection: { headerStartsWith: 'Datum' },
      csv: { delimiter: ';', minColumnsPerRow: 3 },
      columns: {
        bu_date: { column: 'Datum' },
        amount: { column: 'Betrag' },
        counterparty: { column: 'Empfänger' },
        purpose: { column: 'Verwendungszweck' },
      },
      descriptionTemplate: '{counterparty} {purpose}',
      hashFields: ['bu_date', 'amount', 'counterparty'],
    };
    const csvText = [
      'Datum;Empfänger;Verwendungszweck;Betrag',
      '15.01.2025;REWE;Einkauf;-42,50',
      '16.01.2025;Arbeitgeber;Gehalt;3000,00',
    ].join('\n');

    const res = await api()
      .post('/api/bank-templates/test')
      .send({ config, csvText, bankName: 'TestBank' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.transactions).toHaveLength(2);
  });
});
