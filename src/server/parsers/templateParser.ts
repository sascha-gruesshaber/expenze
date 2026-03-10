import type { BankTemplateConfig, ColumnMapping, ParsedTransaction } from './types.js';
import { categorize, computeHash } from './types.js';
import { detectDelimiter, parseCSVRows, parseCsvDate, parseCsvAmount } from './csvUtils.js';

/**
 * Resolve a ColumnMapping to a raw string value from a CSV row.
 */
function resolveColumn(
  mapping: ColumnMapping | undefined,
  headerIndex: Map<string, number>,
  row: string[],
): string {
  if (!mapping) return '';

  // joinColumns: concatenate multiple columns
  if (mapping.joinColumns && mapping.joinColumns.length > 0) {
    const parts: string[] = [];
    for (const colName of mapping.joinColumns) {
      const idx = headerIndex.get(colName);
      if (idx !== undefined && idx < row.length) {
        const val = row[idx].trim();
        if (val) parts.push(val);
      }
    }
    return parts.join(mapping.joinSeparator || ' ') || mapping.defaultValue || '';
  }

  // Try header name lookup
  if (mapping.column) {
    // Exact match first
    const idx = headerIndex.get(mapping.column);
    if (idx !== undefined && idx < row.length) {
      return row[idx].trim();
    }
    // Partial match (for garbled encoding like "Empf" matching "Empfänger/Auftraggeber")
    if (mapping.column.length >= 3) {
      for (const [name, colIdx] of headerIndex) {
        if (name.startsWith(mapping.column) && colIdx < row.length) {
          return row[colIdx].trim();
        }
      }
    }
  }

  // Fallback by index
  if (mapping.fallbackIndex !== undefined && mapping.fallbackIndex < row.length) {
    return row[mapping.fallbackIndex].trim();
  }

  return mapping.defaultValue || '';
}

/**
 * Parse a CSV text using a BankTemplateConfig and return ParsedTransaction[].
 */
export function parseWithTemplate(
  config: BankTemplateConfig,
  bankName: string,
  text: string,
  filename: string,
): ParsedTransaction[] {
  // Determine delimiter
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = config.csv.delimiter === 'auto'
    ? detectDelimiter(firstLine)
    : config.csv.delimiter;

  const rows = parseCSVRows(text, delimiter);
  if (rows.length < 2) return [];

  // Build header index map
  const header = rows[0];
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < header.length; i++) {
    headerIndex.set(header[i].trim(), i);
  }

  const transactions: ParsedTransaction[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < config.csv.minColumnsPerRow) continue;

    // Resolve all column values
    const cols = config.columns;
    const accountNumber = resolveColumn(cols.account_number, headerIndex, row);
    const iban = resolveColumn(cols.iban, headerIndex, row) || null;
    const bankNameVal = resolveColumn(cols.bank_name, headerIndex, row) || bankName;
    const buDateStr = resolveColumn(cols.bu_date, headerIndex, row);
    const buDate = parseCsvDate(buDateStr);
    if (!buDate) continue;

    const valueDateStr = resolveColumn(cols.value_date, headerIndex, row);
    const valueDate = valueDateStr ? parseCsvDate(valueDateStr) : null;

    let typeRaw = resolveColumn(cols.type, headerIndex, row);
    let counterparty = resolveColumn(cols.counterparty, headerIndex, row).substring(0, 100);
    const counterpartyIban = resolveColumn(cols.counterparty_iban, headerIndex, row) || null;
    const counterpartyBic = resolveColumn(cols.counterparty_bic, headerIndex, row) || null;
    const purpose = resolveColumn(cols.purpose, headerIndex, row);
    const amountStr = resolveColumn(cols.amount, headerIndex, row);
    const { amount, direction } = parseCsvAmount(amountStr);
    const currency = resolveColumn(cols.currency, headerIndex, row) || null;
    const creditorId = resolveColumn(cols.creditor_id, headerIndex, row) || null;
    const mandateReference = resolveColumn(cols.mandate_reference, headerIndex, row) || null;
    const originalCategory = resolveColumn(cols.original_category, headerIndex, row) || null;

    // Apply typeMap
    if (config.typeMap && typeRaw) {
      typeRaw = config.typeMap[typeRaw] || typeRaw;
    }
    const type = typeRaw || 'Sonstiges';

    // Apply fallbacks
    if (config.fallbacks) {
      for (const fb of config.fallbacks) {
        if (fb.when === 'empty') {
          if (fb.field === 'counterparty' && !counterparty) {
            const sourceVal = fb.copyFrom === 'type' ? typeRaw : '';
            if (sourceVal) counterparty = sourceVal;
          }
        }
      }
    }

    // Balance after (signed: negative for debit)
    let balanceAfter: number | null = null;
    const balanceStr = resolveColumn(cols.balance_after, headerIndex, row);
    if (balanceStr) {
      const parsed = parseCsvAmount(balanceStr);
      balanceAfter = parsed.direction === 'debit' ? -parsed.amount : parsed.amount;
    }

    // Interpolate descriptionTemplate
    // {field} = resolved field value, {_col:Name} = raw column access
    const fieldValues: Record<string, string> = {
      account_number: accountNumber,
      iban: iban || '',
      bank_name: bankNameVal,
      bu_date: buDate,
      value_date: valueDate || '',
      type: typeRaw,
      counterparty,
      counterparty_iban: counterpartyIban || '',
      counterparty_bic: counterpartyBic || '',
      purpose,
      amount: String(amount),
      direction,
      currency: currency || '',
      balance_after: balanceAfter !== null ? String(balanceAfter) : '',
      creditor_id: creditorId || '',
      mandate_reference: mandateReference || '',
      original_category: originalCategory || '',
    };

    const description = config.descriptionTemplate
      .replace(/\{_col:([^}]+)\}/g, (_match, colName: string) => {
        const idx = headerIndex.get(colName);
        if (idx !== undefined && idx < row.length) return row[idx].trim();
        return '';
      })
      .replace(/\{(\w+)\}/g, (_match, field: string) => {
        return fieldValues[field] || '';
      })
      .replace(/\s+/g, ' ')
      .substring(0, 400)
      .trim();

    const category = categorize(description + ' ' + counterparty);

    // Hash computation from hashFields
    const hashParts = config.hashFields.map(f => {
      if (f === 'description') return description;
      return fieldValues[f] || '';
    });
    const hash = computeHash(hashParts);

    transactions.push({
      account_number: accountNumber,
      bu_date: buDate,
      value_date: valueDate,
      type,
      description,
      counterparty,
      counterparty_iban: counterpartyIban,
      counterparty_bic: counterpartyBic,
      purpose: purpose || null,
      currency,
      balance_after: balanceAfter,
      creditor_id: creditorId,
      mandate_reference: mandateReference,
      original_category: originalCategory,
      amount,
      direction,
      category,
      source_file: filename,
      hash,
      iban,
      bank_name: bankNameVal,
    });
  }

  return transactions;
}
