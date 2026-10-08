/**
 * Hotel facts cascade — how Mila answers «есть ли там анимация», «какой пляж»,
 * «хвалят ли кухню» without ever saying «информации нет»:
 *
 *   1. Level.Travel hotel reference (description + facilities)
 *   2. Level.Travel guest reviews
 *   3. Web search (Yandex), only if 1–2 gave nothing useful
 *
 * Every fact carries its source ONLY for the model's phrasing ("в отеле есть"
 * vs "гости хвалят"); the customer never hears where it came from.
 */
import {
  fetchHotelInfo as ltFetchHotelInfo,
  fetchHotelReviews as ltFetchHotelReviews,
  getCachedHotel as ltGetCachedHotel,
  type HotelInfo,
  type HotelReview,
} from './levelTravel.js'
import { isWebSearchEnabled as realWebEnabled, webSearch as realWebSearch, type WebResult } from './webSearch.js'

export type FactSource = 'hotel' | 'guests' | 'web'
export type FactTone = 'positive' | 'negative' | 'neutral'
export type Fact = { source: FactSource; text: string; tone: FactTone }

export interface HotelFacts {
  hotel_id: number
  name: string
  topic: string
  found: boolean
  facts: Fact[]
  /** Guest reviews that mention the topic: positive / negative / total */
  guests: { positive: number; negative: number; total: number }
}

export interface FactsDeps {
  fetchHotelInfo: (hotelId: number) => Promise<HotelInfo | null>
  fetchHotelReviews: (hotelId: number, opts: { perPage?: number }) => Promise<{ reviews: HotelReview[] }>
  getCachedHotel: (hotelId: number) => HotelInfo | undefined
  webSearch: (query: string, opts?: { limit?: number }) => Promise<WebResult[]>
  isWebSearchEnabled: () => boolean
}

const realDeps: FactsDeps = {
  fetchHotelInfo: ltFetchHotelInfo,
  fetchHotelReviews: ltFetchHotelReviews,
  getCachedHotel: ltGetCachedHotel,
  webSearch: realWebSearch,
  isWebSearchEnabled: realWebEnabled,
}
let deps: FactsDeps = realDeps

/** Tests replace Level.Travel / web with fakes. */
export function __setFactsDeps(d: Partial<FactsDeps> | null) {
  deps = d ? { ...realDeps, ...d } : realDeps
}

/**
 * Topic → keywords. A keyword matches at a word start and may continue
 * («анимац» → «анимация», «аниматоры»); a trailing «$» means the whole word
 * («спа$» must not match «спасибо»).
 */
const TOPICS: Record<string, string[]> = {
  анимация: ['анимац', 'аниматор', 'шоу', 'дискотек', 'мини-диско', 'минидиско', 'вечерн программ', 'развлекательн программ', 'animation', 'entertainment', 'mini disco', 'evening show'],
  аквапарк: ['аквапарк', 'водн горк', 'горки', 'горок', 'aquapark', 'aqua park', 'water park', 'waterpark', 'waterslide', 'water slide'],
  'водные горки': ['водн горк', 'горки', 'горок', 'аквапарк', 'waterslide', 'water slide', 'aquapark'],
  'детский клуб': ['детский клуб', 'детского клуба', 'детском клубе', 'мини-клуб', 'мини клуб', 'миниклуб', 'kids club', 'kid club', 'mini club', 'miniclub'],
  'детская анимация': ['детская анимац', 'детской анимац', 'мини-клуб', 'мини клуб', 'мини-диско', 'kids animation'],
  'a la carte': ['a la carte', 'a-la-carte', 'а ля карт', 'а-ля-карт', 'алякарт'],
  рестораны: ['ресторан', 'a la carte', 'а ля карт', 'а-ля-карт', 'restaurant'],
  питание: ['питани', 'кухн', 'еда$', 'еды$', 'шведск', 'ресторан', 'завтрак', 'ужин', 'food', 'cuisine'],
  пляж: ['пляж', 'песок', 'песчан', 'гальк', 'галечн', 'понтон', 'пирс', 'beach', 'sand', 'pebble', 'pier'],
  море: ['море', 'моря', 'вход в воду', 'заход в воду', 'sea$'],
  спа: ['спа$', 'спа-', 'spa$', 'wellness', 'хаммам', 'хамам', 'сауна', 'массаж', 'турецкая баня'],
  бассейн: ['бассейн', 'pool'],
  'подогреваемый бассейн': ['подогрев', 'heated pool', 'крытый бассейн', 'indoor pool'],
  'крытый бассейн': ['крытый бассейн', 'крытым бассейн', 'indoor pool'],
  фитнес: ['фитнес', 'тренажер', 'тренажёр', 'спортзал', 'fitness', 'gym$'],
  теннис: ['теннис', 'корт', 'tennis'],
  номера: ['номер', 'семейн', 'смежн', 'коннект', 'room', 'suite', 'сьют', 'family'],
  'семейные номера': ['семейн номер', 'семейный номер', 'смежн', 'коннект', 'family room', 'family suite', 'connected room'],
  уборка: ['уборк', 'убира', 'чистот', 'горничн', 'clean'],
  wifi: ['wi-fi', 'wifi', 'вайфай', 'вай-фай', 'интернет'],
  территория: ['территор', 'сад', 'зелен', 'территории', 'garden'],
  персонал: ['персонал', 'сервис', 'обслуживан', 'staff', 'service'],
  шум: ['шум', 'шумн', 'тихо', 'тихий', 'тишин', 'noise'],
  трансфер: ['трансфер', 'аэропорт', 'transfer', 'airport'],
  'только для взрослых': ['adults only', 'только для взрослых', '16+', '18+', 'без детей'],
}

