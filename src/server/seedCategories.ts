import { prisma } from './prisma.js';
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from './defaultRules.js';

/**
 * Seed default categories and rules for a user.
 * If the user has no categories, seeds all defaults.
 * If the user already has categories, backfills any new defaults.
 */
export async function seedDefaultCategoriesForUser(userId: string, userEmail?: string) {
  const label = userEmail || userId;
  const catCount = await prisma.category.count({ where: { userId } });

  if (catCount === 0) {
    console.log(`  Seeding default categories for ${label}...`);
    for (const cat of DEFAULT_CATEGORIES) {
      await prisma.category.create({
        data: { name: cat.name, is_default: true, category_type: cat.type, userId, created_at: new Date().toISOString() },
      });
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
          userId,
          created_at: new Date().toISOString(),
        },
      });
    }
  } else {
    // Backfill new default categories for existing users
    const existingCats = await prisma.category.findMany({ where: { userId }, select: { name: true } });
    const existingNames = new Set(existingCats.map(c => c.name));
    const newCats = DEFAULT_CATEGORIES.filter(c => !existingNames.has(c.name));
    if (newCats.length > 0) {
      console.log(`  Adding ${newCats.length} new default categories for ${label}...`);
      for (const cat of newCats) {
        await prisma.category.create({
          data: { name: cat.name, is_default: true, category_type: cat.type, userId, created_at: new Date().toISOString() },
        });
      }
    }

    // Sync category_type for existing default categories
    const typeMap = new Map(DEFAULT_CATEGORIES.map(c => [c.name, c.type]));
    for (const [name, type] of typeMap) {
      if (type !== 'default') {
        await prisma.category.updateMany({
          where: { name, userId, category_type: 'default' },
          data: { category_type: type },
        });
      }
    }

    // Backfill new default rules
    const existingRules = await prisma.categoryRule.findMany({ where: { userId, is_default: true }, select: { category: true } });
    const existingRuleCats = new Set(existingRules.map(r => r.category));
    const newRules = DEFAULT_RULES.filter(r => !existingRuleCats.has(r.category));
    const maxPriority = await prisma.categoryRule.aggregate({ where: { userId }, _max: { priority: true } });
    let nextPriority = (maxPriority._max.priority || 0) + 10;
    if (newRules.length > 0) {
      console.log(`  Adding ${newRules.length} new default rules for ${label}...`);
      for (const rule of newRules) {
        await prisma.categoryRule.create({
          data: {
            category: rule.category,
            pattern: rule.pattern,
            match_field: 'description',
            match_type: 'regex',
            priority: nextPriority,
            is_default: true,
            userId,
            created_at: new Date().toISOString(),
          },
        });
        nextPriority += 10;
      }
    }
  }
}
