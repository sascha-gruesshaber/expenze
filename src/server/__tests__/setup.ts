// Set DATABASE_URL before anything else imports prisma
process.env.DATABASE_URL = 'file:./prisma/test.db';

import { vi } from 'vitest';

// Mock auth middleware — passthrough that attaches a fixed test user
vi.mock('../authMiddleware.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    _req.userId = 'test-user-id';
    _req.userEmail = 'test@example.com';
    _req.userName = 'Test User';
    next();
  },
}));

// Mock chat router — empty router to avoid AI dependencies
vi.mock('../chat.js', async () => {
  const { Router } = await import('express');
  return { chatRouter: Router() };
});