/** Words that do not carry the topic («есть ли», «хорошая» …). */
const STOP = new Set([
  'есть', 'ли', 'там', 'какая', 'какой', 'какие', 'хорошая', 'хороший', 'хорошие', 'классная', 'классный',
  'отличная', 'отличный', 'в', 'на', 'и', 'с', 'для', 'по', 'отеле', 'отель', 'отеля', 'как', 'что', 'это',
])

function norm(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е')
}

/** Keywords for a free-form topic: known topics it contains, else word stems. */
export function topicKeywords(topic: string): string[] {
  const t = norm(topic).trim()
  const out = new Set<string>()
  for (const [key, words] of Object.entries(TOPICS)) {
    const k = norm(key)
    // «классная анимация» contains «анимац»; «spa» etc. via the keyword list.
    const stem = k.length > 6 ? k.slice(0, k.length - 2) : k
    if (t.includes(stem) || words.some((w) => matchKeyword(t, w))) words.forEach((w) => out.add(w))
  }
  if (!out.size) {
    for (const w of t.split(/[^a-zа-я0-9+-]+/)) {
      if (w.length < 4 || STOP.has(w)) continue
      out.add(w.length > 6 ? w.slice(0, w.length - 2) : w)
    }
  }
  return [...out]
}

const LETTER = '[a-zа-я0-9]'

function keywordRegex(word: string): RegExp {
  const whole = word.endsWith('$')
  const body = norm(whole ? word.slice(0, -1) : word)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s+(?:[a-zа-я]+\\s+)?') // «водн горк» ↔ «водные горки», «вечерн программ» ↔ «вечерняя развлекательная программа»
  return new RegExp(`(^|[^a-zа-я0-9])${body}${whole ? `(?!${LETTER})` : ''}`, 'i')
}

const regexCache = new Map<string, RegExp>()
function matchKeyword(text: string, word: string) {
  let re = regexCache.get(word)
  if (!re) {
    re = keywordRegex(word)
    regexCache.set(word, re)
  }
  return re.test(text)
}

export function mentions(text: string, keywords: string[]) {
  const t = norm(text)
  return keywords.some((k) => matchKeyword(t, k))
}

/** Sentences of `text` that mention any keyword (trimmed, deduplicated). */
export function matchingSentences(text: string, keywords: string[], max = 3): string[] {
  const out: string[] = []
  for (const raw of text.split(/(?<=[.!?…])\s+|\n+|;\s+/)) {
    const s = raw.replace(/\s+/g, ' ').trim()
    if (s.length < 8 || !mentions(s, keywords)) continue
    const clipped = s.length > 240 ? `${s.slice(0, 237)}…` : s
    if (!out.includes(clipped)) out.push(clipped)
    if (out.length >= max) break
  }
  return out
}

const NEGATIVE = /(^|[^а-я])(не было|нет(?![а-я])|отсутств|скучн|слаб|плох|ужасн|никак|не понрав|разочар|мало\s|маловат|не работал|закрыт|грязн|шумн)/i
const POSITIVE = /(отличн|супер|классн|весел|весёл|хорош|замечательн|понрав|лучш|профессионал|шикарн|прекрасн|огонь|молодц|восторг|рекоменд|великолепн|чудесн|интересн)/i

export function toneOf(sentence: string, hint?: FactTone): FactTone {
  if (hint && hint !== 'neutral') return hint
  const s = norm(sentence)
  if (NEGATIVE.test(s)) return 'negative'
  if (POSITIVE.test(s)) return 'positive'
  return 'neutral'
}

