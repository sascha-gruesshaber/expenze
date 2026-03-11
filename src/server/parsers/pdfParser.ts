import type { ParsedTransaction } from './types.js';

// ── PDF Text Extraction ─────────────────────────────────────────────

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import of pdfjs-dist (ESM, no DOM needed)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str)
      .join(' ');
    if (text.trim()) pages.push(text);
  }

  const fullText = pages.join('\n--- Seitenumbruch ---\n');
  if (!fullText.trim()) {
    throw new Error('PDF enthält keinen extrahierbaren Text. Bitte eine Text-PDF verwenden (kein Scan/Bild).');
  }
  return fullText;
}

// ── AI Prompt ────────────────────────────────────────────────────────

function buildPdfPrompt(pdfText: string, filename: string): string {
  return `Du bist ein Experte für das Lesen von Bankauszügen. Konvertiere den folgenden extrahierten PDF-Text eines Kontoauszugs in ein strukturiertes CSV-Format.

## Ausgabe-Format

Die ERSTEN Zeilen müssen Metadaten sein (falls im Auszug vorhanden):
#ANFANGSSALDO:1.234,56
#ENDSALDO:5.678,90
#KONTONUMMER:850 76354 00
#IBAN:DE12345678901234567890
#BANK:Sparkasse Augsburg

Verwende deutsches Zahlenformat (Punkt als Tausendertrenner, Komma als Dezimaltrenner).
Falls ein Metadaten-Wert nicht erkennbar ist, lasse die jeweilige Zeile weg.

Danach folgt der CSV-Header und die Transaktionen:
Datum;Empfaenger;Betrag;Beschreibung;IBAN;Waehrung;Buchungstext;Wertstellungsdatum;Saldo

## Regeln für die Felder

- **Datum**: Format DD.MM.YYYY (Buchungsdatum)
- **Empfaenger**: Name des Zahlungsempfängers/Auftraggebers
- **Betrag**: Deutsches Zahlenformat mit Komma als Dezimaltrenner. Negativ = Belastung/Ausgabe, Positiv = Gutschrift/Einnahme
- **Beschreibung**: Verwendungszweck oder Buchungsdetails
- **IBAN**: IBAN des Gegenkontos (falls vorhanden, sonst leer)
- **Waehrung**: EUR (oder andere falls angegeben)
- **Buchungstext**: Art der Buchung (z.B. Lastschrift, Überweisung, Gutschrift, Kartenzahlung)
- **Wertstellungsdatum**: Format DD.MM.YYYY (falls vorhanden, sonst gleich wie Datum)
- **Saldo**: Saldo nach Buchung im deutschen Zahlenformat (falls vorhanden, sonst leer)

## Wichtige Hinweise

- Gib NUR die Metadaten-Zeilen und das CSV aus, KEIN Markdown, KEINE Erklärungen
- Jede Transaktion = eine Zeile
- Trennzeichen ist Semikolon (;)
- Prüfe dein Ergebnis: Die Summe aller Beträge addiert zum Anfangssaldo muss dem Endsaldo entsprechen
- Falls ein Feld leer ist, lasse es leer (zwei Semikolons hintereinander)
- Interpretiere den Auszug sorgfältig — achte auf Soll/Haben, +/- Vorzeichen

## Dateiname
${filename}

## Extrahierter PDF-Text
${pdfText}`;
}

// ── AI Conversion ────────────────────────────────────────────────────

const EXPECTED_HEADER = 'Datum;Empfaenger;Betrag;Beschreibung;IBAN;Waehrung;Buchungstext;Wertstellungsdatum;Saldo';

function parseGermanNumber(str: string): number {
  // "1.234,56" → 1234.56 / "-45,99" → -45.99
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned);
}

export interface PdfConversionResult {
  csv: string;
  startBalance?: number;
  endBalance?: number;
  accountNumber?: string;
  iban?: string;
  bankName?: string;
}

