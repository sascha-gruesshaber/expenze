import type { BankParser, ParsedTransaction } from './types.js';
import { categorize, parseAmount, parseDate, computeHash } from './types.js';

function extractIban(text: string): string | null {
  const m = text.match(/IBAN:\s*(DE\d{20})/);
  return m ? m[1] : null;
}

function extractYear(text: string): string {
  const m = text.match(/Kontoauszug\s+\d{2}\/(\d{4})/);
  return m ? m[1] : new Date().getFullYear().toString();
}

const TX_TYPES = [
  'Kartenzahlung',
  'Lastschriftrückgabe',
  'Lastschrift',
  'Überweisung',
  'Online-Kartenzahlung',
  'Echtzeitüberweisung',
  'Sparen',
];

const TX_TYPE_PATTERN = TX_TYPES.join('|');

export const c24Parser: BankParser = {
  bankId: 'c24',
  bankName: 'C24',

  detect(text: string): boolean {
    return /C24 Bank GmbH|C24 Smartkonto/.test(text);
  },

  parse(text: string, filename: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const iban = extractIban(text);
    const year = extractYear(text);

    // Match transaction blocks: DD.MM.   DD.MM.   Type Details ... [+-] amount €
    // Each transaction starts with booking date pattern followed by value date
    const txRegex = new RegExp(
      `(\\d{2}\\.\\d{2})\\.\\s+(\\d{2}\\.\\d{2})\\.\\s+(${TX_TYPE_PATTERN})\\s+(.*?)\\s+([+-])\\s*([\\d.,]+)\\s*€`,
      'gs'
    );

    let match;
    while ((match = txRegex.exec(text)) !== null) {
      const buDate = parseDate(match[1], year);
      const valueDate = parseDate(match[2], year);
      const type = match[3];
      const details = match[4].replace(/\s+/g, ' ').trim();
      const sign = match[5];
      const amount = parseAmount(match[6]);
      const direction: 'credit' | 'debit' = sign === '+' ? 'credit' : 'debit';

      // Extract counterparty: text before IBAN reference or full details
      let counterparty: string;
      const ibanIdx = details.indexOf('IBAN:');
      if (ibanIdx > 0) {
        counterparty = details.substring(0, ibanIdx).trim();
      } else {
        counterparty = details;
      }
      // For "Sparen Aufrundkonto" entries, use the type + first part as counterparty
      if (type === 'Sparen') {
        const sparMatch = details.match(/^(Aufrundkonto\s+.*?)(?:\s+\/|$)/);
        counterparty = sparMatch ? sparMatch[1] : details;
      }
      counterparty = counterparty.substring(0, 100);

      const fullDesc = `${type} ${details}`.substring(0, 400);
      const category = categorize(fullDesc);

      const hash = computeHash([
        iban || '',
        buDate || '',
        valueDate || '',
        String(amount),
        direction,
        counterparty,
      ]);

      transactions.push({
        account_number: '',
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
        iban: iban,
        bank_name: 'C24',
      });
    }

    return transactions;
  },
};
