import type { ParsedTransaction } from './types.js';
import { categorize, computeHash } from './types.js';

/**
 * CAMT.052 (ISO 20022) parser — generic for all banks.
 * Handles .xml files with camt.052 namespace.
 */

// ── Simple XML helper (no dependency needed) ──────────────────────

function getTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function getAllTags(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

/** Find all top-level occurrences of an exact tag (handles same-tag nesting) */
function getAllBlocks(xml: string, tag: string): string[] {
  const results: string[] = [];
  const openRe = new RegExp(`<${tag}[\\s>]`, 'g');
  const closeTag = `</${tag}>`;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(xml)) !== null) {
    const start = m.index;
    // Find matching close tag counting nested opens
    let depth = 1;
    let searchPos = start + m[0].length;
    const nestedRe = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
    nestedRe.lastIndex = searchPos;
    let nm: RegExpExecArray | null;
    let end = -1;
    while ((nm = nestedRe.exec(xml)) !== null) {
      if (nm[0].startsWith('</')) {
        depth--;
        if (depth === 0) {
          end = nm.index + closeTag.length;
          break;
        }
      } else {
        depth++;
      }
    }
    if (end === -1) break;
    results.push(xml.substring(start, end));
    openRe.lastIndex = end;
  }
  return results;
}

function getAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

// ── CAMT.052 parsing ──────────────────────────────────────────────

interface CamtAccount {
  iban: string;
  currency: string;
  ownerName: string;
  bankBic: string;
  bankName: string;
}

function parseAccount(rptXml: string): CamtAccount {
  const acctBlock = getTag(rptXml, 'Acct');
  return {
    iban: getTag(acctBlock, 'IBAN'),
    currency: getTag(acctBlock, 'Ccy'),
    ownerName: getTag(acctBlock, 'Nm'),
    bankBic: getTag(getTag(acctBlock, 'Svcr'), 'BICFI'),
    bankName: getTag(getTag(acctBlock, 'Svcr'), 'Nm'),
  };
}

