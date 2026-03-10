import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import routes from './routes.js';
import { prisma } from './prisma.js';
import { seedDefaultCategoriesForUser } from './seedCategories.js';

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

    // Seed/backfill default categories + rules for all users
    for (const user of users) {
      await seedDefaultCategoriesForUser(user.id, user.email);
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
}

app.listen(PORT, () => {
  console.log(`\n  expenze running at http://localhost:${PORT}\n`);
  migrateOrphanedData();
});
