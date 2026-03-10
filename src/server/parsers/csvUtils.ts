/**
 * Shared CSV utilities for all bank CSV parsers.
 */

/** Count occurrences of a character in a string */
function countChar(str: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < str.length; i++) if (str[i] === ch) n++;
  return n;
}

/** Detect delimiter by counting `;` vs `,` in the header line */
export function detectDelimiter(headerLine: string): string {
  return countChar(headerLine, ';') >= countChar(headerLine, ',') ? ';' : ',';
}

/**
 * Minimal RFC 4180 CSV parser that handles quoted fields.
 * Returns array of rows, each row an array of field strings.
 */
export function parseCSVRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    const row: string[] = [];
    while (i < len) {
      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = '';
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
        row.push(field);
        // Skip delimiter or line ending
        if (i < len && text[i] === delimiter) {
          i++;
        } else if (i < len && text[i] === '\r') {
          i++;
          if (i < len && text[i] === '\n') i++;
          break;
        } else if (i < len && text[i] === '\n') {
          i++;
          break;
        }
      } else {
        // Unquoted field
        let field = '';
        while (i < len && text[i] !== delimiter && text[i] !== '\r' && text[i] !== '\n') {
          field += text[i];
          i++;
        }
        row.push(field);
        if (i < len && text[i] === delimiter) {
          i++;
        } else {
          if (i < len && text[i] === '\r') i++;
          if (i < len && text[i] === '\n') i++;
          break;
        }
      }
    }
    // Skip empty trailing rows
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }
  return rows;
}

/** Parse DD.MM.YYYY → YYYY-MM-DD */
export function parseCsvDate(dateStr: string): string | null {
  const m = dateStr.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Parse German-format amount string → { amount, direction }.
 * Handles: "-77,76 €", "77,76 €", "-14,16", "1.234,56", etc.
 */
export function parseCsvAmount(amountStr: string): { amount: number; direction: 'credit' | 'debit' } {
  const cleaned = amountStr.replace(/€/g, '').replace(/\s/g, '').trim();
  const negative = cleaned.startsWith('-');
  const abs = cleaned.replace(/^[+-]/, '').replace(/\./g, '').replace(',', '.');
  const amount = parseFloat(abs);
  return { amount, direction: negative ? 'debit' : 'credit' };
}

/**
 * Decode a Buffer to string, handling BOM and encoding.
 * Tries UTF-8 first, falls back to Latin-1 if replacement chars found.
 */
export function decodeBuffer(buffer: Buffer): string {
  let text = buffer.toString('utf-8');
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  // If UTF-8 decoding produced replacement characters, try Latin-1
  if (text.includes('\uFFFD')) {
    text = buffer.toString('latin1');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  }
  return text;
}
