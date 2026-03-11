import type { BankTemplateConfig } from './types.js';

export interface BuiltinTemplate {
  id: string;
  name: string;
  /** 'csv' (default) | 'mt940' | 'camt052' | 'pdf' — determines the parser used */
  format?: 'csv' | 'mt940' | 'camt052' | 'pdf';
  config: BankTemplateConfig;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'csv-generic',
    name: 'CSV Import (KI)',
    config: {
      detection: { headerStartsWith: '' },
      csv: { delimiter: 'auto', minColumnsPerRow: 0 },
      columns: {
        bu_date: { column: '' },
        counterparty: { column: '' },
        amount: { column: '' },
      },
      descriptionTemplate: '',
      hashFields: [],
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
  {
    id: 'pdf-generic',
    name: 'PDF Import (KI)',
    format: 'pdf',
    config: {
      detection: { headerStartsWith: 'Datum;Empfaenger;Betrag' },
      csv: { delimiter: ';', minColumnsPerRow: 5 },
      columns: {
        bu_date: { column: 'Datum' },
        counterparty: { column: 'Empfaenger' },
        amount: { column: 'Betrag' },
        purpose: { column: 'Beschreibung' },
        counterparty_iban: { column: 'IBAN' },
        currency: { column: 'Waehrung', defaultValue: 'EUR' },
        type: { column: 'Buchungstext' },
        value_date: { column: 'Wertstellungsdatum' },
        balance_after: { column: 'Saldo' },
      },
      descriptionTemplate: '{type} {purpose}',
      hashFields: ['bu_date', 'amount', 'direction', 'counterparty', 'description'],
    },
  },
];
