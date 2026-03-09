import { prisma } from '../prisma.js';
import type { BankParser, BankTemplateConfig } from './types.js';
import { BUILTIN_TEMPLATES } from './builtin-templates.js';
import { parseWithTemplate } from './template-parser.js';
import { parseMT940, detectMT940 } from './mt940-parser.js';
import { parseCAMT052, detectCAMT052 } from './camt052-parser.js';

interface LoadedTemplate {
  id: string;
  name: string;
  format?: string;
  config: BankTemplateConfig;
}

let templateCache: LoadedTemplate[] | null = null;

/**
 * Upsert builtin templates into the database.
 */
export async function ensureBuiltinTemplates(): Promise<void> {
  for (const t of BUILTIN_TEMPLATES) {
    await prisma.bankTemplate.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        config: JSON.stringify({ ...t.config, _format: t.format || 'csv' }),
        is_builtin: true,
        updated_at: new Date().toISOString(),
      },
      create: {
        id: t.id,
        name: t.name,
        config: JSON.stringify({ ...t.config, _format: t.format || 'csv' }),
        is_builtin: true,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }
}

/**
 * Load all enabled templates from DB, parse JSON configs, cache in memory.
 */
async function loadTemplates(): Promise<LoadedTemplate[]> {
  if (templateCache) return templateCache;

  await ensureBuiltinTemplates();

  const rows = await prisma.bankTemplate.findMany({ where: { enabled: true } });
  templateCache = rows.map(row => {
    const parsed = JSON.parse(row.config);
    const format = parsed._format || 'csv';
    return { id: row.id, name: row.name, format, config: parsed as BankTemplateConfig };
  });
  return templateCache;
}

/**
 * Invalidate the in-memory cache (call after CRUD operations).
 */
export function invalidateTemplateCache(): void {
  templateCache = null;
}

/**
 * Detect parser by checking content format.
 * Supports CSV templates, MT940, and CAMT.052.
 */
export async function detectAllParsers(text: string): Promise<{ id: string; name: string; parser: BankParser }[]> {
  const templates = await loadTemplates();
  const matches: { id: string; name: string; parser: BankParser }[] = [];

  // Check MT940 format first
  if (detectMT940(text)) {
    for (const t of templates) {
      if (t.format === 'mt940') {
        matches.push({
          id: t.id,
          name: t.name,
          parser: {
            bankId: t.id,
            bankName: t.name,
            detect: () => true,
            parse: (content: string, filename: string) => parseMT940(content, filename),
          },
        });
      }
    }
    if (matches.length > 0) return matches;
  }

  // Check CAMT.052 XML format
  if (detectCAMT052(text)) {
    for (const t of templates) {
      if (t.format === 'camt052') {
        matches.push({
          id: t.id,
          name: t.name,
          parser: {
            bankId: t.id,
            bankName: t.name,
            detect: () => true,
            parse: (content: string, filename: string) => parseCAMT052(content, filename),
          },
        });
      }
    }
    if (matches.length > 0) return matches;
  }

  // CSV templates: match by first-line header
  const firstLine = text.split(/\r?\n/, 1)[0];
  for (const t of templates) {
    if (t.format && t.format !== 'csv') continue;
    if (firstLine.startsWith(t.config.detection.headerStartsWith)) {
      matches.push({
        id: t.id,
        name: t.name,
        parser: {
          bankId: t.id,
          bankName: t.name,
          detect: () => true,
          parse: (csv: string, filename: string) =>
            parseWithTemplate(t.config, t.name, csv, filename),
        },
      });
    }
  }
  return matches;
}

/**
 * Get a parser for a specific template ID.
 */
export async function getParserByTemplateId(text: string, templateId: string): Promise<BankParser | null> {
  const templates = await loadTemplates();
  const t = templates.find(tmpl => tmpl.id === templateId);
  if (!t) return null;

  if (t.format === 'mt940') {
    return {
      bankId: t.id,
      bankName: t.name,
      detect: () => true,
      parse: (content: string, filename: string) => parseMT940(content, filename),
    };
  }
  if (t.format === 'camt052') {
    return {
      bankId: t.id,
      bankName: t.name,
      detect: () => true,
      parse: (content: string, filename: string) => parseCAMT052(content, filename),
    };
  }
  // CSV
  return {
    bankId: t.id,
    bankName: t.name,
    detect: () => true,
    parse: (csv: string, filename: string) =>
      parseWithTemplate(t.config, t.name, csv, filename),
  };
}

/**
 * Detect parser by checking content format.
 * Supports CSV templates, MT940, and CAMT.052.
 */
export async function detectParser(text: string): Promise<BankParser | null> {
  const templates = await loadTemplates();

  // Check MT940 format first (before CSV, since MT940 has distinct markers)
  if (detectMT940(text)) {
    const mt940Template = templates.find(t => t.format === 'mt940');
    if (mt940Template) {
      return {
        bankId: mt940Template.id,
        bankName: mt940Template.name,
        detect: () => true,
        parse: (content: string, filename: string) => parseMT940(content, filename),
      };
    }
  }

  // Check CAMT.052 XML format
  if (detectCAMT052(text)) {
    const camtTemplate = templates.find(t => t.format === 'camt052');
    if (camtTemplate) {
      return {
        bankId: camtTemplate.id,
        bankName: camtTemplate.name,
        detect: () => true,
        parse: (content: string, filename: string) => parseCAMT052(content, filename),
      };
    }
  }

  // CSV templates: match by first-line header
  const firstLine = text.split(/\r?\n/, 1)[0];
  for (const t of templates) {
    if (t.format && t.format !== 'csv') continue;
    if (firstLine.startsWith(t.config.detection.headerStartsWith)) {
      return {
        bankId: t.id,
        bankName: t.name,
        detect: () => true,
        parse: (csv: string, filename: string) =>
          parseWithTemplate(t.config, t.name, csv, filename),
      };
    }
  }
  return null;
}
