import type { Request, Response, NextFunction } from 'express'
import type { IncomingMessage } from 'http'
import jwt from 'jsonwebtoken'

/**
 * JWT для сервера Маши (SECURITY_JWT_PLAN_RU.md, волна 4).
 * Тот же JWT_SECRET, что у totus_API: user-токены (scope 'user', legacy без scope),
 * agent (scope 'agent'), staff (scope 'staff').
 *
 * AUTH_MODE=log (по умолчанию) — requireRole пропускает запросы без валидного токена
 * с записью [AUTH] в лог; enforce — 401/403. requireAuth (история чатов) —
 * всегда строгий, как и раньше.
 * AI_GUEST_ACCESS=1 (по умолчанию) — WebSocket /ws/assistant открыт гостям без токена
 * (ai.totus.club не передаёт токен); 0 — только с токеном (log/enforce как выше).
 */

export type AuthUser = { id: number }
export type AuthRole = 'user' | 'agent' | 'staff'
export type AuthPrincipal = { id: number; role: AuthRole; scope: string }

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
      authPrincipal?: AuthPrincipal
    }
  }
}

export function authMode(): 'log' | 'enforce' {
  return process.env.AUTH_MODE === 'enforce' ? 'enforce' : 'log'
}

export function guestAccessAllowed(): boolean {
  return process.env.AI_GUEST_ACCESS !== '0'
}

function roleOf(payload: Record<string, unknown>): AuthRole {
  if (payload.scope === 'staff') return 'staff'
  if (payload.scope === 'agent') return 'agent'
  return String(payload.role ?? '').toLowerCase() === 'agent' ? 'agent' : 'user'
}

/** Проверить access-токен. null — нет секрета, токен битый/просрочен или без числового id. */
export function verifyAccessToken(token: string | null | undefined): AuthPrincipal | null {
  const secret = process.env.JWT_SECRET
  if (!secret || !token) return null
  try {
    const decoded = jwt.verify(token, secret) as Record<string, unknown>
    if (!decoded || typeof decoded !== 'object') return null
    if (decoded.typ === 'refresh') return null
    const raw = decoded.id
    const id = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
    if (!Number.isFinite(id) || id <= 0) return null
    return { id, role: roleOf(decoded), scope: String(decoded.scope ?? 'user') }
  } catch {
    return null
  }
}

function bearerFrom(header: string | undefined): string {
  const h = header || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

// agent — тоже пользователь; staff — отдельная роль
function satisfies(role: AuthRole, allowed: AuthRole[]): boolean {
  if (allowed.includes(role)) return true
  return role === 'agent' && allowed.includes('user')
}

const logState = new Map<string, { count: number; lastAt: number }>()
function logAuth(kind: string, reason: string, path: string, req?: { headers?: Record<string, unknown>; ip?: string }) {
  const key = `${reason} ${kind} ${path}`
  const now = Date.now()
  const st = logState.get(key) ?? { count: 0, lastAt: 0 }
  st.count += 1
  logState.set(key, st)
  if (now - st.lastAt < 60_000) return
  st.lastAt = now
  const origin = String(req?.headers?.origin ?? '-')
  const ua = String(req?.headers?.['user-agent'] ?? '-').slice(0, 80)
  console.warn(
    `[AUTH] mode=${authMode()} reason=${reason} ${kind} ${path} origin=${origin} ip=${req?.ip ?? '-'} ua="${ua}" count=${st.count}`,
  )
}

/**
 * Require Bearer JWT (same JWT_SECRET as kedam-API users) — строгий, без режима log.
 * Payload must include numeric `id` (user id).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    res.status(503).json({ error: 'JWT_SECRET is not configured on AI API' })
    return
  }
  const token = bearerFrom(req.headers.authorization)
  if (!token) {
    res.status(401).json({ error: 'Authorization Bearer token required' })
    return
  }
  const principal = verifyAccessToken(token)
  if (!principal) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }
  req.authUser = { id: principal.id }
  req.authPrincipal = principal
  next()
}

/** requireRole(['staff']) — с режимом AUTH_MODE (log → пропуск с логом). */
export function requireRole(allowed: AuthRole[], opts: { strict?: boolean } = {}) {
  return function roleMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!process.env.JWT_SECRET) {
      res.status(503).json({ error: 'JWT_SECRET is not configured on AI API' })
      return
    }
    const token = bearerFrom(req.headers.authorization)
    const principal = token ? verifyAccessToken(token) : null
    let reason: string | null = null
    if (!token) reason = 'missing'
    else if (!principal) reason = 'invalid'
    else if (!satisfies(principal.role, allowed)) reason = 'forbidden'

    if (principal) {
      req.authPrincipal = principal
      req.authUser = { id: principal.id }
    }
    if (!reason) {
      next()
      return
    }
    if (opts.strict || authMode() === 'enforce') {
      res.status(reason === 'forbidden' ? 403 : 401).json({ error: reason === 'forbidden' ? 'forbidden' : 'unauthorized' })
      return
    }
    logAuth(req.method, reason, req.path, req)
    next()
  }
}

export const requireStaff = requireRole(['staff'])

export type WsAuthResult =
  | { status: 'ok'; principal: AuthPrincipal }
  | { status: 'guest' }
  | { status: 'reject'; reason: string }

/**
 * Аутентификация WebSocket-подключения: токен в `?token=` (или Bearer-заголовке —
 * для нативных клиентов, умеющих заголовки). Гость — если AI_GUEST_ACCESS=1.
 */
export function authenticateWs(req: IncomingMessage): WsAuthResult {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const token = url.searchParams.get('token') || bearerFrom(req.headers.authorization)
  const path = url.pathname
  const meta = { headers: req.headers as Record<string, unknown>, ip: req.socket?.remoteAddress }

  if (token) {
    const principal = verifyAccessToken(token)
    if (principal) return { status: 'ok', principal }
    // Битый/просроченный токен: в enforce — отказ; иначе — как гость с логом
    if (authMode() === 'enforce') return { status: 'reject', reason: 'invalid' }
    logAuth('WS', 'invalid', path, meta)
    return { status: 'guest' }
  }

  if (guestAccessAllowed()) return { status: 'guest' }
  if (authMode() === 'enforce') return { status: 'reject', reason: 'missing' }
  logAuth('WS', 'missing', path, meta)
  return { status: 'guest' }
}