/** Step 1: hotel reference — facilities list and description. */
function referenceFacts(info: HotelInfo | null | undefined, keywords: string[]): Fact[] {
  if (!info) return []
  const facts: Fact[] = []
  const facilities = (info.facilities ?? []).filter((f) => mentions(f, keywords))
  if (facilities.length) {
    facts.push({ source: 'hotel', text: `В отеле: ${facilities.slice(0, 6).join(', ')}`, tone: 'neutral' })
  }
  for (const s of matchingSentences(info.description ?? '', keywords, 3)) {
    facts.push({ source: 'hotel', text: s, tone: 'neutral' })
  }
  const featureKeys = Object.entries(info.features ?? {})
    .filter(([k, v]) => (v === true || v === 'YES' || v === 'FREE') && mentions(k.replace(/_/g, ' '), keywords))
    .map(([k]) => k.replace(/_/g, ' '))
  if (featureKeys.length && !facilities.length) {
    facts.push({ source: 'hotel', text: `В отеле: ${featureKeys.join(', ')}`, tone: 'neutral' })
  }
  return facts
}

/** Step 2: guest reviews — sentences about the topic, with tone. */
function reviewFacts(reviews: HotelReview[], keywords: string[], max = 5) {
  const facts: Fact[] = []
  let positive = 0
  let negative = 0
  let total = 0
  for (const r of reviews) {
    const parts: Array<{ text: string; hint?: FactTone }> = [
      { text: r.pros ?? '', hint: 'positive' },
      { text: r.cons ?? '', hint: 'negative' },
      { text: [r.title, r.text].filter(Boolean).join('. ') },
    ]
    let counted = false
    for (const p of parts) {
      const sentences = matchingSentences(p.text, keywords, 2)
      for (const s of sentences) {
        const tone = toneOf(s, p.hint)
        if (!counted) {
          total++
          if (tone === 'positive') positive++
          if (tone === 'negative') negative++
          counted = true
        }
        if (facts.length < max && !facts.some((f) => f.text === s)) facts.push({ source: 'guests', text: s, tone })
      }
    }
  }
  return { facts, positive, negative, total }
}

/** Distinctive words of a hotel name, to make sure a web page is about IT. */
function nameTokens(name: string) {
  return norm(name)
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-zа-я0-9]+/)
    .filter((w) => w.length >= 3 && !['hotel', 'resort', 'отель', 'the', 'spa', 'and', 'club', 'beach'].includes(w))
}

/** Step 3: web snippets that are about this hotel and this topic. */
async function webFacts(info: HotelInfo | null | undefined, name: string, topic: string, keywords: string[]) {
  if (!deps.isWebSearchEnabled() || !name) return []
  const place = [info?.city, info?.country].filter(Boolean).join(' ')
  const results = await deps.webSearch(`${name} ${place} ${topic} отзывы`.replace(/\s+/g, ' ').trim(), { limit: 6 })
  const tokens = nameTokens(name)
  const facts: Fact[] = []
  for (const r of results) {
    const about = `${r.title} ${r.snippet} ${r.url}`
    const sameHotel = tokens.length === 0 || tokens.filter((t) => norm(about).includes(t)).length >= Math.min(2, tokens.length)
    if (!sameHotel) continue
    for (const s of matchingSentences(r.snippet.replace(/ … /g, '. '), keywords, 2)) {
      if (!facts.some((f) => f.text === s)) facts.push({ source: 'web', text: s, tone: toneOf(s) })
    }
    if (facts.length >= 4) break
  }
  return facts
}

/**
 * Everything we can learn about one topic of one hotel, cascade order.
 * Web search runs only when the hotel card and reviews were not enough
 * (or always, with `forceWeb`).
 */
export async function researchHotel(
  hotelId: number,
  topic: string,
  opts: { reviews?: number; forceWeb?: boolean; web?: boolean } = {},
): Promise<HotelFacts> {
  const keywords = topicKeywords(topic)
  const info = await deps.fetchHotelInfo(hotelId).catch(() => deps.getCachedHotel(hotelId) ?? null)
  const name = info?.name ?? deps.getCachedHotel(hotelId)?.name ?? ''
  const facts = referenceFacts(info, keywords)

  let guests = { positive: 0, negative: 0, total: 0 }
  try {
    const { reviews } = await deps.fetchHotelReviews(hotelId, { perPage: opts.reviews ?? 30 })
    const r = reviewFacts(reviews, keywords)
    facts.push(...r.facts)
    guests = { positive: r.positive, negative: r.negative, total: r.total }
  } catch {
    // reviews are optional — keep going
  }

  const enough = facts.filter((f) => f.source === 'hotel').length >= 1 || guests.total >= 2
  if (opts.web !== false && (opts.forceWeb || !enough)) {
    try {
      facts.push(...(await webFacts(info, name, topic, keywords)))
    } catch {
      // web is the last resort; nothing to add
    }
  }

  return { hotel_id: hotelId, name, topic, found: facts.length > 0, facts: facts.slice(0, 8), guests }
}

