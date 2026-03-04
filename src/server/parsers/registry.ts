import type { BankParser } from './types.js';
import { c24Parser } from './c24.js';
import { volksbankParser } from './volksbank.js';

// Order: more specific first
const parsers: BankParser[] = [c24Parser, volksbankParser];

export function detectParser(text: string): BankParser | null {
  for (const parser of parsers) {
    if (parser.detect(text)) return parser;
  }
  return null;
}
