import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export type AuthUser = { id: number }

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
    }
  }
}

/**
 * Require Bearer JWT (same JWT_SECRET as kedam-API users).
 * Payload must include numeric `id` (user id).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    res.status(503).json({ error: 'JWT_SECRET is not configured on AI API' })
    return
  }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    res.status(401).json({ error: 'Authorization Bearer token required' })
    return
  }
  try {
    const decoded = jwt.verify(token, secret) as { id?: number | string }
    const id = typeof decoded.id === 'number' ? decoded.id : parseInt(String(decoded.id), 10)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(401).json({ error: 'Invalid token: missing user id' })
      return
    }
    req.authUser = { id }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
