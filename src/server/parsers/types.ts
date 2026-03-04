import crypto from 'crypto';

export interface ParsedTransaction {
  account_number: string;
  bu_date: string | null;
  value_date: string | null;
  type: string;
  description: string;
  counterparty: string;
  amount: number;
  direction: 'credit' | 'debit';
  category: string;
  source_file: string;
  hash: string;
  iban: string | null;
  bank_name: string;
}

export interface BankParser {
  bankId: string;
  bankName: string;
  detect(text: string): boolean;
  parse(text: string, filename: string): ParsedTransaction[];
}

export const CATEGORY_RULES: [RegExp, string][] = [
  [/REWE|LIDL|ALDI|NETTO|KAUFLAND|EDEKA|PENNY|NORMA|MH MULLER|MUELLER/i, 'Lebensmittel & Einkauf'],
  [/FRESSNAPF|Tierhandlung/i, 'Haustier'],
  [/VPV|VERSICHERUNG|ALLIANZ|HUK|ARAG|AXA|ERGO/i, 'Versicherung'],
  [/LECHWERKE|LEW Verteilnetz|energie schwaben|GAS Abschlag/i, 'Energie & Nebenkosten'],
  [/PHOTOVOLTAIK|Einspeisung/i, 'Einspeisung Photovoltaik'],
  [/TELEKOM|VODAFONE|O2 |INTERNET/i, 'Telefon & Internet'],
  [/APOTHEKE|ARZT|KRANKENHAUS/i, 'Gesundheit'],
  [/Grundsteuer|Gemeinde Buttenwiesen/i, 'Steuern & Abgaben'],
  [/Teilzahlung Darlehen|Darlehen/i, 'Kredit & Darlehen'],
  [/Haushaltsgeld|Haushaltskonto/i, 'Haushalt'],
  [/AMAZON|EBAY|PAYPAL|ZALANDO|OTTO/i, 'Online Shopping'],
  [/TANKSTELLE|ARAL|SHELL|BP|ESSO/i, 'Kraftstoff'],
  [/BAHN|FLUG|LUFTHANSA|TAXI|UBER/i, 'Reise & Verkehr'],
  [/Kontoführung|Abschluss/i, 'Bankgebühren'],
  [/Aufrundkonto|Aufrundung|Sparrate|Sparen\s/i, 'Sparen'],
];

export function categorize(text: string): string {
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return 'Sonstiges';
}

export interface DbCategoryRule {
  id: number;
  category: string;
  pattern: string;
  match_field: string;
  match_type: string;
  priority: number;
}

export function categorizeWithRules(description: string, counterparty: string, dbRules: DbCategoryRule[]): string {
  const sorted = [...dbRules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const textToMatch =
      rule.match_field === 'counterparty' ? counterparty :
      rule.match_field === 'both' ? `${description} ${counterparty}` :
      description;

    if (rule.match_type === 'keyword') {
      if (textToMatch.toLowerCase().includes(rule.pattern.toLowerCase())) {
        return rule.category;
      }
    } else {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(textToMatch)) return rule.category;
      } catch {
        // invalid regex, skip
      }
    }
  }
  return 'Sonstiges';
}

export function parseAmount(amountStr: string): number {
  return parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
}

export function parseDate(dateStr: string, year: string): string | null {
  const clean = dateStr.trim().replace(/\.$/, '');
  const parts = clean.split('.');
  if (parts.length >= 2) {
    return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return null;
}

export function computeHash(parts: string[]): string {
  return crypto.createHash('md5').update(parts.join('|')).digest('hex');
}
