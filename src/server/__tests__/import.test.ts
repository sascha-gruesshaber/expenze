import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedAccount, seedTransaction, seedImportLog } from './helpers.js';
import { ensureBuiltinTemplates, invalidateTemplateCache } from '../parsers/registry.js';

const TEST_CSV_HEADER = 'Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz';
const TEST_CSV = [
  TEST_CSV_HEADER,
  'Max Mustermann;DE89370400440532013000;COBADEFFXXX;Testbank;15.01.2025;15.01.2025;REWE MARKT;DE11111111111111111111;COBADEFFXXX;Lastschrift;Einkauf REWE;-42,50;EUR;1000,00;;;;DE123;REF001',
].join('\n');

beforeAll(async () => {
  await createTestApp();
  await ensureBuiltinTemplates();
});
beforeEach(async () => {
  await cleanDatabase();
  // Create a test template that matches the CSV header (Volksbank built-in was removed)
  const { prisma } = await import('../prisma.js');
  await prisma.bankTemplate.upsert({
    where: { id: 'test-volksbank' },
    update: {},
    create: {
      id: 'test-volksbank',
      name: 'Test Volksbank',
      config: JSON.stringify({
        detection: { headerStartsWith: TEST_CSV_HEADER },
        csv: { delimiter: ';', minColumnsPerRow: 5 },
        columns: {
          iban: { column: 'IBAN Auftragskonto' },
          bank_name: { column: 'Bankname Auftragskonto' },
          bu_date: { column: 'Buchungstag' },
          value_date: { column: 'Valutadatum' },
          type: { column: 'Buchungstext' },
          counterparty: { column: 'Name Zahlungsbeteiligter' },
          counterparty_iban: { column: 'IBAN Zahlungsbeteiligter' },
          counterparty_bic: { column: 'BIC (SWIFT-Code) Zahlungsbeteiligter' },
          purpose: { column: 'Verwendungszweck' },
          amount: { column: 'Betrag' },
          currency: { column: 'Waehrung' },
          balance_after: { column: 'Saldo nach Buchung' },
          creditor_id: { column: 'Glaeubiger ID' },
          mandate_reference: { column: 'Mandatsreferenz' },
        },
        descriptionTemplate: '{type} {purpose}',
        hashFields: ['iban', 'bu_date', 'value_date', 'amount', 'direction', 'counterparty'],
      }),
      is_builtin: false,
      enabled: true,
      userId: 'test-user-id',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  invalidateTemplateCache();
});

describe('POST /api/import', () => {
  it('uploads a CSV file and creates import job', async () => {
    const res = await api()
      .post('/api/import')
      .attach('files', Buffer.from(TEST_CSV), 'umsaetze.csv');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toHaveLength(1);

    const result = res.body.results[0];
    expect(result.importId).toBeTruthy();
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/import/:id/status', () => {
  it('returns 404 for non-existent import', async () => {
    const res = await api().get('/api/import/nonexistent-uuid/status');
    expect(res.status).toBe(404);
  });

  it('tracks import progress until done', async () => {
    const importRes = await api()
      .post('/api/import')
      .attach('files', Buffer.from(TEST_CSV), 'umsaetze.csv');

    const result = importRes.body.results[0];
    expect(result.importId).toBeTruthy();

    // Poll until done (max 3 seconds)
    let status: any;
    for (let i = 0; i < 30; i++) {
      const statusRes = await api().get(`/api/import/${result.importId}/status`);
      expect(statusRes.status).toBe(200);
      status = statusRes.body;
      if (status.status === 'done' || status.status === 'error') break;
      await new Promise(r => setTimeout(r, 100));
    }

    expect(status.status).toBe('done');
    expect(status.imported).toBeGreaterThanOrEqual(1);

    // Verify transactions were created
    const txRes = await api().get('/api/transactions');
    expect(txRes.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DELETE /api/imports/:id', () => {
  it('deletes import and associated transactions', async () => {
    const account = await seedAccount();
    const importLog = await seedImportLog({ filename: 'delete-test.csv', records_imported: 2 });

    await seedTransaction(account.id, { description: 'TX1', hash: 'h1', dedup_key: 'd1' });
    await seedTransaction(account.id, { description: 'TX2', hash: 'h2', dedup_key: 'd2' });

    // Override source_file to match import filename
    const { prisma } = await import('../prisma.js');
    await prisma.transaction.updateMany({
      where: { account_id: account.id },
      data: { source_file: 'delete-test.csv' },
    });

    const res = await api().delete(`/api/imports/${importLog.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted_transactions).toBe(2);
    expect(res.body.filename).toBe('delete-test.csv');

    // Verify transactions are gone
    const txRes = await api().get('/api/transactions');
    expect(txRes.body.length).toBe(0);
  });

  it('returns 404 for non-existent import', async () => {
    const res = await api().delete('/api/imports/99999');
    expect(res.status).toBe(404);
  });
});
