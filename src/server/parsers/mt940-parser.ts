import type { ParsedTransaction } from './types.js';
import { categorize, computeHash } from './types.js';

/**
 * MT940 / SWIFT parser — generic for all banks.
 * Handles .mta / .sta files.
 */

interface MT940Statement {
  accountId: string;        // :25: field (bank code / account number)
  entries: MT940Entry[];
}

interface MT940Entry {
  valueDateRaw: string;     // YYMMDD
  bookDateRaw: string;      // MMDD
  direction: 'credit' | 'debit';
  amount: number;
  typeCode: string;         // e.g. NDDT, NTRF, NMSC
  reference: string;        // e.g. KREF+, NONREF
  details: string;          // :86: raw
  counterparty: string;
  counterpartyIban: string | null;
  counterpartyBic: string | null;
  purpose: string;
  type: string;             // ?00 field (Buchungstext)
  creditorId: string | null;
  mandateReference: string | null;
}

// ── :86: subfield parser ──────────────────────────────────────────

function parseSubfields(raw: string): Map<string, string> {
  const fields = new Map<string, string>();
  // The :86: line starts with optional GVC code (3 digits), then ?00...
  const parts = raw.split(/\?(\d{2})/);
  // parts[0] = GVC code prefix (e.g. "105"), parts[1] = "00", parts[2] = value, ...
  if (parts[0]) {
    fields.set('gvc', parts[0].trim());
  }
  for (let i = 1; i < parts.length - 1; i += 2) {
    const key = parts[i];
    const value = parts[i + 1] || '';
    // Subfields ?20-?29 are continuation of purpose, ?32-?33 are counterparty name, etc.
    const existing = fields.get(key);
    if (existing) {
      fields.set(key, existing + value);
    } else {
      fields.set(key, value);
    }
  }
  return fields;
}

function extractPurpose(subfields: Map<string, string>): string {
  // Concatenate ?20 through ?29 and ?60-?63
  const parts: string[] = [];
  for (let i = 20; i <= 29; i++) {
    const val = subfields.get(String(i).padStart(2, '0'));
    if (val) parts.push(val);
  }
  for (let i = 60; i <= 63; i++) {
    const val = subfields.get(String(i));
    if (val) parts.push(val);
  }
  const raw = parts.join('');

  // Extract SVWZ+ (Verwendungszweck) if present
  const svwzMatch = raw.match(/SVWZ\+(.+?)(?:\s+(?:EREF|KREF|MREF|CRED|IBAN|BIC|ABWA)[:+]|$)/s);
  if (svwzMatch) return svwzMatch[1].trim();

  return raw.trim();
}

function extractFromPurpose(text: string, key: string): string | null {
  const pattern = new RegExp(`${key}[+:]\\s*([^\\s]+(?:\\s+[^\\s]+)*)`, 'i');
  const m = text.match(pattern);
  if (!m) return null;
  // Clean up — stop at next known key
  const val = m[1].split(/\s+(?:EREF|KREF|MREF|CRED|SVWZ|PURP|IBAN|BIC|ABWA)[+:]/)[0];
  return val.trim() || null;
}

// ── :61: transaction line parser ──────────────────────────────────

function parseLine61(line: string): {
  valueDate: string;
  bookDate: string;
  direction: 'credit' | 'debit';
  amount: number;
  typeCode: string;
  reference: string;
} | null {
  // Format: YYMMDD[MMDD][C|D|RC|RD][letter?]Amount[,decimals]NtypeREF
  const m = line.match(
    /^(\d{6})(\d{4})?(R?[CD])([A-Z]?)(\d+,\d{0,2})([A-Z]{4})(.*)/
  );
  if (!m) return null;

  const [, valueDateRaw, bookDateRaw, cdMark, , amountStr, typeCode, reference] = m;

  const direction: 'credit' | 'debit' =
    cdMark === 'C' || cdMark === 'RC' ? 'credit' : 'debit';

  const amount = parseFloat(amountStr.replace(',', '.'));

  // Value date: YYMMDD → YYYY-MM-DD
  const vy = parseInt(valueDateRaw.substring(0, 2), 10);
  const vm = valueDateRaw.substring(2, 4);
  const vd = valueDateRaw.substring(4, 6);
  const fullYear = vy >= 70 ? 1900 + vy : 2000 + vy;
  const valueDate = `${fullYear}-${vm}-${vd}`;

  // Book date: MMDD (use value date year)
  let bookDate = valueDate;
  if (bookDateRaw) {
    const bm = bookDateRaw.substring(0, 2);
    const bd = bookDateRaw.substring(2, 4);
    // Handle year boundary (Dec value date, Jan book date)
    let by = fullYear;
    if (parseInt(vm) === 12 && parseInt(bm) === 1) by = fullYear + 1;
    if (parseInt(vm) === 1 && parseInt(bm) === 12) by = fullYear - 1;
    bookDate = `${by}-${bm}-${bd}`;
  }

  return { valueDate, bookDate, direction, amount, typeCode, reference };
}

