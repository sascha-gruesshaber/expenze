import { PrismaClient } from '@prisma/client';
import { DEFAULT_RULES, DEFAULT_CATEGORIES } from '../src/server/defaultRules.js';

const prisma = new PrismaClient();

// Old → New category name mapping for data migration
const CATEGORY_RENAMES: Record<string, string> = {
  'Lebensmittel & Einkauf': 'Lebensmittel',
  'Versicherung': 'Versicherungen',
  'Gesundheit': 'Gesundheit & Apotheke',
  'Haushalt': 'Haushalt & Reinigung',
  'Kraftstoff': 'Kraftstoff & Tanken',
  'Reise & Verkehr': 'Reisen & Urlaub',
  'Sparen': 'Sparen & Anlage',
  'Haushalt & Reinigung': 'Haushalt',
};

async function main() {
  // ── Seed categories ──────────────────────────────────────────
  const existingCategories = await prisma.category.count();
  if (existingCategories === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await prisma.category.create({
        data: {
          name: cat.name,
          is_default: true,
          category_type: cat.type,
          created_at: new Date().toISOString(),
        },
      });
    }
    console.log(`Seeded ${DEFAULT_CATEGORIES.length} default categories`);
  } else {
    // Ensure category_type is set for existing categories
    const typeMap = new Map(DEFAULT_CATEGORIES.map(c => [c.name, c.type]));
    for (const [name, type] of typeMap) {
      if (type !== 'default') {
        await prisma.category.updateMany({
          where: { name, category_type: 'default' },
          data: { category_type: type },
        });
      }
    }
    console.log(`Updated category types for ${existingCategories} existing categories`);
  }

  // ── Migrate renamed categories in categories table, transactions & rules ──
  for (const [oldName, newName] of Object.entries(CATEGORY_RENAMES)) {
    // Rename in categories table (skip if new name already exists)
    const oldCat = await prisma.category.findUnique({ where: { name: oldName } });
    const newCatExists = await prisma.category.findUnique({ where: { name: newName } });
    if (oldCat && !newCatExists) {
      await prisma.category.update({ where: { id: oldCat.id }, data: { name: newName } });
    } else if (oldCat && newCatExists) {
      await prisma.category.delete({ where: { id: oldCat.id } });
    }

    const txUpdated = await prisma.$executeRawUnsafe(
      'UPDATE transactions SET category = ? WHERE category = ?',
      newName, oldName
    );
    const ruleUpdated = await prisma.$executeRawUnsafe(
      'UPDATE category_rules SET category = ? WHERE category = ?',
      newName, oldName
    );
    if (txUpdated > 0 || ruleUpdated > 0 || oldCat) {
      console.log(`Renamed "${oldName}" → "${newName}": ${txUpdated} transactions, ${ruleUpdated} rules`);
    }
  }

  // ── Import custom categories from existing transactions ──────
  const distinctCats: Array<{ category: string }> = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL`
  );
  for (const row of distinctCats) {
    if (!row.category) continue;
    const exists = await prisma.category.findUnique({ where: { name: row.category } });
    if (!exists) {
      await prisma.category.create({
        data: {
          name: row.category,
          is_default: false,
          created_at: new Date().toISOString(),
        },
      });
      console.log(`Imported custom category: "${row.category}"`);
    }
  }

  // ── Seed default rules ───────────────────────────────────────
  const existingRules = await prisma.categoryRule.count();
  if (existingRules > 0) {
    console.log(`Skipping rule seed: ${existingRules} rules already exist`);
    return;
  }

  for (let i = 0; i < DEFAULT_RULES.length; i++) {
    const rule = DEFAULT_RULES[i];
    await prisma.categoryRule.create({
      data: {
        category: rule.category,
        pattern: rule.pattern,
        match_field: 'description',
        match_type: 'regex',
        priority: (i + 1) * 10,
        is_default: true,
        created_at: new Date().toISOString(),
      },
    });
  }
  console.log(`Seeded ${DEFAULT_RULES.length} default category rules`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
