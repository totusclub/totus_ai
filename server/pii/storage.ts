/**
 * Masking of data that was stored BEFORE the personal-data guard: chat
 * history rows (ai_chats) and journal lines (~/.totus-chat-logs/*.jsonl).
 * Used by scripts/pii-scrub-storage.ts; pure, so it is easy to check.
 */
import { maskDeep, maskPii } from './detect.js'

export interface StoredChatRow {
  id: string
  title: string
  messages_json: string | Array<Record<string, unknown>>
}

/** Masked title + messages; `changed` = something was masked. */
export function scrubStoredChat(row: StoredChatRow): { title: string; messagesJson: string; changed: boolean } {
  let messages: Array<Record<string, unknown>> = []
  try {
    const raw = typeof row.messages_json === 'string' ? JSON.parse(row.messages_json) : row.messages_json
    messages = Array.isArray(raw) ? raw : []
  } catch {
    messages = []
  }
  let changed = false
  const out = messages.map((m) => {
    if (typeof m?.content !== 'string') return m
    const content = maskPii(m.content)
    if (content === m.content) return m
    changed = true
    return { ...m, content }
  })
  const title = maskPii(row.title || '')
  if (title !== (row.title || '')) changed = true
  return { title, messagesJson: JSON.stringify(out), changed }
}

/** One journal line (JSON) with every text field masked. */
export function scrubLogLine(line: string): { line: string; changed: boolean } {
  if (!line.trim()) return { line, changed: false }
  try {
    const entry = JSON.parse(line) as Record<string, unknown>
    const masked = maskDeep(entry)
    const next = JSON.stringify(masked)
    return { line: next, changed: next !== JSON.stringify(entry) }
  } catch {
    // Not JSON — mask as plain text.
    const next = maskPii(line)
    return { line: next, changed: next !== line }
  }
}
