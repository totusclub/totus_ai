import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { maskDeep, maskPii } from './pii/detect.js'

/**
 * Diagnostic journal of real dialogues.
 *
 * WHY: without it, debugging relies on screenshots and retelling — the chat
 * resets on page reload and the actual queries are lost. With the journal we
 * can see exactly what the customer typed, which tool ran with which
 * parameters, and what came back.
 *
 * WHERE: files live OUTSIDE the project tree (home directory by default).
 * Writing inside the project makes Vite's watcher full-reload the page —
 * that exact bug already cost us a debugging session.
 */
const LOG_DIR =
  process.env.TOTUS_LOG_DIR?.trim() || path.join(os.homedir(), '.totus-chat-logs')

export type LogKind = 'user' | 'assistant' | 'tool' | 'error' | 'humanize' | 'pii_blocked' | 'playbook'

export interface LogEntry {
  ts: string
  session: string
  kind: LogKind
  text?: string
  tool?: string
  args?: unknown
  summary?: string
  ms?: number
  /** Level.Travel calls behind a tool step (kept here, not sent to the browser) */
  api_calls?: string[]
  /** humanize: machine phrases found in the reply and whether it was rewritten */
  found?: string[]
  changed?: boolean
  /** pii_blocked: types of personal data found (never the values) */
  types?: string[]
  stage?: string
  /** playbook: ids of «опыт турагента» topics added to the prompt */
  topics?: string[]
}

function fileForToday() {
  const day = new Date().toISOString().slice(0, 10)
  return path.join(LOG_DIR, `chat-${day}.jsonl`)
}

/** Never log personal data in the open: the same detector as for the chat. */
function scrub(text?: string): string | undefined {
  if (!text) return text
  return maskPii(text.slice(0, 2000))
}

export function logEvent(entry: Omit<LogEntry, 'ts'>) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
    const line: LogEntry = {
      ts: new Date().toISOString(),
      ...entry,
      text: scrub(entry.text),
      summary: scrub(entry.summary),
      args: entry.args === undefined ? undefined : maskDeep(entry.args),
    }
    appendFileSync(fileForToday(), `${JSON.stringify(line)}\n`, 'utf8')
  } catch {
    // logging must never break the assistant
  }
}

/** Recent entries, newest last. Reads the last few daily files. */
export function readRecentLog(limit = 300, sessionFilter?: string): LogEntry[] {
  try {
    if (!existsSync(LOG_DIR)) return []
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('chat-') && f.endsWith('.jsonl'))
      .sort()
      .slice(-3)
    const out: LogEntry[] = []
    for (const f of files) {
      const raw = readFileSync(path.join(LOG_DIR, f), 'utf8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const e = JSON.parse(line) as LogEntry
          if (sessionFilter && e.session !== sessionFilter) continue
          out.push(e)
        } catch {
          // skip malformed line
        }
      }
    }
    return out.slice(-limit)
  } catch {
    return []
  }
}

/** Sessions overview: id, time range, first user query, counts. */
export function readSessions(limit = 30) {
  const entries = readRecentLog(5000)
  const map = new Map<
    string,
    { session: string; started: string; ended: string; firstQuery?: string; messages: number; errors: number }
  >()
  for (const e of entries) {
    let s = map.get(e.session)
    if (!s) {
      s = { session: e.session, started: e.ts, ended: e.ts, messages: 0, errors: 0 }
      map.set(e.session, s)
    }
    s.ended = e.ts
    if (e.kind === 'user') {
      s.messages++
      if (!s.firstQuery) s.firstQuery = e.text
    }
    if (e.kind === 'error') s.errors++
  }
  return [...map.values()].slice(-limit).reverse()
}

export function logDir() {
  return LOG_DIR
}
