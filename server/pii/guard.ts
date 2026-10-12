/**
 * Personal-data guard for Mila — where the detector is applied.
 *
 *   1. Incoming chat message (WS `chat`): personal data → the message does
 *      not go anywhere, the customer gets a warning («уберите … и отправьте
 *      ещё раз»). Checked on the server: a modified client cannot skip it.
 *   2. Restored history (WS `restore`): every message is masked before it
 *      becomes model context.
 *   3. Every request to DeepSeek (`assertNoPiiInRequest`): a user message
 *      with personal data stops the request (fail closed); Mila's own earlier
 *      replies are masked. No code path can send personal data to the model.
 *   4. Storage: chat history (MySQL) and the journal keep only masked text.
 */
import type { WebSocket } from 'ws'
import { cachedHotelWords, knownPlaceWords } from '../levelTravel.js'
import {
  findPii,
  maskPii,
  piiTypes,
  PII_WARNING_LABELS,
  type PiiContext,
  type PiiType,
} from './detect.js'

export { PII_RULES_VERSION } from './detect.js'

export class PiiBlockedError extends Error {
  constructor(readonly types: PiiType[]) {
    super(`personal data in request: ${types.join(', ')}`)
    this.name = 'PiiBlockedError'
  }
}

let placesCache: { at: number; words: string[] } | null = null
function places(): string[] {
  if (!placesCache || Date.now() - placesCache.at > 10 * 60 * 1000) {
    placesCache = { at: Date.now(), words: knownPlaceWords() }
  }
  return placesCache.words
}

/** Detector context: known places and hotel names are not people. */
export function guardContext(extra: { hotelNames?: string[]; previousUserText?: string } = {}): PiiContext {
  const hotelWords = new Set(cachedHotelWords())
  for (const n of extra.hotelNames ?? []) {
    for (const w of n.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/)) if (w.length >= 3) hotelWords.add(w)
  }
  return { places: places(), hotelWords, previousUserText: extra.previousUserText }
}

function joinRu(items: string[]) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`
}

/** Mila's warning. The found value itself is never repeated. */
export function buildPiiWarning(types: PiiType[]): string {
  const what = joinRu(types.map((t) => PII_WARNING_LABELS[t]))
  return (
    `Пожалуйста, уберите из сообщения личные данные${what ? ` — ${what}` : ''} — и отправьте его ещё раз. ` +
    'Мне они не нужны, чтобы подобрать тур, поэтому это сообщение я не обработала. ' +
    'Вместо имён и контактов достаточно написать, например: «двое взрослых и ребёнок 7 лет, вылет из Москвы в ноябре». ' +
    'Бронирование оформляется на странице тура, а связаться с менеджером можно через звонок в поддержку в личном кабинете.'
  )
}

/** Types of personal data in a customer message (empty = may go on). */
export function checkUserText(text: string, ctx?: PiiContext): PiiType[] {
  return piiTypes(findPii(text, ctx ?? guardContext()))
}

/**
 * Tell the customer, in every client version: old clients render `token` /
 * `done` as a normal message from Mila; `pii_blocked` is for new clients
 * (highlight, «Убрать данные и отправить») and is ignored by old ones.
 */
export async function sendPiiWarning(ws: WebSocket, types: PiiType[], messageId: string) {
  const send = (p: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(p))
  }
  send({ type: 'pii_blocked', types, messageId })
  const text = buildPiiWarning(types)
  for (const chunk of text.match(/.{1,24}/gs) ?? [text]) {
    if (ws.readyState !== ws.OPEN) return
    send({ type: 'token', content: chunk, messageId })
    await new Promise((r) => setTimeout(r, 8))
  }
  send({ type: 'done', messageId })
}

type ChatMessage = { role?: string; content?: unknown }

/**
 * Last line of defence before DeepSeek. Throws PiiBlockedError if a user
 * message still contains personal data; masks it in Mila's own replies.
 * Tool results carry only booking-system data (reviews are masked when read).
 */
export function assertNoPiiInRequest<T extends { messages?: ChatMessage[] }>(body: T, ctx?: PiiContext): T {
  const messages = body.messages ?? []
  const context = ctx ?? guardContext()
  const found = new Set<PiiType>()
  const safe = messages.map((m) => {
    if (typeof m.content !== 'string' || !m.content) return m
    if (m.role === 'user') {
      for (const t of checkUserText(m.content, context)) found.add(t)
      return m
    }
    if (m.role === 'assistant') {
      const masked = maskPii(m.content, context)
      return masked === m.content ? m : { ...m, content: masked }
    }
    return m
  })
  if (found.size) throw new PiiBlockedError([...found])
  return { ...body, messages: safe }
}

/** Masked copy of a restored history message. */
export function maskForContext(text: string, ctx?: PiiContext): string {
  return maskPii(text, ctx ?? guardContext())
}
