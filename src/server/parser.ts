import { detectParser, detectAllParsers, getParserByTemplateId } from './parsers/registry.js';
import { decodeBuffer } from './parsers/csv-utils.js';
import type { ParsedTransaction } from './parsers/types.js';

export type { ParsedTransaction };

export interface ParseResult {
  transactions: ParsedTransaction[];
  rawText: string;
  detectedBank: string;
}

const SUPPORTED_EXTENSIONS = new Set(['csv', 'mta', 'sta', 'xml']);

export async function parseFile(buffer: Buffer, filename: string, templateId?: string): Promise<ParseResult> {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error('Nicht unterstütztes Dateiformat. Unterstützt: CSV, MTA, STA, XML (CAMT.052).');
  }
  const rawText = decodeBuffer(buffer);
  const parser = templateId
    ? await getParserByTemplateId(rawText, templateId)
    : await detectParser(rawText);
  if (!parser) {
    throw new Error('Unbekanntes Dateiformat – Datei konnte keinem Parser zugeordnet werden.');
  }
  const transactions = parser.parse(rawText, filename);
  return { transactions, rawText, detectedBank: parser.bankName };
}

export async function detectTemplates(buffer: Buffer, filename: string): Promise<{ id: string; name: string }[]> {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (!SUPPORTED_EXTENSIONS.has(ext)) return [];
  const rawText = decodeBuffer(buffer);
  const matches = await detectAllParsers(rawText);
  return matches.map(m => ({ id: m.id, name: m.name }));
}
