import type { BankTemplateConfig } from './types.js';

export interface BuiltinTemplate {
  id: string;
  name: string;
  /** 'csv' (default) | 'mt940' | 'camt052' — determines the parser used */
  format?: 'csv' | 'mt940' | 'camt052';
  config: BankTemplateConfig;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'csv-c24',
    name: 'C24',
    config: {
      detection: { headerStartsWith: 'Transaktionstyp' },
      csv: { delimiter: 'auto', minColumnsPerRow: 5 },
      columns: {
        account_number: { column: 'Kontonummer' },
        bu_date: { column: 'Buchungsdatum' },
        type: { column: 'Transaktionstyp' },
        counterparty: { column: 'Zahlungsempfänger' },
        counterparty_iban: { column: 'IBAN' },
        counterparty_bic: { column: 'BIC' },
        purpose: { column: 'Verwendungszweck' },
        amount: { column: 'Betrag' },
        currency: { column: '', defaultValue: 'EUR' },
        original_category: {
          column: '',
          joinColumns: ['Kategorie', 'Unterkategorie'],
          joinSeparator: ' / ',
        },
      },
      descriptionTemplate: '{type} {purpose} {_col:Beschreibung}',
      hashFields: ['account_number', 'bu_date', 'amount', 'direction', 'counterparty', 'description'],
    },
  },
  {
    id: 'csv-volksbank',
    name: 'Volksbank',
    config: {
      detection: { headerStartsWith: 'Bezeichnung Auftragskonto' },
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
      fallbacks: [{ field: 'counterparty', when: 'empty', copyFrom: 'type' }],
    },
  },
  {
    id: 'csv-olb',
    name: 'OLB',
    config: {
      detection: { headerStartsWith: 'Inhaberkonto' },
      csv: { delimiter: ';', minColumnsPerRow: 5 },
      columns: {
        iban: { column: 'Inhaberkonto' },
        bu_date: { column: 'Buchungsdatum' },
        value_date: { column: 'Valuta' },
        type: { column: 'Transaktions-Text' },
        counterparty: { column: 'Empf', fallbackIndex: 3 },
        counterparty_iban: { column: 'IBAN' },
        counterparty_bic: { column: 'BIC' },
        purpose: { column: 'Verwendungszweck' },
        amount: { column: 'Betrag' },
        currency: { column: 'W', fallbackIndex: 8 },
      },
      descriptionTemplate: '{type} {purpose}',
      hashFields: ['iban', 'bu_date', 'value_date', 'amount', 'direction', 'counterparty'],
      typeMap: {
        'GUTSCHRIFT': 'Gutschrift',
        'LFD.LASTSCH.': 'Lastschrift',
        'DAUERAUFTRAG': 'Dauerauftrag',
        'UEBERWEISUNG': 'Überweisung',
        'KARTENZAHLUNG': 'Kartenzahlung',
      },
    },
  },
  {
    id: 'mt940',
    name: 'MT940 / SWIFT',
    format: 'mt940',
    config: {
      detection: { headerStartsWith: ':20:' },
      csv: { delimiter: 'auto', minColumnsPerRow: 0 },
      columns: {
        bu_date: { column: '' },
        counterparty: { column: '' },
        amount: { column: '' },
      },
      descriptionTemplate: '{type} {purpose}',
      hashFields: ['bu_date', 'amount', 'direction', 'counterparty', 'description'],
    },
  },
  {
    id: 'camt052',
    name: 'CAMT.052 / ISO 20022',
    format: 'camt052',
    config: {
      detection: { headerStartsWith: '<?xml' },
      csv: { delimiter: 'auto', minColumnsPerRow: 0 },
      columns: {
        bu_date: { column: '' },
        counterparty: { column: '' },
        amount: { column: '' },
      },
      descriptionTemplate: '{type} {purpose}',
      hashFields: ['bu_date', 'amount', 'direction', 'counterparty', 'description'],
    },
  },
];
