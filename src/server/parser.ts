import { detectParser, detectAllParsers, getParserByTemplateId } from './parsers/registry.js';
import { decodeBuffer } from './parsers/csvUtils.js';
import { extractPdfText, convertPdfToCsv, validateSaldo } from './parsers/pdfParser.js';
import { callAiForText, generateTemplateConfig, hasApiKeyForUser } from './ai.js';
import { parseWithTemplate } from './parsers/templateParser.js';
import type { ParsedTransaction, BankTemplateConfig } from './parsers/types.js';

export type { ParsedTransaction };

export interface ParseResult {
  transactions: ParsedTransaction[];
  rawText: string;
  detectedBank: string;
  saldoWarning?: string;
  accountInfo?: { accountNumber?: string; iban?: string; bankName?: string };
  generatedConfig?: { config: BankTemplateConfig; bankName: string };
}

const SUPPORTED_EXTENSIONS = new Set(['csv', 'mta', 'sta', 'xml', 'pdf']);

export async function parseFile(buffer: Buffer, filename: string, templateId?: string, userId?: string): Promise<ParseResult> {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error('Nicht unterstütztes Dateiformat. Unterstützt: CSV, MTA, STA, XML (CAMT.052), PDF.');
  }

  // PDF path: extract text → AI convert → parse CSV
  if (ext === 'pdf') {
    if (!userId) {
      throw new Error('OPENROUTER_API_KEY nicht konfiguriert. PDF-Import benötigt KI-Analyse.');
    }
    const pdfText = await extractPdfText(buffer);
    const { csv, startBalance, endBalance, accountNumber, iban, bankName } = await convertPdfToCsv(
      pdfText,
      filename,
      (prompt) => callAiForText(prompt, userId),
    );

    const parser = await getParserByTemplateId(csv, 'pdf-generic');
    if (!parser) {
      throw new Error('KI konnte keine Transaktionen aus der PDF extrahieren. Bitte manuell als CSV importieren.');
    }

    const transactions = parser.parse(csv, filename);
    if (transactions.length === 0) {
      throw new Error('Keine Transaktionen in der PDF erkannt.');
    }

    // Propagate extracted account info to transactions so account resolution works
    if (iban || accountNumber) {
      for (const tx of transactions) {
        if (iban && !tx.iban) tx.iban = iban;
        if (accountNumber && (!tx.account_number || tx.account_number === 'unknown')) tx.account_number = accountNumber;
      }
    }
    if (bankName) {
      for (const tx of transactions) {
        if (!tx.bank_name || tx.bank_name === 'Unbekannt' || tx.bank_name === 'PDF Import (KI)') tx.bank_name = bankName;
      }
    }

    const saldoResult = validateSaldo(startBalance, endBalance, transactions);
    const detectedLabel = bankName ? `PDF Import (KI) — ${bankName}` : 'PDF Import (KI)';
    return {
      transactions,
      rawText: csv,
      detectedBank: detectedLabel,
      saldoWarning: saldoResult.valid ? undefined : saldoResult.message,
      accountInfo: (accountNumber || iban || bankName) ? { accountNumber, iban, bankName } : undefined,
    };
  }

  // Non-PDF path (CSV, MT940, CAMT.052)
  const rawText = decodeBuffer(buffer);
  const parser = templateId
    ? await getParserByTemplateId(rawText, templateId)
    : await detectParser(rawText);

  if (parser) {
    const transactions = parser.parse(rawText, filename);
    return { transactions, rawText, detectedBank: parser.bankName };
  }

  // No built-in parser matched — try AI-generated template for CSV files
  if (ext === 'csv' && userId && await hasApiKeyForUser(userId)) {
    const sample = rawText.split(/\r?\n/).slice(0, 6).join('\n');
    const config = await generateTemplateConfig(sample, userId);

    // Override detection with full first line for reliable re-detection
    const fullFirstLine = rawText.split(/\r?\n/, 1)[0].trim();
    config.detection.headerStartsWith = fullFirstLine;

    // Derive a bank name from the detection header
    const bankName = 'KI-Erkennung';
    const transactions = parseWithTemplate(config, bankName, rawText, filename);
    if (transactions.length === 0) {
      throw new Error('KI konnte keine Transaktionen aus der CSV-Datei extrahieren.');
    }
    return {
      transactions,
      rawText,
      detectedBank: `${bankName} (KI)`,
      generatedConfig: { config, bankName },
    };
  }

  throw new Error('Unbekanntes Dateiformat – Datei konnte keinem Parser zugeordnet werden.');
}

export async function detectTemplates(buffer: Buffer, filename: string): Promise<{ id: string; name: string }[]> {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') {
    return [{ id: 'pdf-generic', name: 'PDF Import (KI)' }];
  }
  if (!SUPPORTED_EXTENSIONS.has(ext)) return [];
  const rawText = decodeBuffer(buffer);
  const matches = await detectAllParsers(rawText);
  return matches.map(m => ({ id: m.id, name: m.name }));
}