// ── Main parser ───────────────────────────────────────────────────

function splitStatements(text: string): string[] {
  // Split by the "-" separator between statements
  return text.split(/\n-\s*\n/).filter(s => s.includes(':20:'));
}

function parseStatement(block: string): MT940Statement {
  const lines = block.split(/\r?\n/);
  let accountId = '';
  const entries: MT940Entry[] = [];

  // Merge multi-line fields: field tags start with ":"
  const mergedLines: string[] = [];
  for (const line of lines) {
    if (/^:\d{2}[A-Z]?:/.test(line)) {
      mergedLines.push(line);
    } else if (mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1] += line;
    }
  }

  let current61: ReturnType<typeof parseLine61> = null;
  let current86 = '';

  const flushEntry = () => {
    if (!current61) return;
    const subfields = parseSubfields(current86);
    const fullPurpose = extractPurpose(subfields);
    const counterpartyName = [
      subfields.get('32') || '',
      subfields.get('33') || '',
    ].join('').trim();

    // Extract IBAN/BIC from purpose text
    const allText = current86;
    const ibanMatch = allText.match(/IBAN:\s*([A-Z]{2}\d{2}[\dA-Z]{8,30})/);
    const bicMatch = allText.match(/BIC:\s*([A-Z]{4}[A-Z]{2}[A-Z\d]{2}(?:[A-Z\d]{3})?)/);
    const credMatch = allText.match(/CRED[+:]\s*([A-Z]{2}\d{2}[A-Z\d]+)/);
    const mrefMatch = allText.match(/MREF[+:]\s*([^\s?]+)/);

    entries.push({
      valueDateRaw: current61.valueDate,
      bookDateRaw: current61.bookDate,
      direction: current61.direction,
      amount: current61.amount,
      typeCode: current61.typeCode,
      reference: current61.reference,
      details: current86,
      counterparty: counterpartyName || current61.reference,
      counterpartyIban: ibanMatch ? ibanMatch[1].replace(/\s/g, '') : null,
      counterpartyBic: bicMatch ? bicMatch[1] : null,
      purpose: fullPurpose,
      type: subfields.get('00') || mapTypeCode(current61.typeCode),
      creditorId: credMatch ? credMatch[1] : null,
      mandateReference: mrefMatch ? mrefMatch[1] : null,
    });
    current61 = null;
    current86 = '';
  };

  for (const line of mergedLines) {
    const tagMatch = line.match(/^:(\d{2}[A-Z]?):(.*)/s);
    if (!tagMatch) continue;
    const [, tag, content] = tagMatch;

    if (tag === '25') {
      accountId = content.trim();
    } else if (tag === '61') {
      flushEntry();
      current61 = parseLine61(content.trim());
    } else if (tag === '86') {
      current86 = content.trim();
    }
  }
  flushEntry();

  return { accountId, entries };
}

function mapTypeCode(code: string): string {
  const map: Record<string, string> = {
    NDDT: 'Lastschrift',
    NTRF: 'Überweisung',
    NMSC: 'Sonstiges',
    NCHK: 'Scheck',
    NSTO: 'Dauerauftrag',
    NCOL: 'Inkasso',
  };
  return map[code] || code;
}

export function parseMT940(text: string, filename: string): ParsedTransaction[] {
  const statements = splitStatements(text);
  const transactions: ParsedTransaction[] = [];

  for (const block of statements) {
    const stmt = parseStatement(block);
    const accountParts = stmt.accountId.split('/');
    const accountNumber = accountParts.length > 1
      ? accountParts[1].replace(/^0+/, '')
      : stmt.accountId;

    for (const entry of stmt.entries) {
      const description = [entry.type, entry.purpose]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .substring(0, 400)
        .trim();

      const category = categorize(description + ' ' + entry.counterparty);

      const hash = computeHash([
        accountNumber,
        entry.bookDateRaw,
        String(entry.amount),
        entry.direction,
        entry.counterparty,
        description,
      ]);

      transactions.push({
        account_number: accountNumber,
        bu_date: entry.bookDateRaw,
        value_date: entry.valueDateRaw,
        type: entry.type,
        description,
        counterparty: entry.counterparty.substring(0, 100),
        counterparty_iban: entry.counterpartyIban,
        counterparty_bic: entry.counterpartyBic,
        purpose: entry.purpose || null,
        currency: 'EUR',
        balance_after: null,
        creditor_id: entry.creditorId,
        mandate_reference: entry.mandateReference,
        original_category: null,
        amount: entry.amount,
        direction: entry.direction,
        category,
        source_file: filename,
        hash,
        iban: null,
        bank_name: 'MT940',
      });
    }
  }

  return transactions;
}

export function detectMT940(text: string): boolean {
  return /^:20:/m.test(text) && /:61:/m.test(text);
}