function parseEntry(ntryXml: string, account: CamtAccount): ParsedTransaction | null {
  const amount = parseFloat(getTag(ntryXml, 'Amt').replace(',', '.'));
  if (isNaN(amount)) return null;

  const currency = getAttr(ntryXml, 'Amt', 'Ccy') || account.currency || 'EUR';
  const cdtDbt = getTag(ntryXml, 'CdtDbtInd');
  const direction: 'credit' | 'debit' = cdtDbt === 'CRDT' ? 'credit' : 'debit';

  const bookDate = getTag(getTag(ntryXml, 'BookgDt'), 'Dt');
  const valDate = getTag(getTag(ntryXml, 'ValDt'), 'Dt');
  const addtlInfo = getTag(ntryXml, 'AddtlNtryInf');

  // Transaction details
  const txDtls = getTag(ntryXml, 'TxDtls');
  const rltdPties = getTag(txDtls, 'RltdPties');

  // Counterparty: for debits the creditor is the counterparty, for credits the debtor
  let counterparty = '';
  let counterpartyIban = '';
  let counterpartyBic = '';

  if (direction === 'debit') {
    // We're paying → creditor is counterparty
    const cdtr = getTag(rltdPties, 'Cdtr');
    counterparty = getTag(cdtr, 'Nm');
    counterpartyIban = getTag(getTag(rltdPties, 'CdtrAcct'), 'IBAN');
    const cdtrAgt = getTag(getTag(txDtls, 'RltdAgts'), 'CdtrAgt');
    counterpartyBic = getTag(cdtrAgt, 'BICFI');
    // Fallback: UltmtCdtr
    if (!counterparty) {
      counterparty = getTag(getTag(rltdPties, 'UltmtCdtr'), 'Nm');
    }
  } else {
    // We're receiving → debtor is counterparty
    const dbtr = getTag(rltdPties, 'Dbtr');
    counterparty = getTag(dbtr, 'Nm');
    counterpartyIban = getTag(getTag(rltdPties, 'DbtrAcct'), 'IBAN');
    const dbtrAgt = getTag(getTag(txDtls, 'RltdAgts'), 'DbtrAgt');
    counterpartyBic = getTag(dbtrAgt, 'BICFI');
    // Fallback: UltmtDbtr
    if (!counterparty) {
      counterparty = getTag(getTag(rltdPties, 'UltmtDbtr'), 'Nm');
    }
  }

  // Filter out account holder names used as counterparty (own account info)
  if (counterparty.startsWith('/CDGM/') || counterparty === 'ISSUER') {
    counterparty = '';
  }

  // Remittance info (purpose)
  const rmtInf = getTag(txDtls, 'RmtInf');
  const ustrdParts = getAllTags(rmtInf, 'Ustrd');
  const purpose = ustrdParts.join(' ').trim();

  // Creditor ID and mandate reference
  const refs = getTag(txDtls, 'Refs');
  const mandateRef = getTag(refs, 'MndtId') || null;
  // Creditor ID from party identification
  const counterpartyParty = direction === 'debit'
    ? getTag(rltdPties, 'Cdtr')
    : getTag(rltdPties, 'Dbtr');
  const creditorId = getTag(getTag(getTag(counterpartyParty, 'PrvtId'), 'Othr'), 'Id') || null;

  // Type from AddtlNtryInf or proprietary code
  const prtryCd = getTag(getTag(ntryXml, 'Prtry'), 'Cd');
  const type = addtlInfo || mapPrtryCode(prtryCd) || 'Sonstiges';

  // Build description
  const description = [type, purpose]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .substring(0, 400)
    .trim();

  // Fallback counterparty from purpose
  if (!counterparty && purpose) {
    // Try to extract a name from the beginning of purpose text
    const nameMatch = purpose.match(/^([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\s&.,-]+?)(?:\/|\s{2,}|EREF|MREF|KREF|CRED|SVWZ)/);
    if (nameMatch) counterparty = nameMatch[1].trim();
  }

  const category = categorize(description + ' ' + counterparty);

  const accountNumber = account.iban.replace(/^[A-Z]{2}\d{2}/, '').replace(/^0+/, '');

  const hash = computeHash([
    account.iban,
    bookDate,
    String(amount),
    direction,
    counterparty,
    description,
  ]);

  return {
    account_number: accountNumber,
    bu_date: bookDate || null,
    value_date: valDate || null,
    type,
    description,
    counterparty: counterparty.substring(0, 100),
    counterparty_iban: counterpartyIban || null,
    counterparty_bic: counterpartyBic || null,
    purpose: purpose || null,
    currency,
    balance_after: null,
    creditor_id: creditorId,
    mandate_reference: mandateRef,
    original_category: null,
    amount,
    direction,
    category,
    source_file: '',
    hash,
    iban: account.iban,
    bank_name: account.bankName || 'CAMT.052',
  };
}

function mapPrtryCode(code: string): string {
  if (!code) return '';
  // Proprietary codes like "NDDT+105+00931" or "NTRF+166+00931"
  if (code.startsWith('NDDT')) return 'Lastschrift';
  if (code.startsWith('NTRF')) return 'Überweisung';
  if (code.startsWith('NMSC')) return 'Sonstiges';
  return '';
}

export function parseCAMT052(text: string, filename: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];

  // Find all Report blocks
  const rptBlocks = getAllBlocks(text, 'Rpt');
  if (rptBlocks.length === 0) return [];

  for (const rptXml of rptBlocks) {
    const account = parseAccount(rptXml);
    const entryBlocks = getAllBlocks(rptXml, 'Ntry');

    for (const ntryXml of entryBlocks) {
      const tx = parseEntry(ntryXml, account);
      if (tx) {
        tx.source_file = filename;
        transactions.push(tx);
      }
    }
  }

  return transactions;
}

export function detectCAMT052(text: string): boolean {
  return text.includes('camt.052') || text.includes('BkToCstmrAcctRpt');
}
