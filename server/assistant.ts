import type { WebSocket } from 'ws'
import { logEvent } from './chatLog.js'
import { randomUUID } from 'crypto'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { BookingRequest, BookingResponse, Tour } from './types.js'
import { checkUserText, guardContext, maskForContext, PiiBlockedError, sendPiiWarning } from './pii/guard.js'
import { fallbackReply } from './humanTone.js'
import { normalizeQuickPrompt } from './quickPrompts.js'

export type BookingStep =
  | 'idle'
  | 'select_tour'
  | 'pick_date'
  | 'enter_guests'
  | 'contact_info'
  | 'confirm'
  | 'done'

export interface Session {
  /** Stable id used to group journal entries of one dialogue */
  logId?: string
  step: BookingStep
  tourId?: string
  date?: string
  guests?: number
  email?: string
  phone?: string
  guestNames?: string[]
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  llmMessages?: ChatCompletionMessageParam[]
  /** Injected into the system prompt after a restore: hotels already shown. */
  contextNote?: string
  /** Active Level.Travel search context for offers / actualize */
  ltRequestId?: string
  ltOkOperators?: string[]
  /** Dedup identical search_tours calls within one message turn */
  lastSearchSignature?: string
  lastSearchResult?: Record<string, unknown>
  /** Last hotel cards sent to the chat (for annotate_hotels) */
  lastPicks?: (Tour & { pick_label?: string; comment?: string })[]
  lastPicksMessageId?: string
  /** Previous customer message that passed the personal-data check */
  lastUserText?: string
}

export interface AssistantDeps {
  filterTours: (query: {
    destination?: string
    category?: string
  }) => Tour[] | Promise<Tour[]>
  getTour: (id: string) => Tour | undefined
  createBooking: (body: BookingRequest) => BookingResponse
}

/**
 * Rebuild a fresh session from the history the browser kept.
 *
 * WHY: the WebSocket drops on idle/reload, the server session dies with it,
 * and the widget silently reconnects. The customer still SEES the whole chat,
 * but the model started from scratch — "покажи отзывы на этот отель" got
 * "о каком отеле речь?". The killer detail: restore used to fill only
 * session.history, while the model reads session.llmMessages — so even a
 * manual restore left the model with amnesia.
 *
 * Hotels come separately because card data (names/ids) lives in message
 * metadata, not in the text — texts alone often never name the hotel.
 */
export function seedRestoredSession(
  session: Session,
  payload: {
    messages?: Array<{ role?: string; content?: string }>
    hotels?: Array<{ id?: string | number; name?: string }>
  },
) {
  const history = Array.isArray(payload.messages) ? payload.messages : []
  session.llmMessages = [{ role: 'system', content: '' }]
  // The client sends this history — it is checked like any message: personal
  // data in it is masked before it becomes model context (owner's rule).
  // Hotel names here come from the client too, so they do not whitelist
  // anything — only hotels known to the server do.
  const ctx = guardContext()
  for (const m of history.slice(-40)) {
    const role = m?.role === 'assistant' ? 'assistant' : 'user'
    const content = typeof m?.content === 'string' ? maskForContext(m.content.trim(), ctx) : ''
    if (!content) continue
    session.history.push({ role, content })
    session.llmMessages.push({ role, content })
    if (role === 'user') session.lastUserText = content
  }

  const hotels = (Array.isArray(payload.hotels) ? payload.hotels : [])
    .map((h) => {
      const name = typeof h?.name === 'string' ? maskForContext(h.name.trim(), ctx) : ''
      const id = String(h?.id ?? '').replace(/^lt_/, '')
      if (!name) return null
      return /^\d+$/.test(id) ? `${name} (id ${id})` : name
    })
    .filter((x): x is string => Boolean(x))
    .slice(-8)
  if (hotels.length) {
    session.contextNote =
      `Диалог продолжается после переподключения. Клиенту уже показывались отели (в порядке показа, свежие в конце): ${hotels.join('; ')}. ` +
      'Слова «этот отель», «про него», «там» без названия относятся к ПОСЛЕДНЕМУ из списка. Не переспрашивай название — работай с ним; id подставляй в инструменты как hotel_id.'
  }
}

