import type { BankParser, ParsedTransaction } from './types.js';
import { categorize, parseAmount, parseDate, computeHash } from './types.js';

function extractIban(text: string): string | null {
  const m = text.match(/IBAN:\s*(DE\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2})/);
  return m ? m[1].replace(/\s/g, '') : null;
}

function inferYear(text: string): string {
  const matches = [...text.matchAll(/(\d{4})/g)].map(m => m[1]);
  const years = matches.filter(y => +y >= 2020 && +y <= 2030);
  return years[0] || new Date().getFullYear().toString();
}

function extractAccountNumber(text: string): string {
  // Look for 6-digit account number near "Kontonummer" context
  // Pattern: "K00002937 3183 003  372617  2/2026" — account number before the statement number
  const m = text.match(/\b(\d{6})\s+\d+\/\d{4}\b/);
  if (m) return m[1];
  // Fallback: first standalone 6-digit number
  const m2 = text.match(/\b(\d{6})\b/);
  if (m2) return m2[1];
  return 'unknown';
}

export const volksbankParser: BankParser = {
  bankId: 'volksbank',
  bankName: 'Volksbank',

  detect(text: string): boolean {
    return /Raiffeisenbank|Volksbank|VR-NetKonto|VR Bank/i.test(text);
  },

  parse(text: string, filename: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const accountNumber = extractAccountNumber(text);
    const iban = extractIban(text);
    const year = inferYear(text);

    const txRegex = /(\d{2}\.\d{2})\.\s+(\d{2}\.\d{2})\.\s+(GUTSCHRIFT|DAUERAUFTRAG|Kartenzahlung girocard|Basislastschrift|UEBERWEISUNG|Abschluss)\s+([\d.]+,\d{2})\s+([HS])\s*(.*?)(?=\d{2}\.\d{2}\.\s+\d{2}\.\d{2}\.|\s*Übertrag|\s*neuer Kontostand|$)/gs;

    const typeMap: Record<string, string> = {
      'GUTSCHRIFT': 'Gutschrift',
      'DAUERAUFTRAG': 'Dauerauftrag',
      'Basislastschrift': 'Lastschrift',
      'Kartenzahlung girocard': 'Kartenzahlung',
      'UEBERWEISUNG': 'Überweisung',
      'Abschluss': 'Abschluss',
    };

    let match;
    while ((match = txRegex.exec(text)) !== null) {
      const buDate = parseDate(match[1], year);
      const valueDate = parseDate(match[2], year);
      const typeRaw = match[3];
      const amount = parseAmount(match[4]);
      const direction: 'credit' | 'debit' = match[5] === 'H' ? 'credit' : 'debit';
      const rest = match[6].trim();

      const restClean = rest.replace(/\s+/g, ' ').trim();
      const cpMatch = restClean.match(/^(.+?)(?:\s+(?:EREF|MREF|CRED|IBAN|REF|ELV|\d{6,}|PK-Nr|Rechnung|Kunden|BELEG|Abschluss|Teilzahlung|Guth\.).*)?$/s);
      const counterparty = cpMatch ? cpMatch[1].trim().substring(0, 100) : restClean.substring(0, 80);

      const fullDesc = `${typeRaw} ${restClean}`.substring(0, 400);
      const category = categorize(fullDesc);
      const type = typeMap[typeRaw] || typeRaw;

      const hash = computeHash([accountNumber, buDate || '', valueDate || '', String(amount), direction, counterparty]);

      transactions.push({
        account_number: accountNumber,
        bu_date: buDate,
        value_date: valueDate,
        type,
        description: fullDesc,
        counterparty,
        amount,
        direction,
        category,
        source_file: filename,
        hash,
        iban,
        bank_name: 'Volksbank',
      });
    }

    return transactions;
  },
};
