import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase } from './helpers.js';
import { ensureBuiltinTemplates } from '../parsers/registry.js';

// Volksbank CSV format (matches builtin template detection: headerStartsWith 'Bezeichnung Auftragskonto')
const VOLKSBANK_CSV = [
  'Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Kategorie;Steuerrelevant;Glaeubiger ID;Mandatsreferenz',
  'Max Mustermann;DE89370400440532013000;COBADEFFXXX;Volksbank;15.01.2025;15.01.2025;REWE MARKT;DE11111111111111111111;COBADEFFXXX;Lastschrift;Einkauf REWE;-42,50;EUR;1000,00;;;;DE123;REF001',
].join('\n');

beforeAll(async () => {
  await createTestApp();
  await ensureBuiltinTemplates();
});
beforeEach(async () => { await cleanDatabase(); });

describe('POST /api/import', () => {
  it('uploads a CSV file and creates import job', async () => {
    const res = await api()
      .post('/api/import')
      .attach('files', Buffer.from(VOLKSBANK_CSV), 'umsaetze.csv');

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
      .attach('files', Buffer.from(VOLKSBANK_CSV), 'umsaetze.csv');

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