export function createSession(): Session {
  return { step: 'idle', history: [] }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function streamText(ws: WebSocket, text: string, messageId: string) {
  ws.send(JSON.stringify({ type: 'typing' }))
  await sleep(280)
  const chunks = text.match(/.{1,12}/gs) ?? [text]
  for (const chunk of chunks) {
    if (ws.readyState !== ws.OPEN) return
    ws.send(JSON.stringify({ type: 'token', content: chunk, messageId }))
    await sleep(18)
  }
}

function send(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload))
}

function detectCategory(text: string): string | undefined {
  const t = text.toLowerCase()
  if (/гастро|еда|food|кухн|вино|сыр/.test(t)) return 'food'
  if (/семь|дет|family/.test(t)) return 'family'
  if (/приключ|adventure|рафт|джип/.test(t)) return 'adventure'
  if (/культур|музей|истор|cultural/.test(t)) return 'cultural'
  if (/отдых|relax|спа|закат|романт/.test(t)) return 'relaxation'
  if (/ночн|nightlife|бар|клуб/.test(t)) return 'nightlife'
  return undefined
}

function detectDestination(text: string): string | undefined {
  const cities = [
    'turkey',
    'турци',
    'antalya',
    'анталь',
    'egypt',
    'египет',
    'hurghada',
    'хургад',
    'dubai',
    'дубай',
    'uae',
    'thailand',
    'таиланд',
    'phuket',
    'greece',
    'греци',
    'cyprus',
    'кипр',
    'paris',
    'париж',
    'rome',
    'рим',
    'barcelona',
    'барселон',
    'bali',
    'бали',
    'maldives',
    'мальдив',
    'spain',
    'испани',
  ]
  const map: Record<string, string> = {
    turkey: 'Turkey',
    турци: 'Turkey',
    antalya: 'Antalya',
    анталь: 'Antalya',
    egypt: 'Egypt',
    египет: 'Egypt',
    hurghada: 'Hurghada',
    хургад: 'Hurghada',
    dubai: 'Dubai',
    дубай: 'Dubai',
    uae: 'UAE',
    thailand: 'Thailand',
    таиланд: 'Thailand',
    phuket: 'Phuket',
    greece: 'Greece',
    греци: 'Greece',
    cyprus: 'Cyprus',
    кипр: 'Cyprus',
    paris: 'Paris',
    пари: 'Paris',
    rome: 'Rome',
    рим: 'Rome',
    barcelona: 'Barcelona',
    барселон: 'Barcelona',
    bali: 'Bali',
    бали: 'Bali',
    maldives: 'Maldives',
    мальдив: 'Maldives',
    spain: 'Spain',
    испани: 'Spain',
  }
  const lower = text.toLowerCase()
  for (const key of cities) {
    if (lower.includes(key)) return map[key]
  }
  return undefined
}

function extractTourId(text: string, tours: Tour[]): string | undefined {
  const byId = text.match(/tour_[a-z0-9_]+/i)
  if (byId) return byId[0]
  const lower = text.toLowerCase()
  const found = tours.find(
    (t) => lower.includes(t.name.toLowerCase()) || lower.includes(t.id.toLowerCase()),
  )
  return found?.id
}

function extractDate(text: string): string | undefined {
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)
  if (iso) return iso[0]
  const dmy = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (dmy) {
    const day = dmy[1].padStart(2, '0')
    const month = dmy[2].padStart(2, '0')
    let year = dmy[3]
    if (year.length === 2) year = `20${year}`
    return `${year}-${month}-${day}`
  }
  return undefined
}

function extractEmail(text: string): string | undefined {
  return text.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]
}

function extractPhone(text: string): string | undefined {
  const m = text.match(/(\+?\d[\d\s()-]{7,}\d)/)
  return m?.[0]?.replace(/\s+/g, ' ').trim()
}

