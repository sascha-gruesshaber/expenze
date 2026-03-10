import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import routes from './routes.js';
import { prisma } from './prisma.js';
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from './defaultRules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = isDev ? 3001 : (process.env.PORT || 3000);

// CORS with credentials for auth cookies
app.use(cors({
  origin: isDev ? 'http://localhost:5173' : true,
  credentials: true,
}));

// Better Auth handler — must come BEFORE express.json()
app.all('/api/auth/{*splat}', toNodeHandler(auth));

app.use(express.json({ limit: '20mb' }));
app.use('/api', routes);

if (!isDev) {
  const clientDist = path.join(__dirname, '..', '..', 'dist', 'client');
  app.use(express.static(clientDist));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── Data migration: assign orphaned records + seed new users ────────
async function migrateOrphanedData() {
  try {
    const users = await prisma.user.findMany();
    if (users.length === 0) return;

    // If exactly one user exists and orphaned records found, assign to that user
    if (users.length === 1) {
      const userId = users[0].id;
      const orphanedAccounts = await prisma.bankAccount.count({ where: { userId: null } });
      if (orphanedAccounts > 0) {
        console.log(`  Migrating orphaned data to user ${users[0].email}...`);
        await prisma.bankAccount.updateMany({ where: { userId: null }, data: { userId } });
        await prisma.category.updateMany({ where: { userId: null }, data: { userId } });
        await prisma.categoryRule.updateMany({ where: { userId: null }, data: { userId } });
        await prisma.bankTemplate.updateMany({ where: { userId: null, is_builtin: false }, data: { userId } });
        await prisma.setting.updateMany({ where: { userId: null }, data: { userId } });
        await prisma.importLog.updateMany({ where: { userId: null }, data: { userId } });
        console.log(`  Migration complete.`);
      }
    }

    // Clone default categories + rules for users who have none
    for (const user of users) {
      const catCount = await prisma.category.count({ where: { userId: user.id } });
      if (catCount === 0) {
        console.log(`  Seeding default categories for ${user.email}...`);
        for (const cat of DEFAULT_CATEGORIES) {
          await prisma.category.create({
            data: { name: cat.name, is_default: true, category_type: cat.type, userId: user.id, created_at: new Date().toISOString() },
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
              userId: user.id,
              created_at: new Date().toISOString(),
            },
          });
        }
      } else {
        // Backfill new default categories and rules for existing users
        const existingCats = await prisma.category.findMany({ where: { userId: user.id }, select: { name: true } });
        const existingNames = new Set(existingCats.map(c => c.name));
        const newCats = DEFAULT_CATEGORIES.filter(c => !existingNames.has(c.name));
        if (newCats.length > 0) {
          console.log(`  Adding ${newCats.length} new default categories for ${user.email}...`);
          for (const cat of newCats) {
            await prisma.category.create({
              data: { name: cat.name, is_default: true, category_type: cat.type, userId: user.id, created_at: new Date().toISOString() },
            });
          }
        }

        // Sync category_type for existing default categories
        const typeMap = new Map(DEFAULT_CATEGORIES.map(c => [c.name, c.type]));
        for (const [name, type] of typeMap) {
          if (type !== 'default') {
            await prisma.category.updateMany({
              where: { name, userId: user.id, category_type: 'default' },
              data: { category_type: type },
            });
          }
        }

        const existingRules = await prisma.categoryRule.findMany({ where: { userId: user.id, is_default: true }, select: { category: true } });
        const existingRuleCats = new Set(existingRules.map(r => r.category));
        const newRules = DEFAULT_RULES.filter(r => !existingRuleCats.has(r.category));
        const maxPriority = await prisma.categoryRule.aggregate({ where: { userId: user.id }, _max: { priority: true } });
        let nextPriority = (maxPriority._max.priority || 0) + 10;
        if (newRules.length > 0) {
          console.log(`  Adding ${newRules.length} new default rules for ${user.email}...`);
          for (const rule of newRules) {
            await prisma.categoryRule.create({
              data: {
                category: rule.category,
                pattern: rule.pattern,
                match_field: 'description',
                match_type: 'regex',
                priority: nextPriority,
                is_default: true,
                userId: user.id,
                created_at: new Date().toISOString(),
              },
            });
            nextPriority += 10;
          }
        }
      }
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
}

app.listen(PORT, () => {
  console.log(`\n  expenze running at http://localhost:${PORT}\n`);
  migrateOrphanedData();
});