/* ------------------------------------------------------------------------ */
/* Bulk confirmation for search results («отели с классной анимацией»).      */
/* ------------------------------------------------------------------------ */

export interface FeatureConfirmation {
  /** Requested features that are confirmed for this hotel */
  confirmed: string[]
  /** One short fact per confirmed feature — for the card comment */
  evidence: Record<string, Fact>
  /** Guests praising the requested features — for «классная анимация» ranking */
  praise: number
  complaints: number
}

async function mapLimit<T, R>(items: T[], limit: number, deadline: number, fn: (t: T) => Promise<R>) {
  const out = new Array<R | undefined>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) {
      const i = next++
      try {
        out[i] = await fn(items[i])
      } catch {
        out[i] = undefined
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Check soft features (анимация, спа, теннис, a la carte …) for a list of
 * hotels, cheapest cascade first: reference for many, reviews for the
 * still-unconfirmed top, web for a handful. Bounded by `budgetMs`.
 */
export async function confirmFeatures(
  hotelIds: number[],
  features: string[],
  opts: { referenceLimit?: number; reviewLimit?: number; webLimit?: number; budgetMs?: number } = {},
): Promise<Map<number, FeatureConfirmation>> {
  const result = new Map<number, FeatureConfirmation>()
  const wanted = features.map((f) => f.trim()).filter(Boolean)
  if (!wanted.length || !hotelIds.length) return result
  const deadline = Date.now() + (opts.budgetMs ?? 15000)
  const kw = new Map(wanted.map((f) => [f, topicKeywords(f)]))
  const entry = (id: number) => {
    let e = result.get(id)
    if (!e) {
      e = { confirmed: [], evidence: {}, praise: 0, complaints: 0 }
      result.set(id, e)
    }
    return e
  }
  const missing = (id: number) => wanted.filter((f) => !result.get(id)?.confirmed.includes(f))
  const add = (id: number, feature: string, fact: Fact) => {
    const e = entry(id)
    if (!e.confirmed.includes(feature)) e.confirmed.push(feature)
    if (!e.evidence[feature] || (e.evidence[feature].source !== 'guests' && fact.tone === 'positive')) e.evidence[feature] = fact
  }

  // 1. Reference book.
  const refIds = hotelIds.slice(0, opts.referenceLimit ?? 30)
  await mapLimit(refIds, 8, deadline, async (id) => {
    const info = await deps.fetchHotelInfo(id)
    for (const f of wanted) {
      const facts = referenceFacts(info, kw.get(f)!)
      if (facts.length) add(id, f, facts[0])
    }
  })

  // 2. Reviews — for every hotel in the review window: they both confirm
  //    missing features and tell whether guests PRAISE them.
  const revIds = hotelIds.slice(0, opts.reviewLimit ?? 15)
  await mapLimit(revIds, 6, deadline, async (id) => {
    const { reviews } = await deps.fetchHotelReviews(id, { perPage: 20 })
    for (const f of wanted) {
      const r = reviewFacts(reviews, kw.get(f)!, 2)
      if (!r.total) continue
      const e = entry(id)
      e.praise += r.positive
      e.complaints += r.negative
      // A feature guests mostly complain about («анимации нет») is not confirmed.
      if (r.positive + (r.total - r.positive - r.negative) > r.negative) {
        const best = r.facts.find((x) => x.tone === 'positive') ?? r.facts.find((x) => x.tone !== 'negative')
        if (best) add(id, f, best)
      }
    }
  })

  // 3. Web — only a few hotels that are still missing something.
  if (deps.isWebSearchEnabled()) {
    const webIds = hotelIds
      .slice(0, opts.reviewLimit ?? 15)
      .filter((id) => missing(id).length)
      .slice(0, opts.webLimit ?? 4)
    await mapLimit(webIds, 4, deadline, async (id) => {
      const info = deps.getCachedHotel(id)
      for (const f of missing(id)) {
        const facts = await webFacts(info, info?.name ?? '', f, kw.get(f)!)
        const best = facts.find((x) => x.tone !== 'negative')
        if (best) add(id, f, best)
      }
    })
  }
  return result
}

/** Short card comment from confirmed evidence (≤ 110 chars, no prices). */
export function evidenceComment(c: FeatureConfirmation | undefined): string | undefined {
  if (!c) return undefined
  const fact = Object.values(c.evidence).find((f) => f.source === 'guests' && f.tone === 'positive') ?? Object.values(c.evidence)[0]
  if (!fact) return undefined
  const t = fact.text.replace(/^В отеле:\s*/i, '').replace(/[«»"]/g, '').trim()
  const prefix = fact.source === 'guests' ? 'Гости: ' : ''
  const body = t.length > 100 ? `${t.slice(0, 97)}…` : t
  return `${prefix}${body.charAt(0).toUpperCase()}${body.slice(1)}`
}
