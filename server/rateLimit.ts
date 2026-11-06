import type { Request, Response, NextFunction } from 'express'

/**
 * Лимиты без внешних зависимостей (SECURITY_AUDIT_2026-11_RU.md, H9).
 *
 * HTTP: окно/лимит на IP, режим AI_RATE_MODE=log (по умолчанию: превышение только пишется в лог
 * `[RATE] …`) | enforce (429 { error: 'too_many_requests' }). AI_RATE_LIMIT=0 — выключен.
 * WebSocket: лимит сообщений на соединение в минуту и максимальный размер сообщения — всегда
 * действуют (лишние сообщения отвечают { type: 'error', error: 'too_many_requests' } и не идут в LLM).
 */

type Bucket = { count: number; resetAt: number }

export type LimiterOptions = {
  /** Запросов за окно. 0 — лимитер выключен. */
  limit: number
  windowMs: number
  /** Метка в логе. */
  name: string
  /** 'log' — пропускать с записью в лог, 'enforce' — 429. */
  mode?: () => 'log' | 'enforce'
}

export function rateMode(): 'log' | 'enforce' {
  return process.env.AI_RATE_MODE === 'enforce' ? 'enforce' : 'log'
}

export function createIpLimiter(opts: LimiterOptions) {
  const buckets = new Map<string, Bucket>()
  const lastLog = new Map<string, number>()
  const mode = opts.mode ?? rateMode

  function sweep(now: number) {
    if (buckets.size < 10_000) return
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    if (lastLog.size > 5_000) lastLog.clear()
  }

  /** true — в пределах лимита; false — превышен (и уже залогировано). */
  function hit(key: string): boolean {
    if (!(opts.limit > 0)) return true
    const now = Date.now()
    sweep(now)
    let b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + opts.windowMs }
      buckets.set(key, b)
    }
    b.count += 1
    if (b.count <= opts.limit) return true
    const last = lastLog.get(key) ?? 0
    if (now - last > 60_000) {
      lastLog.set(key, now)
      console.warn(`[RATE] ${opts.name} mode=${mode()} exceeded key=${key} count=${b.count}/${opts.limit}`)
    }
    return false
  }

  function middleware(req: Request, res: Response, next: NextFunction) {
    const key = String(req.ip || req.socket?.remoteAddress || 'unknown')
    if (hit(key) || mode() !== 'enforce') {
      next()
      return
    }
    res.status(429).json({ error: 'too_many_requests' })
  }

  return { hit, middleware }
}

export type WsLimits = { maxPerMinute: number; maxBytes: number }

export function wsLimitsFromEnv(): WsLimits {
  const perMin = Number(process.env.AI_WS_MAX_MSG_PER_MIN ?? 30)
  const bytes = Number(process.env.AI_WS_MAX_MSG_BYTES ?? 8192)
  return {
    maxPerMinute: Number.isFinite(perMin) && perMin >= 0 ? perMin : 30,
    maxBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 8192,
  }
}

/** Счётчик сообщений одного WebSocket-соединения (скользящее окно 60 с). */
export function createWsCounter(limits: WsLimits) {
  let windowStart = Date.now()
  let count = 0
  return {
    /** true — сообщение можно обрабатывать. */
    allow(): boolean {
      if (!(limits.maxPerMinute > 0)) return true
      const now = Date.now()
      if (now - windowStart >= 60_000) {
        windowStart = now
        count = 0
      }
      count += 1
      return count <= limits.maxPerMinute
    },
    tooLarge(raw: { length?: number } | string): boolean {
      const len = typeof raw === 'string' ? Buffer.byteLength(raw) : Number(raw?.length ?? 0)
      return len > limits.maxBytes
    },
  }
}
