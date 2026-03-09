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
  counterparty_iban: string | null;
  counterparty_bic: string | null;
  purpose: string | null;
  currency: string | null;
  balance_after: number | null;
  creditor_id: string | null;
  mandate_reference: string | null;
  original_category: string | null;
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

// ── Template Config interfaces ──────────────────────────────────────

export interface ColumnMapping {
  column: string;
  fallbackIndex?: number;
  defaultValue?: string;
  joinColumns?: string[];
  joinSeparator?: string;
}

export interface FallbackRule {
  field: string;
  when: 'empty';
  copyFrom: string;
}

export interface BankTemplateConfig {
  detection: {
    headerStartsWith: string;
  };
  csv: {
    delimiter: 'auto' | ';' | ',';
    minColumnsPerRow: number;
  };
  columns: {
    account_number?: ColumnMapping;
    iban?: ColumnMapping;
    bank_name?: ColumnMapping;
    bu_date: ColumnMapping;
    value_date?: ColumnMapping;
    type?: ColumnMapping;
    counterparty: ColumnMapping;
    counterparty_iban?: ColumnMapping;
    counterparty_bic?: ColumnMapping;
    purpose?: ColumnMapping;
    amount: ColumnMapping;
    currency?: ColumnMapping;
    balance_after?: ColumnMapping;
    creditor_id?: ColumnMapping;
    mandate_reference?: ColumnMapping;
    original_category?: ColumnMapping;
  };
  descriptionTemplate: string;
  hashFields: string[];
  typeMap?: Record<string, string>;
  fallbacks?: FallbackRule[];
}

// ── Category Rules ──────────────────────────────────────────────────

export const CATEGORY_RULES: [RegExp, string][] = [
  [/REWE|LIDL|ALDI|NETTO|KAUFLAND|EDEKA|PENNY|NORMA/i, 'Lebensmittel'],
  [/MH MULLER|MUELLER|ROSSMANN|DM-DROGERIE|DM FIL/i, 'Drogerie & Körperpflege'],
  [/FRESSNAPF|Tierhandlung|ZOOPLUS|Futterhaus/i, 'Haustier'],
  [/VPV|VERSICHERUNG|ALLIANZ|HUK|ARAG|AXA|ERGO/i, 'Versicherungen'],
  [/LECHWERKE|LEW Verteilnetz|energie schwaben|GAS Abschlag|Stadtwerke/i, 'Energie & Nebenkosten'],
  [/PHOTOVOLTAIK|Einspeisung/i, 'Einspeisung Photovoltaik'],
  [/TELEKOM|VODAFONE|O2 |INTERNET|1&1/i, 'Telefon & Internet'],
  [/APOTHEKE|ARZT|KRANKENHAUS|KLINIK|ZAHNARZT|OPTIKER/i, 'Gesundheit & Apotheke'],
  [/Grundsteuer|Gemeinde Buttenwiesen|Finanzamt|GEZ|Rundfunk/i, 'Steuern & Abgaben'],
  [/Teilzahlung Darlehen|Darlehen/i, 'Kredit & Darlehen'],
  [/Haushaltsgeld|Haushaltskonto/i, 'Haushalt'],
  [/AMAZON|EBAY|ZALANDO|OTTO|TEMU|SHEIN/i, 'Online Shopping'],
  [/TANKSTELLE|ARAL|SHELL|BP|ESSO|JET |TOTAL/i, 'Kraftstoff & Tanken'],
  [/BAHN|DB Vertrieb|FLIXBUS|MVV|ÖPNV|Nahverkehr/i, 'ÖPNV & Nahverkehr'],
  [/FLUG|LUFTHANSA|TAXI|UBER|BOOKING|AIRBNB|Hotel/i, 'Reisen & Urlaub'],
  [/Kontoführung|Abschluss/i, 'Bankgebühren'],
  [/Aufrundkonto|Aufrundung|Sparrate|Sparen\s|Depot|ETF/i, 'Sparen & Anlage'],
  [/LIEFERANDO|PIZZA|MCDONALDS|BURGER KING|SUBWAY|STARBUCKS|RESTAURANT|IMBISS/i, 'Restaurant & Lieferdienst'],
  [/SPOTIFY|NETFLIX|DISNEY|APPLE\.COM|GOOGLE \*|DAZN|YOUTUBE/i, 'Abonnements & Streaming'],
  [/PAYPAL/i, 'Online Shopping'],
  [/Miete|Kaltmiete|Warmmiete|Mietvertrag/i, 'Wohnen & Miete'],
  [/GEHALT|LOHN|Bezüge|Entgelt/i, 'Gehalt & Lohn'],
  [/Geldautomat|Abhebung|ATM/i, 'Bargeldabhebung'],
  [/Umbuchung|Übertrag|Eigenübertrag/i, 'Umbuchung & Übertrag'],
  [/TÜV|ADAC|Werkstatt|KFZ|Reparatur Auto/i, 'Auto & Werkstatt'],
  [/FITNESSSTUDIO|GYM|MCFIT|FITX|Sportverein/i, 'Sport & Fitness'],
  [/KINO|THEATER|KONZERT|EVENTIM|TICKETMASTER/i, 'Freizeit & Unterhaltung'],
  [/H&M|ZARA|C&A|PRIMARK|DEICHMANN|SCHUH/i, 'Kleidung & Schuhe'],
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

export function extractCounterpartyIban(text: string): string | null {
  const m = text.match(/IBAN:\s*([A-Z]{2}\d{2}[\d\s]{8,30})/);
  if (!m) return null;
  const iban = m[1].replace(/\s/g, '');
  return iban.length >= 15 && iban.length <= 34 ? iban : null;
}


export function computeHash(parts: string[]): string {
  return crypto.createHash('md5').update(parts.join('|')).digest('hex');
}
