import { detectParser } from './parsers/registry.js';
import type { ParsedTransaction } from './parsers/types.js';

export type { ParsedTransaction };

export interface ParseResult {
  transactions: ParsedTransaction[];
  rawText: string;
  detectedBank: string;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ') + '\n';
  }
  return text;
}

export async function parsePdf(buffer: Buffer, filename: string): Promise<ParseResult> {
  const rawText = await extractPdfText(buffer);
  const parser = detectParser(rawText);
  if (!parser) {
    throw new Error('Unbekanntes Bankformat – PDF konnte keinem Parser zugeordnet werden.');
  }
  const transactions = parser.parse(rawText, filename);
  return { transactions, rawText, detectedBank: parser.bankName };
}
