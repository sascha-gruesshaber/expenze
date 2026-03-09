import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }
    (req as any).userId = session.user.id;
    (req as any).userEmail = session.user.email;
    (req as any).userName = session.user.name;
    next();
  } catch {
    res.status(401).json({ error: 'Nicht authentifiziert' });
  }
}
