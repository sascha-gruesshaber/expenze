import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createTestApp, api, cleanDatabase, seedAccount, seedTransaction, seedCategory, seedRule } from './helpers.js';
import { prisma } from '../prisma.js';

beforeAll(async () => { await createTestApp(); });
beforeEach(async () => { await cleanDatabase(); });

describe('DELETE /api/account', () => {
  it('deletes all user data and the user account', async () => {
    // Seed some data
    const account = await seedAccount();
    await seedTransaction(account.id);
    await seedCategory('Custom Category');
    await seedRule({ category: 'Custom Category', pattern: 'TEST' });

    // Delete account
    const res = await api().delete('/api/account');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify user is gone
    const user = await prisma.user.findUnique({ where: { id: 'test-user-id' } });
    expect(user).toBeNull();

    // Verify all user data is gone
    const accounts = await prisma.bankAccount.findMany({ where: { userId: 'test-user-id' } });
    expect(accounts).toHaveLength(0);

    const transactions = await prisma.transaction.count();
    expect(transactions).toBe(0);

    const categories = await prisma.category.findMany({ where: { userId: 'test-user-id' } });
    expect(categories).toHaveLength(0);

    const rules = await prisma.categoryRule.findMany({ where: { userId: 'test-user-id' } });
    expect(rules).toHaveLength(0);

    const settings = await prisma.setting.findMany({ where: { userId: 'test-user-id' } });
    expect(settings).toHaveLength(0);

    // Re-create user for other tests
    await prisma.user.create({
      data: {
        id: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });
});