function extractGuests(text: string): number | undefined {
  const m =
    text.match(/(\d+)\s*(чел|гост|человек|people|guests|adults)/i) ||
    text.match(/^(\d+)$/)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function formatTourList(tours: Tour[]): string {
  return tours
    .slice(0, 5)
    .map(
      (t, i) =>
        `${i + 1}. ${t.emoji} «${t.name}» — ${t.destination}, ${t.duration}, $${t.price} (★${t.rating})\n   id: ${t.id}`,
    )
    .join('\n')
}

export async function handleAssistantMessage(
  ws: WebSocket,
  session: Session,
  userText: string,
  deps: AssistantDeps,
) {
  // Personal data never goes further: not to the model, not to the session,
  // not to the journal. The customer is asked to remove it and resend.
  const piiTypes = checkUserText(
    userText,
    guardContext({ hotelNames: session.lastPicks?.map((t) => t.name), previousUserText: session.lastUserText }),
  )
  if (piiTypes.length) {
    logEvent({ session: session.logId ?? 'unknown', kind: 'pii_blocked', types: piiTypes })
    await sendPiiWarning(ws, piiTypes, randomUUID())
    return
  }
  session.lastUserText = userText
  // Старая кнопка «Совет куда ехать» с «в сентябре» — без месяца (владелец, 21.10).
  userText = normalizeQuickPrompt(userText)

  const { isLlmEnabled, handleLlmMessage } = await import('./llm.js')
  if (isLlmEnabled()) {
    try {
      await handleLlmMessage(ws, session, userText, deps)
      return
    } catch (err) {
      if (err instanceof PiiBlockedError) {
        // The request check found personal data the entry check missed:
        // nothing was sent; drop the message and warn the customer.
        if (session.history.at(-1)?.role === 'user') session.history.pop()
        if (session.llmMessages?.at(-1)?.role === 'user') session.llmMessages.pop()
        logEvent({ session: session.logId ?? 'unknown', kind: 'pii_blocked', types: err.types, stage: 'request' })
        await sendPiiWarning(ws, err.types, randomUUID())
        return
      }
      // DO NOT silently fall back to the scripted bot: that hid the real
      // failure and made it look like "the assistant stopped finding tours",
      // while the actual cause (LLM/API error) was only visible in the
      // server log. Surface the error in the chat instead.
      console.error('[llm] ОШИБКА ассистента:', err)
      if (session.history.at(-1)?.role === 'user') session.history.pop()
      if (session.llmMessages?.at(-1)?.role === 'user') session.llmMessages.pop()

      const reason = err instanceof Error ? err.message : String(err)
      logEvent({ session: session.logId ?? 'unknown', kind: 'error', text: reason })
      // The reason stays in the journal. The customer gets Mila's words, not
      // «Не удалось выполнить запрос: 429 …» — clients show `error` as her
      // message, so a technical text looked like a terminal.
      await sendHumanText(ws, fallbackReply('error'))
      return
    }
  }

  await handleRuleBasedMessage(ws, session, userText, deps)
}

/** A reply from Mila that is not stored in the dialogue (the message was dropped). */
export async function sendHumanText(ws: WebSocket, text: string) {
  const messageId = randomUUID()
  for (const chunk of text.match(/.{1,14}/gs) ?? [text]) {
    if (ws.readyState !== ws.OPEN) return
    send(ws, { type: 'token', content: chunk, messageId })
    await new Promise((r) => setTimeout(r, 10))
  }
  send(ws, { type: 'done', messageId })
}

async function handleRuleBasedMessage(
  ws: WebSocket,
  session: Session,
  userText: string,
  deps: AssistantDeps,
) {
  if (!session.logId) session.logId = randomUUID().slice(0, 8)
  logEvent({ session: session.logId, kind: 'user', text: userText })
  session.history.push({ role: 'user', content: userText })
  const messageId = randomUUID()
  const lower = userText.toLowerCase()

  // Global intents
  if (/^(привет|здравствуй|hello|hi)\b/.test(lower)) {
    const reply =
      'Здравствуйте! Я помогу найти пакетный тур Level.Travel шаг за шагом.\n\nСкажите, например:\n• «Найди туры в Турцию»\n• «Туры в Египет»\n• «Хочу забронировать lt_9101855»'
    await streamText(ws, reply, messageId)
    send(ws, { type: 'done', messageId })
    session.history.push({ role: 'assistant', content: reply })
    return
  }

  if (/выходн|weekend/.test(lower) && session.step === 'idle') {
    // filterTours is async — without await this called .filter() on a Promise
    // and threw at runtime.
    const tours = (await deps.filterTours({}))
      .filter((t) => t.duration_hours <= 12)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 4)
    send(ws, { type: 'tours', tours, messageId })
    const reply = `Подобрал варианты на выходные (до одного дня):\n\n${formatTourList(tours)}\n\nНапишите название или id тура, чтобы начать бронирование.`
    await streamText(ws, reply, messageId)
    send(ws, { type: 'done', messageId })
    session.step = 'select_tour'
    session.history.push({ role: 'assistant', content: reply })
    return
  }

  // Search / select tour
  const explicitBook = /заброн|хочу заброн|book/.test(lower)
  const catalog = await Promise.resolve(deps.filterTours({}))
  const tourIdFromText = extractTourId(userText, catalog)
  const destination = detectDestination(userText)
  const category = detectCategory(userText)

  if (tourIdFromText || (explicitBook && session.tourId)) {
    const id = tourIdFromText ?? session.tourId!
    const tour = deps.getTour(id)
    if (!tour) {
      const reply = 'Не нашёл такой тур. Попробуйте другой id или спросите «туры в Турцию».'
      await streamText(ws, reply, messageId)
      send(ws, { type: 'done', messageId })
      return
    }
    send(ws, {
      type: 'tool',
      tool: { name: 'get_tour_details', arguments: { tour_id: tour.id } },
      messageId,
    })
    send(ws, { type: 'tours', tours: [tour], messageId })
    session.tourId = tour.id
    // NO booking wizard: the AI never creates bookings or booking numbers.
    // Booking (and the booking id) is handled by the tour page — later by the
    // client's own system. INTEGRATION POINT: подключение вашей системы брони
    // делается на странице тура / в POST /api/bookings, не в чате.
    const reply = `«${tour.name}» — отличный выбор!\n\nЦена: от ${tour.price} ${tour.currency} · ${tour.duration}\n\nБронирование оформляется на странице тура — там актуальная цена и все варианты номеров. Если появятся вопросы по отелю, я на связи.`
    await streamText(ws, reply, messageId)
    send(ws, { type: 'done', messageId })
    session.history.push({ role: 'assistant', content: reply })
    return
  }

  if (destination || category || /тур|найд|покаж|подбер|ищ|search|find/.test(lower)) {
    const tours = await Promise.resolve(
      deps.filterTours({
        destination,
        category,
      }),
    )
    send(ws, {
      type: 'tool',
      tool: {
        name: 'search_tours',
        arguments: { destination, category },
      },
      messageId,
    })
    send(ws, { type: 'tours', tours, messageId })
    if (!tours.length) {
      const reply =
        'Ничего не нашёл по запросу. Попробуйте другое направление или стиль (гастро, семья, приключения).'
      await streamText(ws, reply, messageId)
      send(ws, { type: 'done', messageId })
      return
    }
    session.step = 'select_tour'
    const where = destination ? ` в ${destination}` : category ? ` (${category})` : ''
    const reply = `Нашёл ${tours.length} вариант${tours.length === 1 ? '' : 'ов'}${where}:\n\n${formatTourList(tours)}\n\nШаг 1/5 — напишите id или название тура, чтобы продолжить бронирование.`
    await streamText(ws, reply, messageId)
    send(ws, { type: 'done', messageId })
    session.history.push({ role: 'assistant', content: reply })
    return
  }

  if (session.step === 'select_tour') {
    const reply =
      'Чтобы продолжить, пришлите id отеля из списка (например lt_9101855) или уточните поиск.'
    await streamText(ws, reply, messageId)
    send(ws, { type: 'done', messageId })
    return
  }

  const reply =
    'Я могу:\n1) Найти туры — «Найди туры в Рим»\n2) Показать гастро/семейные/выходные\n3) Провести бронирование шаг за шагом\n\nЧто интересует?'
  await streamText(ws, reply, messageId)
  send(ws, { type: 'done', messageId })
  session.history.push({ role: 'assistant', content: reply })
}
