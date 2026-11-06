/**
 * Проверки SECURITY_AUDIT_2026-11 (H9/L1) без сети и БД:  npx tsx scripts/check-security.ts
 *  - server/rateLimit.ts: лимит на IP (log — пропуск с [RATE], enforce — 429, 0 — выключен),
 *    счётчик сообщений WS и ограничение размера;
 *  - server/authUser.ts: токен с другим алгоритмом (HS512) не принимается; диагностика — strict.
 */
import assert from 'node:assert'
import jwt from 'jsonwebtoken'
import { createIpLimiter, createWsCounter, wsLimitsFromEnv } from '../server/rateLimit.js'

process.env.JWT_SECRET = 'test-secret-1234567890'
delete process.env.AI_RATE_MODE
delete process.env.AI_DEBUG_STRICT

const { verifyAccessToken, requireStaff } = await import('../server/authUser.js')

let passed = 0
const ok = (name: string) => { passed += 1; console.log(`ok   - ${name}`) }
const warns: string[] = []
const origWarn = console.warn
console.warn = (...a: unknown[]) => { warns.push(a.join(' ')) }

type Res = { code: number; body: unknown; status: (c: number) => Res; json: (b: unknown) => Res }
const mkRes = (): Res => { const r = { code: 200, body: null } as unknown as Res; r.status = (c) => { r.code = c; return r }; r.json = (b) => { r.body = b; return r }; return r }
const mkReq = (ip: string, headers: Record<string, string> = {}) => ({ ip, socket: { remoteAddress: ip }, headers, method: 'GET', path: '/api/logs' }) as never

try {
  const lim = createIpLimiter({ name: 't', limit: 2, windowMs: 60_000 })
  let nexted = 0
  for (let i = 0; i < 3; i++) lim.middleware(mkReq('1.1.1.1'), mkRes() as never, () => { nexted += 1 })
  assert.strictEqual(nexted, 3)
  assert.ok(warns.some((w) => w.includes('[RATE] t mode=log exceeded key=1.1.1.1')))
  ok('лимитер log: пропускает, пишет [RATE]')

  process.env.AI_RATE_MODE = 'enforce'
  nexted = 0
  let last = mkRes()
  for (let i = 0; i < 3; i++) { last = mkRes(); lim.middleware(mkReq('2.2.2.2'), last as never, () => { nexted += 1 }) }
  assert.strictEqual(nexted, 2); assert.strictEqual(last.code, 429); assert.deepStrictEqual(last.body, { error: 'too_many_requests' })
  ok('лимитер enforce: третий запрос — 429')
  delete process.env.AI_RATE_MODE

  const off = createIpLimiter({ name: 'o', limit: 0, windowMs: 1000 })
  nexted = 0
  for (let i = 0; i < 5; i++) off.middleware(mkReq('3.3.3.3'), mkRes() as never, () => { nexted += 1 })
  assert.strictEqual(nexted, 5)
  ok('limit=0 — лимитер выключен')

  const c = createWsCounter({ maxPerMinute: 2, maxBytes: 10 })
  assert.ok(c.allow()); assert.ok(c.allow()); assert.ok(!c.allow())
  assert.ok(c.tooLarge('x'.repeat(11))); assert.ok(!c.tooLarge('x'.repeat(10))); assert.ok(c.tooLarge(Buffer.alloc(11)))
  ok('WS: третье сообщение за минуту отклоняется; размер > лимита отклоняется')

  process.env.AI_WS_MAX_MSG_PER_MIN = 'abc'
  assert.deepStrictEqual(wsLimitsFromEnv(), { maxPerMinute: 30, maxBytes: 8192 })
  ok('WS-лимиты: значения по умолчанию при мусоре в env')

  const good = jwt.sign({ id: 7, scope: 'staff' }, process.env.JWT_SECRET)
  const bad = jwt.sign({ id: 7, scope: 'staff' }, process.env.JWT_SECRET, { algorithm: 'HS512' })
  assert.ok(verifyAccessToken(good)); assert.strictEqual(verifyAccessToken(bad), null)
  ok('JWT: HS256 принимается, HS512 отклоняется')

  delete process.env.AUTH_MODE
  const r1 = mkRes(); let passedThrough = false
  requireStaff(mkReq('4.4.4.4') as never, r1 as never, () => { passedThrough = true })
  assert.strictEqual(passedThrough, false); assert.strictEqual(r1.code, 401)
  const r2 = mkRes(); passedThrough = false
  requireStaff(mkReq('4.4.4.4', { authorization: `Bearer ${good}` }) as never, r2 as never, () => { passedThrough = true })
  assert.strictEqual(passedThrough, true)
  ok('requireStaff: без токена 401 даже в AUTH_MODE=log (строгий), staff-токен проходит')
} catch (e) {
  console.warn = origWarn
  console.error('FAIL -', e instanceof Error ? e.message : e)
  process.exitCode = 1
}
console.warn = origWarn
console.log(`\n${passed} проверок прошло${process.exitCode ? ', есть ошибки' : ''}`)