export async function convertPdfToCsv(
  pdfText: string,
  filename: string,
  callAi: (prompt: string) => Promise<string>,
): Promise<PdfConversionResult> {
  const MAX_CHUNK_SIZE = 15000;

  if (pdfText.length <= MAX_CHUNK_SIZE) {
    return convertSingleChunk(pdfText, filename, callAi);
  }

  // Split by page separators for large PDFs
  const pages = pdfText.split('\n--- Seitenumbruch ---\n');
  const chunks: string[] = [];
  let current = '';

  for (const page of pages) {
    if (current.length + page.length > MAX_CHUNK_SIZE && current.length > 0) {
      chunks.push(current);
      current = page;
    } else {
      current += (current ? '\n--- Seitenumbruch ---\n' : '') + page;
    }
  }
  if (current) chunks.push(current);

  let allCsvLines: string[] = [];
  let startBalance: number | undefined;
  let endBalance: number | undefined;
  let accountNumber: string | undefined;
  let iban: string | undefined;
  let bankName: string | undefined;

  for (let i = 0; i < chunks.length; i++) {
    const result = await convertSingleChunk(chunks[i], `${filename} (Teil ${i + 1}/${chunks.length})`, callAi);
    const lines = result.csv.split(/\r?\n/).filter(l => l.trim());

    // Skip header on subsequent chunks
    const dataLines = i === 0 ? lines : lines.filter(l => l !== EXPECTED_HEADER);
    allCsvLines.push(...dataLines);

    // Use first chunk's start balance, last chunk's end balance
    if (i === 0) {
      if (result.startBalance !== undefined) startBalance = result.startBalance;
      if (result.accountNumber) accountNumber = result.accountNumber;
      if (result.iban) iban = result.iban;
      if (result.bankName) bankName = result.bankName;
    }
    if (result.endBalance !== undefined) endBalance = result.endBalance;
  }

  return { csv: allCsvLines.join('\n'), startBalance, endBalance, accountNumber, iban, bankName };
}

async function convertSingleChunk(
  pdfText: string,
  filename: string,
  callAi: (prompt: string) => Promise<string>,
): Promise<PdfConversionResult> {
  const prompt = buildPdfPrompt(pdfText, filename);
  let response = await callAi(prompt);

  // Strip markdown code fences if present
  response = response.replace(/^```(?:csv)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '');

  const lines = response.split(/\r?\n/);
  let startBalance: number | undefined;
  let endBalance: number | undefined;
  let accountNumber: string | undefined;
  let iban: string | undefined;
  let bankName: string | undefined;
  const csvLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#ANFANGSSALDO:')) {
      startBalance = parseGermanNumber(trimmed.slice('#ANFANGSSALDO:'.length));
    } else if (trimmed.startsWith('#ENDSALDO:')) {
      endBalance = parseGermanNumber(trimmed.slice('#ENDSALDO:'.length));
    } else if (trimmed.startsWith('#KONTONUMMER:')) {
      accountNumber = trimmed.slice('#KONTONUMMER:'.length).trim();
    } else if (trimmed.startsWith('#IBAN:')) {
      iban = trimmed.slice('#IBAN:'.length).trim();
    } else if (trimmed.startsWith('#BANK:')) {
      bankName = trimmed.slice('#BANK:'.length).trim();
    } else {
      csvLines.push(trimmed);
    }
  }

  // Validate header presence
  if (csvLines.length === 0 || !csvLines[0].startsWith('Datum;Empfaenger;Betrag')) {
    throw new Error('KI konnte keine Transaktionen aus der PDF extrahieren. Bitte manuell als CSV importieren.');
  }

  // Must have at least header + 1 data row
  if (csvLines.length < 2) {
    throw new Error('Keine Transaktionen in der PDF erkannt.');
  }

  return { csv: csvLines.join('\n'), startBalance, endBalance, accountNumber, iban, bankName };
}

// ── Saldo Validation ─────────────────────────────────────────────────

export function validateSaldo(
  startBalance: number | undefined,
  endBalance: number | undefined,
  transactions: ParsedTransaction[],
): { valid: boolean; message?: string } {
  if (startBalance === undefined || endBalance === undefined) {
    return { valid: true };
  }
  if (isNaN(startBalance) || isNaN(endBalance)) {
    return { valid: true };
  }

  const sum = transactions.reduce((acc, tx) => acc + (tx.direction === 'debit' ? -tx.amount : tx.amount), 0);
  const calculated = startBalance + sum;
  const diff = Math.abs(calculated - endBalance);

  if (diff > 0.01) {
    return {
      valid: false,
      message: `Saldo-Abweichung: erwartet ${endBalance.toFixed(2)}, berechnet ${calculated.toFixed(2)} (Differenz: ${diff.toFixed(2)})`,
    };
  }
  return { valid: true };
}
