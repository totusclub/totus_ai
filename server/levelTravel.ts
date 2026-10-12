import type { Tour } from './types.js'
import { maskPii } from './pii/detect.js'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE = process.env.LEVEL_TRAVEL_BASE_URL || 'https://api.level.travel'
const VERSION = process.env.LEVEL_TRAVEL_API_VERSION || '3.7'
const PUBLIC_SITE = (process.env.LEVEL_TRAVEL_PUBLIC_URL || 'https://level.travel').replace(/\/$/, '')
const AFLT = process.env.LEVEL_TRAVEL_AFLT?.trim() || ''

/** Turn relative Level.Travel paths into public tour/hotel URLs. */
export function toPublicTourUrl(link?: string, tourId?: string) {
  if (link?.startsWith('http')) {
    return appendAflt(link)
  }
  if (link?.startsWith('/')) {
    return appendAflt(`${PUBLIC_SITE}${link}`)
  }
  // Numeric package ids only — hash-style offer ids are not public URLs
  if (tourId && /^\d+$/.test(tourId)) {
    return appendAflt(`${PUBLIC_SITE}/packages/${tourId}`)
  }
  return undefined
}

function appendAflt(url: string) {
  if (!AFLT) return url
  try {
    const u = new URL(url)
    if (!u.searchParams.has('aflt')) u.searchParams.set('aflt', AFLT)
    return u.toString()
  } catch {
    return url.includes('?') ? `${url}&aflt=${encodeURIComponent(AFLT)}` : `${url}?aflt=${encodeURIComponent(AFLT)}`
  }
}

export const BUILD_TAG = 'v40-pii-guard · 2026-10-12'

export function isLevelTravelEnabled() {
  const key = process.env.LEVEL_TRAVEL_API_KEY?.trim()
  return Boolean(key && !key.includes('your-partner') && key.length > 10)
}

export function levelTravelStatus() {
  return {
    enabled: isLevelTravelEnabled(),
    baseURL: BASE,
    version: VERSION,
  }
}

function apiKey() {
  let key = process.env.LEVEL_TRAVEL_API_KEY?.trim() ?? ''
  // Users sometimes paste the full header value
  key = key.replace(/^Authorization:\s*/i, '')
  key = key.replace(/^Token\s+token=/i, '')
  key = key.replace(/^Token\s+/i, '')
  key = key.replace(/^token=/i, '')
  key = key.replace(/^["']|["']$/g, '')
  return key.trim()
}

function headers(): Record<string, string> {
  return {
    Authorization: `Token token=${apiKey()}`,
    Accept: `application/vnd.leveltravel.v${VERSION}`,
    'User-Agent': 'TourAssistant/1.0',
  }
}

/**
 * Trace of every real HTTP call to Level.Travel — powers the "how requests
 * are formed" transparency block in the chat. Ring buffer, newest last.
 */
export type ApiCallTrace = { endpoint: string; params: string; ms: number; ts: number }
const apiTrace: ApiCallTrace[] = []
export function apiTraceLength() {
  return apiTrace.length
}
export function apiTraceSince(from: number): ApiCallTrace[] {
  return apiTrace.slice(from)
}
function recordTrace(entry: ApiCallTrace) {
  apiTrace.push(entry)
  if (apiTrace.length > 300) apiTrace.splice(0, apiTrace.length - 300)
}

async function ltGet<T = unknown>(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(path, BASE)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }
  const startedAt = Date.now()
  const paramsReadable = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .filter(([k]) => k !== 'request_id')
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
    .join(' · ')
  // A hung request used to freeze the whole answer; give up after 25 s.
  const res = await fetch(url, {
    headers: headers(),
    signal: AbortSignal.timeout(Number(process.env.LEVEL_TRAVEL_TIMEOUT_MS) || 25000),
  })
  recordTrace({
    endpoint: `GET api.level.travel${path}`,
    params: paramsReadable,
    ms: Date.now() - startedAt,
    ts: startedAt,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'message' in data
        ? String((data as { message: string }).message)
        : text.slice(0, 200)
    throw new Error(`Level.Travel ${res.status}: ${msg}`)
  }
  return data as T
}

export interface LevelSearchParams {
  from_city?: string
  to_country?: string
  to_city?: string
  nights?: number
  adults?: number
  kids?: number
  kids_ages?: number[]
  start_date?: string
  stars_from?: number
  stars_to?: number
  hotel_ids?: number[]
}

/** Destination / city aliases → ISO2 country (+ optional city) */
/**
 * Countries we deliberately do NOT sell. Removing them from the dictionary is
 * not enough: the country reference is loaded from Level.Travel at startup and
 * would bring them straight back. Everything here is filtered out of both
 * sources. Override with TOTUS_EXCLUDED_COUNTRIES in .env (comma-separated
 * ISO codes); pass an empty value to disable the filter entirely.
 */
const EXCLUDED_COUNTRIES = new Set(
  (process.env.TOTUS_EXCLUDED_COUNTRIES ??
    // France, Spain, Greece, Italy — every other destination stays available.
    'FR,ES,GR,IT')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
)

export function isExcludedCountry(code?: string): boolean {
  return Boolean(code && EXCLUDED_COUNTRIES.has(code.toUpperCase()))
}

const DESTINATION_MAP: Record<string, { country: string; city?: string; label: string }> = {
  turkey: { country: 'TR', label: 'Turkey' },
  турция: { country: 'TR', label: 'Turkey' },
  antalya: { country: 'TR', city: 'Antalya', label: 'Antalya' },
  анталья: { country: 'TR', city: 'Antalya', label: 'Antalya' },
  kemer: { country: 'TR', city: 'Kemer', label: 'Kemer' },
  кемер: { country: 'TR', city: 'Kemer', label: 'Kemer' },
  side: { country: 'TR', city: 'Side', label: 'Side' },
  сиде: { country: 'TR', city: 'Side', label: 'Side' },
  alanya: { country: 'TR', city: 'Alanya', label: 'Alanya' },
  аланья: { country: 'TR', city: 'Alanya', label: 'Alanya' },
  belek: { country: 'TR', city: 'Belek', label: 'Belek' },
  белек: { country: 'TR', city: 'Belek', label: 'Belek' },
  marmaris: { country: 'TR', city: 'Marmaris', label: 'Marmaris' },
  мармарис: { country: 'TR', city: 'Marmaris', label: 'Marmaris' },
  bodrum: { country: 'TR', city: 'Bodrum', label: 'Bodrum' },
  бодрум: { country: 'TR', city: 'Bodrum', label: 'Bodrum' },
  egypt: { country: 'EG', label: 'Egypt' },
  египет: { country: 'EG', label: 'Egypt' },
  hurghada: { country: 'EG', city: 'Hurghada', label: 'Hurghada' },
  хургада: { country: 'EG', city: 'Hurghada', label: 'Hurghada' },
  sharm: { country: 'EG', city: 'Sharm el-Sheikh', label: 'Sharm el-Sheikh' },
  'шарм-эль-шейх': { country: 'EG', city: 'Sharm el-Sheikh', label: 'Sharm el-Sheikh' },
  шарм: { country: 'EG', city: 'Sharm el-Sheikh', label: 'Sharm el-Sheikh' },
  uae: { country: 'AE', label: 'UAE' },
  оаэ: { country: 'AE', label: 'UAE' },
  dubai: { country: 'AE', city: 'Dubai', label: 'Dubai' },
  дубай: { country: 'AE', city: 'Dubai', label: 'Dubai' },
  thailand: { country: 'TH', label: 'Thailand' },
  таиланд: { country: 'TH', label: 'Thailand' },
  phuket: { country: 'TH', city: 'Phuket', label: 'Phuket' },
  пхукет: { country: 'TH', city: 'Phuket', label: 'Phuket' },
  pattaya: { country: 'TH', city: 'Pattaya', label: 'Pattaya' },
  паттайя: { country: 'TH', city: 'Pattaya', label: 'Pattaya' },
  vietnam: { country: 'VN', label: 'Vietnam' },
  вьетнам: { country: 'VN', label: 'Vietnam' },
  'nha trang': { country: 'VN', city: 'Nha Trang', label: 'Nha Trang' },
  нячанг: { country: 'VN', city: 'Nha Trang', label: 'Nha Trang' },
  cyprus: { country: 'CY', label: 'Cyprus' },
  кипр: { country: 'CY', label: 'Cyprus' },
  italy: { country: 'IT', label: 'Italy' },
  италия: { country: 'IT', label: 'Italy' },
  rome: { country: 'IT', city: 'Rome', label: 'Rome' },
  рим: { country: 'IT', city: 'Rome', label: 'Rome' },
  montenegro: { country: 'ME', label: 'Montenegro' },
  черногор: { country: 'ME', label: 'Montenegro' },
  india: { country: 'IN', label: 'India' },
  индия: { country: 'IN', label: 'India' },
  goa: { country: 'IN', city: 'Goa', label: 'Goa' },
  гоа: { country: 'IN', city: 'Goa', label: 'Goa' },
  'северный гоа': { country: 'IN', city: 'Goa', label: 'Goa' },
  'южный гоа': { country: 'IN', city: 'Goa', label: 'Goa' },
  maldives: { country: 'MV', label: 'Maldives' },
  мальдив: { country: 'MV', label: 'Maldives' },
  bali: { country: 'ID', city: 'Bali', label: 'Bali' },
  бали: { country: 'ID', city: 'Bali', label: 'Bali' },
  tunisia: { country: 'TN', label: 'Tunisia' },
  тунис: { country: 'TN', label: 'Tunisia' },
}

/**
 * Destination countries Level.Travel actually sells package tours to, loaded
 * from their own reference book at startup. Without it the static dictionary
 * was the only source of truth and ANY unknown destination silently fell back
 * to Turkey — a request for Japan returned Turkish hotels.
 */
/** Destination Level.Travel does not sell package tours to. */
export class UnsupportedDestinationError extends Error {
  constructor(public readonly destination: string) {
    super(`Направление не найдено в справочнике: ${destination}`)
    this.name = 'UnsupportedDestinationError'
  }
}

const countriesFromApi = new Map<string, { country: string; city?: string; label: string }>()

export async function loadCountries(): Promise<number> {
  if (!isLevelTravelEnabled()) return 0
  try {
    const data = await ltGet<unknown>('/references/countries', {})
    const root = asRecord(data) ?? {}
    const list: unknown[] = Array.isArray(data)
      ? data
      : (['countries', 'data', 'results', 'items'] as const)
          .map((k) => root[k])
          .find((v): v is unknown[] => Array.isArray(v)) ?? []
    for (const item of list) {
      const rec = asRecord(item)
      if (!rec) continue
      const code = pickString(rec.iso2, rec.code, rec.alpha2, rec.id).toUpperCase()
      const label = pickString(rec.name_en, rec.name, rec.title) || code
      if (!code || code.length !== 2) continue
      // Excluded destinations must not come back through the reference book.
      if (isExcludedCountry(code)) continue
      for (const alias of [rec.name_ru, rec.name, rec.name_en, rec.title, code]) {
        const a = pickString(alias)
        if (a) {
          countriesFromApi.set(a.toLowerCase().replace(/ё/g, 'е').trim(), { country: code, label })
        }
      }
    }
    if (countriesFromApi.size) {
      const codes = new Set([...countriesFromApi.values()].map((v) => v.country))
      console.log(
        `[level.travel] countries reference loaded: ${codes.size} стран, ${countriesFromApi.size} названий`,
      )
    }
    return countriesFromApi.size
  } catch (err) {
    console.warn(`[level.travel] countries reference unavailable: ${String(err)}`)
    return 0
  }
}

/** Countries we can actually search — for diagnostics and for the assistant. */
export function supportedCountries(): { country: string; label: string }[] {
  const byCode = new Map<string, { country: string; label: string }>()
  for (const v of countriesFromApi.values()) byCode.set(v.country, v)
  if (!byCode.size) {
    for (const v of Object.values(DESTINATION_MAP)) {
      if (!byCode.has(v.country)) byCode.set(v.country, { country: v.country, label: v.label })
    }
  }
  return [...byCode.values()]
    .filter((c) => !isExcludedCountry(c.country))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function resolveDestination(input?: string) {
  if (!input?.trim()) return null
  const q = input.trim().toLowerCase()
  if (/^[a-z]{2}$/i.test(q)) {
    const code = q.toUpperCase()
    return isExcludedCountry(code) ? null : { country: code, label: code }
  }
  // Whole-string match against Level.Travel's country reference. Checked after
  // the static map's resort entries below would be wrong, so it is only an
  // exact match here — a resort name must still win over its country.
  const apiExact = countriesFromApi.get(q.replace(/ё/g, 'е'))
  if (apiExact) return isExcludedCountry(apiExact.country) ? null : apiExact
  // Collect ALL dictionary hits and pick the MOST SPECIFIC one: a resort/city
  // must beat a country. Previously the loop returned the first match, so
  // "Кемер, Турция" matched "турция" before "кемер" and the resort was
  // silently dropped — the search widened to the whole country and returned
  // hotels from Istanbul for a Kemer request.
  const hits: { key: string; val: { country: string; city?: string; label: string } }[] = []
  for (const [key, val] of Object.entries(DESTINATION_MAP)) {
    if (q.includes(key) || key.includes(q)) hits.push({ key, val })
  }
  if (hits.length) {
    const withCity = hits.filter((h) => h.val.city)
    const pool = withCity.length ? withCity : hits
    // Longest matching key = most specific entry.
    pool.sort((a, b) => b.key.length - a.key.length)
    const best = pool[0].val
    return isExcludedCountry(best.country) ? null : best
  }
  // Hotel/brand names must NOT be sent to Level.Travel as a city — that
  // breaks the search (to_city="Rixos Sungate" returns garbage). They are
  // handled via the hotelName filter over the full destination results.
  if (looksLikeHotelName(q)) return null
  // Anything still unknown is NOT silently turned into a Turkish city — that
  // is how "Япония" became to_city="Япония" in Turkey and produced nonsense.
  // Unknown destinations are reported as unsupported instead.
  return null
}

const HOTEL_BRAND_RE =
  /hotel|отел|resort|rixos|hilton|marriott|hyatt|radisson|swissotel|selectum|calista|maxx royal|voyage|titanic|delphin|barut|cornelia|regnum|gloria|kaya|papillon|adalya|crystal|limak|miracle|amara|akra|jaz|steigenberger|sunrise|albatros|pickalbatros|savoy|baron|serry|iberotel/i

/** True when the string looks like a hotel or brand name rather than a place. */
export function looksLikeHotelName(s: string): boolean {
  return HOTEL_BRAND_RE.test(s.trim().toLowerCase())
}

const NAME_STOPWORDS = new Set([
  'отель', 'отели', 'отеля', 'отелей', 'hotel', 'hotels', 'в', 'и', 'на', 'the', 'of',
  'турции', 'турция', 'turkey', 'египте', 'египет', 'egypt', 'оаэ', 'uae',
  'сеть', 'сети', 'бренд', 'семейство', 'все',
])

/** Tokenized hotel-name match: query «отели Rixos в Турции» → token [rixos];
 *  «Rixos Premium Belek» → all three tokens must be present. */
/**
 * Level.Travel keeps the FORMER name in the title:
 * "Mardan Palace (Ex. Titanic Mardan Palace)". Matching a brand family against
 * that part produced false positives — a hotel that LEFT the brand was still
 * shown as part of it. So brand matching looks at the current name only.
 */
export function stripFormerName(hotelName: string): string {
  return hotelName
    .replace(/\((?:\s*)ex[.\s:]*[^)]*\)/gi, ' ')
    .replace(/\[(?:\s*)ex[.\s:]*[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchesHotelName(
  hotelName: string,
  query: string,
  opts: { includeFormerName?: boolean } = {},
): boolean {
  const name = (opts.includeFormerName ? hotelName : stripFormerName(hotelName)).toLowerCase()
  const tokens = query
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t))
  if (!tokens.length) return true
  return tokens.every((t) => name.includes(t))
}

/** Departure city aliases → Level.Travel name_en */
/** Can we actually search this destination? Prevents searching where there is nothing. */
export function isSupportedDestination(input?: string): boolean {
  if (!input?.trim()) return false
  return Boolean(resolveDestination(input))
}

const FROM_CITY_MAP: Record<string, string> = {
  moscow: 'Moscow',
  москва: 'Moscow',
  // Level.Travel writes compound city names with DOTS, not spaces:
  // St.Petersburg, Krasnaya.Polyana, Kaliningrad.region. Sending
  // "Saint Petersburg" made every operator skip the search and it finished
  // in 0.3s with zero hotels.
  'saint petersburg': 'St.Petersburg',
  'st petersburg': 'St.Petersburg',
  'st. petersburg': 'St.Petersburg',
  'st.petersburg': 'St.Petersburg',
  'санкт-петербург': 'St.Petersburg',
  'санкт петербург': 'St.Petersburg',
  петербург: 'St.Petersburg',
  питер: 'St.Petersburg',
  спб: 'St.Petersburg',
  kazan: 'Kazan',
  казань: 'Kazan',
  yekaterinburg: 'Yekaterinburg',
  ekaterinburg: 'Yekaterinburg',
  екатеринбург: 'Yekaterinburg',
  novosibirsk: 'Novosibirsk',
  новосибирск: 'Novosibirsk',
  sochi: 'Sochi',
  сочи: 'Sochi',
  samara: 'Samara',
  самара: 'Samara',
  krasnodar: 'Krasnodar',
  краснодар: 'Krasnodar',
  rostov: 'Rostov-on-Don',
  'rostov-on-don': 'Rostov-on-Don',
  'ростов-на-дону': 'Rostov-on-Don',
  ростов: 'Rostov-on-Don',
}

/**
 * Departure cities fetched from Level.Travel's own reference book, so the exact
 * API spelling never has to be guessed again (that guessing is what broke
 * Saint Petersburg). Populated in the background at startup; the static
 * FROM_CITY_MAP stays as a fallback.
 */
const departuresFromApi = new Map<string, string>()

export async function loadDepartures(): Promise<number> {
  if (!isLevelTravelEnabled()) return 0
  try {
    const data = await ltGet<unknown>('/references/departures', {})
    const root = asRecord(data) ?? {}
    const list: unknown[] = Array.isArray(data)
      ? data
      : (['departures', 'cities', 'data', 'results'] as const)
          .map((k) => root[k])
          .find((v): v is unknown[] => Array.isArray(v)) ?? []
    for (const item of list) {
      const rec = asRecord(item)
      if (!rec) continue
      // The value the search API expects (e.g. "St.Petersburg")
      const apiName = pickString(rec.name, rec.name_en, rec.code, rec.id)
      if (!apiName) continue
      for (const alias of [rec.name_ru, rec.name, rec.name_en, rec.title]) {
        const a = pickString(alias)
        if (a) departuresFromApi.set(a.toLowerCase().replace(/ё/g, 'е'), apiName)
      }
    }
    if (departuresFromApi.size) {
      console.log(`[level.travel] departures reference loaded: ${departuresFromApi.size} aliases`)
    }
    return departuresFromApi.size
  } catch (err) {
    console.warn(`[level.travel] departures reference unavailable: ${String(err)}`)
    return 0
  }
}

export function resolveFromCity(input?: string) {
  if (!input?.trim()) return 'Moscow'
  const q = input.trim().toLowerCase().replace(/ё/g, 'е')
  // 1) Exact alias from Level.Travel's own reference book
  const fromApi = departuresFromApi.get(q)
  if (fromApi) return fromApi
  // 2) Static map
  if (FROM_CITY_MAP[q]) return FROM_CITY_MAP[q]
  for (const [key, val] of Object.entries(FROM_CITY_MAP)) {
    if (q.includes(key) || key.includes(q)) return val
  }
  // 3) Partial match against the reference book
  for (const [alias, val] of departuresFromApi) {
    if (q.includes(alias) || alias.includes(q)) return val
  }
  // 4) Already an English name — normalise spaces to dots, as Level.Travel does
  if (/^[a-z\s.\-]+$/i.test(input.trim())) return input.trim().replace(/\s+/g, '.')
  return 'Moscow'
}

function defaultStartDate(daysAhead = 21) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function pickNumber(...vals: unknown[]) {
  for (const v of vals) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

function pickString(...vals: unknown[]) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

const tourCache = new Map<string, Tour>()
const hotelCache = new Map<number, HotelInfo>()
const offerCache = new Map<string, Record<string, unknown>>()

export interface HotelBeachInfo {
  type?: string
  surface?: string
  surface_ru?: string
  line?: number
  distance_m?: number
  first_line?: boolean
}

/**
 * Meal codes are jargon. Customers see plain Russian instead — the codes
 * never reach the chat, the cards or the hotel comments.
 */
export const MEAL_LABELS: Record<string, string> = {
  UAI: 'Ультра всё включено',
  'UAI+': 'Ультра всё включено',
  AI: 'Всё включено',
  'AI+': 'Всё включено',
  AIP: 'Всё включено',
  FB: 'Полный пансион',
  'FB+': 'Полный пансион',
  HB: 'Полупансион',
  'HB+': 'Полупансион',
  BB: 'Завтраки',
  RO: 'Без питания',
  OB: 'Без питания',
  SC: 'Без питания',
}

export function mealLabel(code: string): string {
  const key = code.trim().toUpperCase()
  return MEAL_LABELS[key] ?? code.trim()
}

export interface HotelInfo {
  hotel_id: number
  name: string
  stars: number
  rating: number
  review_count: number
  city: string
  region: string
  country: string
  beach?: HotelBeachInfo
  features: Record<string, unknown>
  description: string
  images: string[]
  meal_prices?: Record<string, number>
  min_price?: number
  currency?: string
  cheapest_tour_id?: string
  link?: string
  lat?: number
  lng?: number
  tour_card_id?: string
  /** Rich data from the hotel reference book (facilities, real description) */
  facilities?: string[]
  enriched?: boolean
}

export function getCachedTour(id: string) {
  return tourCache.get(id)
}

export function getCachedHotel(hotelId: number) {
  return hotelCache.get(hotelId)
}

export function getCachedOffer(tourId: string) {
  return offerCache.get(tourId)
}

export function cacheTours(tours: Tour[]) {
  for (const t of tours) tourCache.set(t.id, t)
}

export function cacheHotel(info: HotelInfo) {
  hotelCache.set(info.hotel_id, info)
}

function beachSurfaceRu(surface?: string) {
  const s = (surface || '').toUpperCase()
  if (s.includes('SAND') && s.includes('PEBBLE')) return 'песчано-галечный'
  if (s.includes('SAND')) return 'песчаный'
  if (s.includes('PEBBLE') || s.includes('STONE')) return 'галечный'
  if (s.includes('PLATFORM') || s.includes('CONCRETE')) return 'платформа'
  return undefined
}

/** 1 ночь / 2 ночи / 5 ночей */
function formatNightsRu(nights: number): string {
  const n = Math.abs(Math.trunc(nights))
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ночь`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ночи`
  return `${n} ночей`
}

function mapHotelToTour(
  entry: unknown,
  fallbackDest: string,
  nights: number,
  startDate: string,
  currency = 'RUB',
): Tour | null {
  const row = asRecord(entry)
  if (!row) return null
  const hotel = asRecord(row.hotel) ?? row
  const idNum = Number(hotel.id ?? hotel.hotel_id ?? row.hotel_id)
  if (!Number.isFinite(idNum) || idNum <= 0) return null

  const name = pickString(hotel.name, hotel.name_en, hotel.name_ru, hotel.title, `Hotel ${idNum}`)
  const city = pickString(hotel.city, hotel.city_name, fallbackDest)
  const region = pickString(hotel.region_name, hotel.region, city)
  const country = pickString(hotel.country, hotel.country_name, hotel.country_iso, '')
  const destination = [region || city, country].filter(Boolean).join(', ') || fallbackDest
  const price = pickNumber(
    row.min_price,
    row.analytics_min_price,
    row.price,
    hotel.min_price,
    hotel.price,
  )
  const images: string[] = []
  if (Array.isArray(hotel.images)) {
    for (const img of hotel.images) {
      if (typeof img === 'string' && img) images.push(img)
      else {
        const rec = asRecord(img)
        const url = pickString(
          rec?.url,
          rec?.src,
          rec?.x500,
          rec?.x620,
          rec?.webp_x620,
          rec?.large,
          rec?.medium,
          rec?.small,
          ...Object.values(rec ?? {}).filter((v): v is string => typeof v === 'string' && v.startsWith('http')),
        )
        if (url) images.push(url)
      }
    }
  }
  const image = pickString(hotel.image, hotel.image_url, hotel.main_image, images[0])
  if (image && !images.includes(image)) images.unshift(image)

  const rawRating = pickNumber(hotel.rating, row.rating)
  const rating = rawRating > 5 ? Math.round((rawRating / 2) * 10) / 10 : rawRating
  const reviewCount = Math.floor(pickNumber(hotel.reviews_count, hotel.review_count, row.reviews_count))
  const stars = pickNumber(hotel.stars, hotel.star_rating, row.stars) || 0

  const featRec = asRecord(hotel.features) ?? {}
  const beachSurface = pickString(featRec.beach_surface, featRec.beachSurface)
  const beachType = pickString(featRec.beach_type, featRec.beachType)
  const beachLine = pickNumber(featRec.line, featRec.beach_line)
  const beachDistance = pickNumber(featRec.beach_distance, featRec.beachDistance)
  const surfaceRu = beachSurfaceRu(beachSurface)
  const beach: HotelBeachInfo | undefined =
    beachSurface || beachType || beachLine || beachDistance
      ? {
          type: beachType || undefined,
          surface: beachSurface || undefined,
          surface_ru: surfaceRu,
          line: beachLine || undefined,
          distance_m: beachDistance || undefined,
          first_line: beachLine === 1,
        }
      : undefined

  const mealPricesRaw = asRecord(row.pansion_prices)
  const meal_prices = mealPricesRaw
    ? Object.fromEntries(
        Object.entries(mealPricesRaw).filter(([, v]) => typeof v === 'number' && v > 0) as [
          string,
          number,
        ][],
      )
    : undefined

  const cheapestTourId = pickString(row.tour_id, row.offer_id, hotel.tour_id)
  const rawLink = pickString(hotel.link, row.link, row.package_link)
  const publicUrl = toPublicTourUrl(rawLink, cheapestTourId)

  const featureLabels: string[] = []
  if (surfaceRu) featureLabels.push(`пляж: ${surfaceRu}`)
  if (beachLine === 1) featureLabels.push('1-я линия')
  else if (beachDistance) featureLabels.push(`${beachDistance} м до моря`)
  if (featRec.wi_fi === 'FREE' || featRec.wifi === 'FREE') featureLabels.push('Wi‑Fi бесплатно')
  for (const [k, v] of Object.entries(featRec)) {
    if (['beach_surface', 'beach_type', 'line', 'beach_distance', 'wi_fi', 'wifi', 'airport_distance', 'distance_to_city_center'].includes(k)) {
      continue
    }
    if (v === true || v === 'YES' || v === 'FREE') featureLabels.push(k.replace(/_/g, ' '))
  }

  const descParts = [
    stars ? `${stars}★ отель` : '',
    region || city ? `в ${region || city}` : '',
    ...featureLabels.slice(0, 4),
  ].filter(Boolean)

  const desc = pickString(
    hotel.description,
    hotel.short_description,
    descParts.join(' · ') || `${name} — пакет Level.Travel, ${nights} ночей`,
  )

  const emoji = stars >= 5 ? '🏨' : stars >= 4 ? '✈️' : '🌴'
  const tourId = `lt_${idNum}`
  const link = publicUrl || toPublicTourUrl(rawLink) || undefined

  let available_dates: string[] = []
  if (Array.isArray(row.dates)) {
    available_dates = row.dates
      .map((d) => {
        if (typeof d === 'string') return d
        const rec = asRecord(d)
        return pickString(rec?.date, rec?.start_date, rec?.from)
      })
      .filter(Boolean)
  } else if (asRecord(row.dates)) {
    available_dates = Object.keys(asRecord(row.dates)!)
  }
  if (!available_dates.length) available_dates = [startDate]

  const nightsFromPrice = pickNumber(row.min_price_nights) || nights
  // Plain Russian, no prices: the card already shows the price, and repeating
  // it here duplicated the number and looked like jargon ("UAI от 436628").
  const mealHint = meal_prices
    ? [
        ...new Set(
          Object.entries(meal_prices)
            .sort((a, b) => a[1] - b[1])
            .map(([m]) => mealLabel(m)),
        ),
      ]
        .slice(0, 2)
        .join(' · ')
    : ''
  const inclusions = [
    ...featureLabels.slice(0, 8),
    mealHint,
    // Raw supplier URL is never shown to the customer — the card already has
    // a proper booking button.

  ].filter(Boolean)

  const hotelInfo: HotelInfo = {
    hotel_id: idNum,
    name,
    stars,
    rating: rawRating || rating,
    review_count: reviewCount,
    city,
    region,
    country,
    beach,
    features: featRec,
    description: desc.slice(0, 800),
    images,
    meal_prices,
    min_price: price || undefined,
    currency,
    cheapest_tour_id: cheapestTourId || undefined,
    link: link || undefined,
    lat: Number(hotel.lat ?? hotel.latitude ?? 0) || undefined,
    lng: Number(hotel.long ?? hotel.lng ?? hotel.longitude ?? 0) || undefined,
    tour_card_id: tourId,
  }
  cacheHotel(hotelInfo)
  if (cheapestTourId) {
    offerCache.set(cheapestTourId, {
      tour_id: cheapestTourId,
      hotel_id: idNum,
      price,
      currency,
      source: 'grouped_hotels',
    })
  }

  const tour: Tour = {
    id: tourId,
    name,
    destination,
    description: desc.slice(0, 500),
    price: price || 0,
    currency,
    duration: formatNightsRu(nightsFromPrice),
    duration_hours: nightsFromPrice * 24,
    max_group_size: 4,
    rating,
    review_count: reviewCount,
    stars,
    category: 'relaxation',
    images,
    emoji,
    itinerary: [
      {
        time: 'Package',
        title: name,
        description: `Пакетный тур · ${nightsFromPrice} ночей · от ${price} ${currency}`,
      },
      {
        time: 'Hotel',
        // Hotel entry must show the HOTEL NAME. The city lives in the
        // description line (it used to be the other way around — the page
        // displayed "Дахаб" as the hotel).
        title: name,
        description: desc.slice(0, 240),
      },
    ],
    inclusions: inclusions.length ? inclusions : ['Проживание по пакету Level.Travel'],
    exclusions: [],
    meeting_point: {
      address: destination,
      lat: hotelInfo.lat ?? 0,
      lng: hotelInfo.lng ?? 0,
    },
    cancellation_policy: pickString(
      typeof row.cancellation_policy === 'string'
        ? row.cancellation_policy
        : asRecord(row.cancellation_policy)?.description,
      asRecord(row.cancellation_policy)?.text,
      'Условия отмены — по правилам туроператора Level.Travel',
    ),
    guide_languages: ['Russian', 'English'],
    available_dates: available_dates.slice(0, 20),
    reviews: [],
  }
  return tour
}

async function enqueue(params: LevelSearchParams) {
  const kidsAges = params.kids_ages?.length ? params.kids_ages.join(',') : undefined
  const hotelIds = params.hotel_ids?.length ? params.hotel_ids.join(',') : undefined
  return ltGet<{ request_id?: string; success?: boolean }>('/search/enqueue', {
    search_type: 'package',
    from_city: params.from_city || 'Moscow',
    to_country: params.to_country || 'TR',
    to_city: params.to_city,
    nights: params.nights ?? 7,
    adults: params.adults ?? 2,
    kids: params.kids ?? (params.kids_ages?.length || undefined),
    kids_ages: kidsAges,
    start_date: params.start_date || defaultStartDate(),
    stars_from: params.stars_from,
    stars_to: params.stars_to,
    hotel_ids: hotelIds,
  })
}

/** Operator statuses that mean "still working" per Level.Travel API. */
const ACTIVE_STATUSES = new Set(['pending', 'performing'])
/** Terminal operator statuses — the search is over for that operator. */
const TERMINAL_STATUSES = new Set([
  'completed',
  'cached',
  'no_results',
  'skipped',
  'failed',
  'all_filtered',
])

/**
 * Poll /search/status until the search is REALLY finished for all operators.
 * Rules (fixes premature stop that caused incomplete hotel/room lists):
 * - keep polling while ANY operator is pending/performing;
 * - stop ONLY when completeness >= 100 OR every operator is in a terminal
 *   status (completed, cached, no_results, skipped, failed, all_filtered);
 * - never stop just because the first operator turned completed/cached;
 * - hard caps: maxWaitMs and MAX_POLLS guard against endless polling.
 */
async function waitForSearch(requestId: string, maxWaitMs = 60000) {
  const started = Date.now()
  const MAX_POLLS = 30
  let polls = 0
  let lastStatus: Record<string, string> = {}
  while (Date.now() - started < maxWaitMs && polls < MAX_POLLS) {
    polls++
    const data = await ltGet<{
      status?: Record<string, string>
      completeness?: number
      success?: boolean
    }>('/search/status', { request_id: requestId })
    lastStatus = data.status ?? {}
    const values = Object.values(lastStatus).map((s) => String(s).toLowerCase())
    if (!values.length) {
      await sleep(1000)
      continue
    }
    const completeness = Number(data.completeness)
    const anyActive = values.some((s) => ACTIVE_STATUSES.has(s))
    const allTerminal = values.every((s) => TERMINAL_STATUSES.has(s))
    if (Number.isFinite(completeness) && completeness >= 100) break
    if (!anyActive && allTerminal) break
    await sleep(2000)
  }
  return lastStatus
}

async function getGroupedHotels(
  requestId: string,
  operatorIds: string[] = [],
  extra: Record<string, string | number> = {},
) {
  const params: Record<string, string | number | undefined> = { request_id: requestId, ...extra }
  if (operatorIds.length) params.operator_ids = operatorIds.join(',')
  return ltGet<{ hotels?: unknown[]; success?: boolean }>('/search/get_grouped_hotels', params)
}

/* Level.Travel list filters.
 * The same filters the site sidebar sends to /search/get_grouped_hotels
 * (filter_aquapark, filter_regions, filter_meals …). Level.Travel filters the
 * WHOLE result set on its side, so an amenity request such as «с аквапарком»
 * returns every matching hotel instead of whatever happened to be on the first
 * (cheapest) page. Option ids are taken from the `filters` facets of the same
 * search, so we only ever send values Level.Travel itself offered.
 */

/** Boolean amenity filters (filter_<key>=true). */
export const LT_AMENITY_KEYS = [
  'aquapark',
  'pool',
  'kids_pool',
  'heated_pool',
  'kids_club',
  'kids_menu',
  'nanny',
  'aircon',
  'parking',
  'bar',
  'massage',
  'thermal_fun',
  'adults_only',
  'no_single_men',
  'direct_flight',
] as const
export type LtAmenity = (typeof LT_AMENITY_KEYS)[number]

const LT_AMENITY_LABELS: Record<LtAmenity, string> = {
  aquapark: 'аквапарк',
  pool: 'бассейн',
  kids_pool: 'детский бассейн',
  heated_pool: 'подогреваемый бассейн',
  kids_club: 'детский клуб',
  kids_menu: 'детское меню',
  nanny: 'няня',
  aircon: 'кондиционер',
  parking: 'парковка',
  bar: 'бар',
  massage: 'массаж',
  thermal_fun: 'термальные процедуры',
  adults_only: 'только для взрослых',
  no_single_men: 'без одиноких мужчин',
  direct_flight: 'прямой перелёт',
}

/** Russian feature names the assistant uses → Level.Travel amenity filter. */
const FEATURE_TO_AMENITY: Record<string, LtAmenity> = {
  аквапарк: 'aquapark',
  'водные горки': 'aquapark',
  горки: 'aquapark',
  бассейн: 'pool',
  'детский бассейн': 'kids_pool',
  'подогреваемый бассейн': 'heated_pool',
  'бассейн с подогревом': 'heated_pool',
  'детский клуб': 'kids_club',
  'мини-клуб': 'kids_club',
  'детское меню': 'kids_menu',
  няня: 'nanny',
  кондиционер: 'aircon',
  парковка: 'parking',
  бар: 'bar',
  массаж: 'massage',
  'термальные процедуры': 'thermal_fun',
  хаммам: 'thermal_fun',
  сауна: 'thermal_fun',
  'только для взрослых': 'adults_only',
  'без одиноких мужчин': 'no_single_men',
  'прямой перелёт': 'direct_flight',
  'прямой перелет': 'direct_flight',
}
const WIFI_FEATURES = new Set(['wifi', 'wi-fi', 'бесплатный wifi', 'бесплатный wi-fi', 'вайфай'])

/**
 * Split the assistant's `features` into what Level.Travel can filter itself
 * and what is left for the text-based soft filter (анимация, спа, теннис…).
 */
export function splitFeatures(features: string[] = []) {
  const amenities = new Set<LtAmenity>()
  const rest: string[] = []
  let wifiFree = false
  for (const raw of features) {
    const key = String(raw ?? '').trim().toLowerCase()
    if (!key) continue
    const amenity = FEATURE_TO_AMENITY[key] ?? FEATURE_TO_AMENITY[key.replace(/ё/g, 'е')]
    if (amenity) amenities.add(amenity)
    else if (WIFI_FEATURES.has(key)) wifiFree = true
    else rest.push(key)
  }
  return { amenities: [...amenities], wifiFree, rest }
}

/** Food codes the assistant sends → every Level.Travel meal id of that family. */
const MEAL_FAMILIES: Record<string, string[]> = {
  RO: ['RO'],
  BB: ['BB', 'BB2'],
  HB: ['HB', 'HBD', 'HB+', 'HBL'],
  FB: ['FB', 'FB+'],
  AI: ['AI', 'AI24', 'AIP'],
  UAI: ['UAI'],
  AIL: ['AIL'],
  AI24: ['AI24'],
  AIP: ['AIP'],
}

const BEACH_SURFACE_IDS: Record<string, string[]> = {
  песчаный: ['SAND'],
  галечный: ['PEBBLE'],
  'песчано-галечный': ['SAND+PEBBLE', 'SAND_PEBBLE'],
  платформа: ['PLATFORM', 'CONCRETE'],
  коралловый: ['CORAL'],
}

/**
 * Resort nicknames and villages → the Level.Travel region they belong to.
 * Level.Travel groups Lara under Antalya, Tekirova under Kemer and so on.
 */
const REGION_ALIASES: Record<string, string> = {
  lara: 'анталья',
  лара: 'анталья',
  конъяалты: 'анталья',
  коньяалты: 'анталья',
  konyaalti: 'анталья',
  antalya: 'анталья',
  kemer: 'кемер',
  бельдиби: 'кемер',
  гейнюк: 'кемер',
  кириш: 'кемер',
  текирова: 'кемер',
  чамьюва: 'кемер',
  alanya: 'аланья',
  махмутлар: 'аланья',
  конаклы: 'аланья',
  авсаллар: 'аланья',
  тюрклер: 'аланья',
  окурджалар: 'аланья',
  side: 'сиде',
  манавгат: 'сиде',
  колаклы: 'сиде',
  чолаклы: 'сиде',
  кизилот: 'сиде',
  кызылот: 'сиде',
  эвренсеки: 'сиде',
  belek: 'белек',
  богазкент: 'белек',
  кадрие: 'белек',
  bodrum: 'бодрум',
  marmaris: 'мармарис',
  fethiye: 'фетхие',
  istanbul: 'стамбул',
  hurghada: 'хургада',
  sharm: 'шарм-эль-шейх',
  шарм: 'шарм-эль-шейх',
}

function normName(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim()
}

type FacetOption = { id: unknown; name?: unknown; rest_type?: unknown; hotel_count?: unknown }

function facetOptions(facets: Record<string, unknown> | null, key: string): FacetOption[] {
  const list = facets?.[key]
  if (!Array.isArray(list)) return []
  return list.filter((o): o is FacetOption => Boolean(o) && typeof o === 'object')
}

function facetIds(facets: Record<string, unknown> | null, key: string) {
  return facetOptions(facets, key)
    .filter((o) => Number(o.hotel_count ?? 1) > 0)
    .map((o) => String(o.id))
}

export interface LtFilterRequest {
  starsFrom?: number
  starsTo?: number
  mealTypes?: string[]
  firstLine?: boolean
  beachLines?: number[]
  beachTypes?: string[]
  beachType?: string
  minRating?: number
  priceMin?: number
  priceMax?: number
  amenities?: string[]
  features?: string[]
  resorts?: string[]
  restType?: string
  hotelTypes?: string[]
  categories?: string[]
  wifiFree?: boolean
  instantConfirm?: boolean
}

/** Does the request contain anything Level.Travel can filter on its side? */
export function hasLtFilterRequest(input: LtFilterRequest) {
  const split = splitFeatures(input.features)
  return Boolean(
    input.amenities?.length ||
      split.amenities.length ||
      split.wifiFree ||
      input.wifiFree ||
      input.resorts?.length ||
      input.restType ||
      input.mealTypes?.length ||
      input.firstLine ||
      input.beachLines?.length ||
      input.beachTypes?.length ||
      input.beachType ||
      input.hotelTypes?.length ||
      input.categories?.length ||
      input.instantConfirm ||
      (input.minRating && input.minRating > 0) ||
      input.starsFrom ||
      input.starsTo ||
      (input.priceMax && input.priceMax > 10000),
  )
}

/**
 * Turn the assistant's request into Level.Travel filter_* params, using only
 * option ids present in this search's facets. Returns human labels of what was
 * applied and of what could not be (no such option in this search) so the
 * assistant can report both honestly.
 */
export function buildLtFilterParams(
  input: LtFilterRequest,
  facetsRaw: unknown,
): { params: Record<string, string | number>; applied: string[]; unavailable: string[] } {
  const facets = asRecord(facetsRaw) ?? null
  const params: Record<string, string | number> = {}
  const applied: string[] = []
  const unavailable: string[] = []

  // Amenities (aquapark, kids club …)
  const split = splitFeatures(input.features)
  const amenities = new Set<string>([...(input.amenities ?? []), ...split.amenities])
  for (const a of amenities) {
    if (!(LT_AMENITY_KEYS as readonly string[]).includes(a)) continue
    const label = LT_AMENITY_LABELS[a as LtAmenity]
    const yes = facetOptions(facets, a).find((o) => o.id === true || String(o.id) === 'true')
    if (yes && Number(yes.hotel_count ?? 0) > 0) {
      params[`filter_${a}`] = 'true'
      applied.push(label)
    } else {
      unavailable.push(label)
    }
  }

  if (input.wifiFree || split.wifiFree) {
    if (facetIds(facets, 'wifi').includes('FREE')) {
      params.filter_wifi = 'FREE'
      applied.push('бесплатный Wi-Fi')
    } else unavailable.push('бесплатный Wi-Fi')
  }

  // Resorts / regions inside the country
  const regions = facetOptions(facets, 'regions').filter((o) => Number(o.hotel_count ?? 1) > 0)
  if (input.resorts?.length) {
    const ids: string[] = []
    const names: string[] = []
    for (const raw of input.resorts) {
      const q = normName(String(raw ?? ''))
      if (!q) continue
      const target = REGION_ALIASES[q] ? normName(REGION_ALIASES[q]) : q
      const hit = regions.find((r) => {
        const n = normName(String(r.name ?? ''))
        if (!n) return false
        if (n === target) return true
        return target.length >= 4 && (n.startsWith(target) || target.startsWith(n))
      })
      if (hit) {
        if (!ids.includes(String(hit.id))) {
          ids.push(String(hit.id))
          names.push(String(hit.name))
        }
      } else unavailable.push(`курорт «${String(raw).trim()}»`)
    }
    if (ids.length) {
      params.filter_regions = ids.join(',')
      applied.push(`курорты: ${names.join(', ')}`)
    }
  } else if (input.restType) {
    const ids = regions.filter((r) => r.rest_type === input.restType).map((r) => String(r.id))
    const label =
      input.restType === 'beach' ? 'только пляжные курорты' : input.restType === 'ski' ? 'горнолыжные курорты' : 'экскурсионные города'
    if (ids.length && ids.length < regions.length) {
      params.filter_regions = ids.join(',')
      applied.push(label)
    } else if (!ids.length) unavailable.push(label)
  }

  // Stars
  if (input.starsFrom || input.starsTo) {
    const from = input.starsFrom ?? 1
    const to = input.starsTo ?? 5
    const ids = facetIds(facets, 'stars').filter((id) => {
      const n = Number(id)
      return n > 0 && n >= from && n <= to
    })
    if (ids.length) {
      params.filter_stars = ids.join(',')
      applied.push(from === to ? `${from}★` : `${from}★${to < 5 ? `–${to}★` : ' и выше'}`)
    } else unavailable.push(`${from}★`)
  }

  // Meals
  if (input.mealTypes?.length) {
    const available = new Set(facetIds(facets, 'meals'))
    const ids = [
      ...new Set(
        input.mealTypes.flatMap((m) => MEAL_FAMILIES[String(m).toUpperCase()] ?? [String(m).toUpperCase()]),
      ),
    ].filter((id) => available.has(id))
    if (ids.length) {
      params.filter_meals = ids.join(',')
      // Level.Travel's own Russian names («Всё включено 24 часа»), never codes.
      const mealNames = new Map(facetOptions(facets, 'meals').map((o) => [String(o.id), String(o.name ?? '')]))
      const names = ids.map((id) => mealNames.get(id) || mealLabel(id)).filter((n) => !/^[A-Z0-9+]+$/.test(n))
      applied.push(`питание: ${[...new Set(names)].join(', ').toLowerCase()}`)
    } else unavailable.push('выбранный тип питания')
  }

  // Beach line
  const lines = new Set<number>(input.beachLines ?? [])
  if (input.firstLine) lines.add(1)
  if (lines.size) {
    const available = new Set(facetIds(facets, 'line'))
    const ids = [...lines].map(String).filter((id) => available.has(id))
    if (ids.length) {
      params.filter_line = ids.join(',')
      applied.push(ids.map((id) => `${id}-я линия`).join(', '))
    } else unavailable.push([...lines].map((l) => `${l}-я линия`).join(', '))
  }

  // Beach surface / beach type
  if (input.beachTypes?.length) {
    const available = new Set(facetIds(facets, 'beach_surface'))
    const ids = [
      ...new Set(input.beachTypes.flatMap((b) => BEACH_SURFACE_IDS[String(b).toLowerCase()] ?? [])),
    ].filter((id) => available.has(id))
    if (ids.length) {
      params.filter_beach_surface = ids.join(',')
      applied.push(`пляж: ${input.beachTypes.join(', ')}`)
    } else unavailable.push(`пляж: ${input.beachTypes.join(', ')}`)
  }
  if (input.beachType) {
    const id = input.beachType.toUpperCase()
    const label = id === 'DESIGNATED' ? 'собственный пляж' : 'общественный пляж'
    if (facetIds(facets, 'beach_type').includes(id)) {
      params.filter_beach_type = id
      applied.push(label)
    } else unavailable.push(label)
  }

  // Rating (Level.Travel facets are on a 10-point scale: «от 8»)
  if (input.minRating && input.minRating > 0) {
    const ids = facetIds(facets, 'rating')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n <= input.minRating!)
      .sort((a, b) => b - a)
    if (ids.length) {
      params.filter_rating = String(ids[0])
      applied.push(`рейтинг от ${ids[0]}`)
    }
  }

  // Hotel type (отель, вилла, апартаменты …)
  if (input.hotelTypes?.length) {
    const opts = facetOptions(facets, 'hotel_type').filter((o) => Number(o.hotel_count ?? 1) > 0)
    const hits = input.hotelTypes
      .map((t) => opts.find((o) => normName(String(o.name ?? '')) === normName(String(t))))
      .filter((o): o is FacetOption => Boolean(o))
    if (hits.length) {
      params.filter_hotel_type = [...new Set(hits.map((o) => String(o.id)))].join(',')
      applied.push(`тип: ${hits.map((o) => String(o.name)).join(', ')}`)
    } else unavailable.push(`тип размещения: ${input.hotelTypes.join(', ')}`)
  }

  // Category (для семьи / для пар / активный отдых)
  if (input.categories?.length) {
    const available = new Set(facetIds(facets, 'category'))
    const ids = input.categories.map((c) => String(c).toUpperCase()).filter((id) => available.has(id))
    const label = (id: string) => (id === 'FAMILY' ? 'для семьи' : id === 'COUPLES' ? 'для пар' : 'активный отдых')
    if (ids.length) {
      params.filter_category = ids.join(',')
      applied.push(`категория: ${ids.map(label).join(', ')}`)
    } else unavailable.push(`категория: ${input.categories.map((c) => label(String(c).toUpperCase())).join(', ')}`)
  }

  if (input.instantConfirm) {
    params.filter_instant_confirm = 'true'
    applied.push('мгновенное подтверждение')
  }

  // Budget in roubles (same units as hotel prices). Small numbers are ambiguous
  // («150» = thousands?) and stay with the local filter only.
  if (input.priceMax && input.priceMax > 10000) {
    const prices = asRecord(facets?.prices)
    const floor = Number(prices?.min)
    params.filter_price_max = Math.round(input.priceMax)
    params.filter_price_min = Math.round(
      input.priceMin && input.priceMin > 0 ? input.priceMin : Number.isFinite(floor) ? floor : 0,
    )
    applied.push(`до ${Math.round(input.priceMax).toLocaleString('ru-RU')} ₽`)
  }

  return { params, applied, unavailable }
}

export async function searchLevelTravelPackages(input: {
  destination?: string
  fromCity?: string
  nights?: number
  adults?: number
  kids?: number
  kidsAges?: number[]
  startDate?: string
  starsFrom?: number
  starsTo?: number
  priceMin?: number
  priceMax?: number
  minRating?: number
  beachTypes?: string[]
  firstLine?: boolean
  mealTypes?: string[]
  hotelName?: string
  hotelNames?: string[]
  features?: string[]
  /** Level.Travel amenity keys (aquapark, kids_club …), see LT_AMENITY_KEYS */
  amenities?: string[]
  /** Resorts inside the country (Кемер, Анталья …) → filter_regions */
  resorts?: string[]
  /** 'beach' — only beach regions (no Istanbul / Cappadocia for a sea holiday) */
  restType?: string
  beachLines?: number[]
  /** DESIGNATED (own beach) | PUBLIC */
  beachType?: string
  hotelTypes?: string[]
  /** FAMILY | COUPLES | ACTIVE */
  categories?: string[]
  wifiFree?: boolean
  instantConfirm?: boolean
  sortBy?: 'price' | 'rating' | 'stars'
  limit?: number
}): Promise<{
  tours: Tour[]
  hotels: HotelInfo[]
  source: 'level.travel'
  requestId?: string
  okOperators: string[]
  stats?: {
    raw: number
    afterName?: number
    featuresApplied?: boolean
    featuresMatched?: number
    assumedCountry?: string
    /** Filters Level.Travel applied on its side (human labels) */
    ltFiltersApplied?: string[]
    /** Requested filters this search has no option for (human labels) */
    ltFiltersUnavailable?: string[]
    /** Hotels matching the Level.Travel filters (whole result set, not a page) */
    ltHotelsCount?: number
    ltFilterError?: string
  }
}> {
  if (!isLevelTravelEnabled()) {
    throw new Error('LEVEL_TRAVEL_API_KEY is not configured')
  }

  const resolved = resolveDestination(input.destination)
  const searchingByHotelName = Boolean(input.hotelNames?.length || input.hotelName)
  if (!resolved && !searchingByHotelName) {
    // Silently substituting Turkey meant a request for Japan came back with
    // Turkish hotels. Better to say we don't sell that destination.
    throw new UnsupportedDestinationError(input.destination ?? '')
  }
  // Brand searches without a country ("отели Rixos") still need somewhere to
  // look; Turkey is the assumption, but it is REPORTED so the assistant can
  // say which country it searched instead of pretending it was asked for.
  const dest = resolved ?? { country: 'TR', label: 'Turkey' }
  const assumedCountry = resolved ? undefined : dest.label
  const nights = input.nights ?? 7
  const startDate = input.startDate || defaultStartDate()
  const kidsAges = input.kidsAges?.length ? input.kidsAges : undefined
  const kids = input.kids ?? kidsAges?.length ?? 0

  const enqueued = await enqueue({
    from_city: resolveFromCity(input.fromCity),
    to_country: dest.country,
    to_city: dest.city,
    nights,
    adults: input.adults ?? 2,
    kids: kids || undefined,
    kids_ages: kidsAges,
    start_date: startDate,
    stars_from: input.starsFrom,
    stars_to: input.starsTo,
  })

  const enq = asRecord(enqueued) ?? {}
  const requestId = pickString(
    enq.request_id,
    enq.requestId,
    asRecord(enq.data)?.request_id,
  )
  if (!requestId) {
    throw new Error(
      `Level.Travel enqueue did not return request_id: ${JSON.stringify(enqueued).slice(0, 300)}`,
    )
  }

  const status = await waitForSearch(requestId)
  const okOperators = Object.entries(status)
    .filter(([, st]) => {
      const v = String(st).toLowerCase()
      // Result-bearing terminal statuses per Level.Travel vocabulary
      // (legacy synonyms kept for safety).
      return ['completed', 'cached', 'done', 'finished', 'success', 'ok', 'found'].includes(v)
    })
    .map(([op]) => op)

  let groupOperators = okOperators.length ? okOperators.slice(0, 30) : []
  let grouped = await getGroupedHotels(requestId, groupOperators)

  let hotelsRaw = extractHotels(grouped)
  if (!hotelsRaw.length) {
    groupOperators = []
    grouped = await getGroupedHotels(requestId, [])
    hotelsRaw = extractHotels(grouped)
  }
  // Size of the whole unfiltered search (the list itself is only one page).
  const totalHotels = Number(asRecord(grouped)?.hotels_count) || hotelsRaw.length

  // Level.Travel-side filters: the unfiltered response carries the facets
  // (options + counts); a second call with filter_* returns ALL matching
  // hotels. Previously amenities were only text-matched on the first page,
  // so «5★ с аквапарком» came back as the cheapest Istanbul hotels.
  const softFeatures = splitFeatures(input.features).rest
  let ltFiltersApplied: string[] = []
  let ltFiltersUnavailable: string[] = []
  let ltHotelsCount: number | undefined
  let ltFilterError: string | undefined
  if (hasLtFilterRequest(input)) {
    const built = buildLtFilterParams(input, asRecord(grouped)?.filters)
    ltFiltersUnavailable = built.unavailable
    if (Object.keys(built.params).length) {
      try {
        const filtered = await getGroupedHotels(requestId, groupOperators, {
          ...built.params,
          page_limit: 100,
          page_number: 1,
        })
        grouped = filtered
        hotelsRaw = extractHotels(filtered)
        ltFiltersApplied = built.applied
        ltHotelsCount = Number(asRecord(filtered)?.hotels_count) || hotelsRaw.length
      } catch (err) {
        ltFilterError = err instanceof Error ? err.message : String(err)
        console.warn(`[level.travel] filtered grouped_hotels failed: ${ltFilterError}`)
      }
    }
    console.log(
      `[level.travel] filters applied=[${ltFiltersApplied.join(' | ')}] unavailable=[${ltFiltersUnavailable.join(' | ')}] matched=${ltHotelsCount ?? '-'}`,
    )
  }

  console.log(
    `[level.travel] request_id=${requestId} status_ops=${Object.keys(status).length} ok_ops=${okOperators.length} hotels=${hotelsRaw.length}`,
  )
  const logSearchStages = (finalCount: number, afterName?: number) =>
    console.log(
      `[level.travel] search dest="${dest.label}" hotelName="${[...(input.hotelNames ?? []), ...(input.hotelName ? [input.hotelName] : [])].join(' | ')}" date=${startDate} nights=${nights} raw=${totalHotels} page=${hotelsRaw.length}${afterName !== undefined ? ` afterName=${afterName}` : ''} final=${finalCount}`,
    )

  const currency = pickString(asRecord(grouped)?.currency_code, 'RUB').toUpperCase()

  let tours = hotelsRaw
    .map((h) => mapHotelToTour(h, dest.label, nights, startDate, currency))
    .filter((t): t is Tour => Boolean(t))

  const mappedCount = tours.length
  let afterNameCount: number | undefined
  let featuresApplied = false
  let featuresMatched: number | undefined

  // Soft filters from hotel cache (Level.Travel features)
  const nameQueries = [
    ...(input.hotelNames ?? []),
    ...(input.hotelName?.trim() ? [input.hotelName.trim()] : []),
  ].filter(Boolean)
  if (nameQueries.length) {
    // A tour matches if it satisfies ANY of the family queries — this is how
    // one search covers a whole brand family, including members whose names
    // don't contain the brand token (e.g. Rixos → "Land of Legends").
    let matched = tours.filter((t) => nameQueries.some((q) => matchesHotelName(t.name, q)))
    if (!matched.length) {
      // Nothing under current names — the customer may be searching by an old
      // name ("Титаник Мардан"), so allow former names as a fallback.
      matched = tours.filter((t) =>
        nameQueries.some((q) => matchesHotelName(t.name, q, { includeFormerName: true })),
      )
    }
    if (!matched.length) {
      const tokens = nameQueries
        .join(' ')
        .toLowerCase()
        .split(/[^a-zа-яё0-9]+/)
        .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t))
      matched = tours.filter((t) => stripFormerName(t.name).toLowerCase().includes(tokens[0] ?? ''))
    }
    tours = matched
    afterNameCount = tours.length
  }
  if (input.minRating && input.minRating > 0) {
    tours = tours.filter((t) => {
      const h = getCachedHotel(Number(t.id.replace(/^lt_/, '')))
      const r = h?.rating ?? (t.rating > 5 ? t.rating : t.rating * 2)
      return r >= input.minRating!
    })
  }
  if (input.firstLine) {
    tours = tours.filter((t) => {
      const h = getCachedHotel(Number(t.id.replace(/^lt_/, '')))
      return h?.beach?.first_line === true
    })
  }
  if (input.beachTypes?.length) {
    const wanted = new Set(input.beachTypes.map((b) => b.toLowerCase()))
    tours = tours.filter((t) => {
      const h = getCachedHotel(Number(t.id.replace(/^lt_/, '')))
      const ru = h?.beach?.surface_ru?.toLowerCase()
      return ru ? wanted.has(ru) : false
    })
  }
  if (input.mealTypes?.length) {
    // Same meal families as the Level.Travel filter: «всё включено» (AI)
    // also covers AI24 / AIP, otherwise those hotels were dropped here.
    const meals = new Set(
      input.mealTypes.flatMap((m) => MEAL_FAMILIES[m.toUpperCase()] ?? [m.toUpperCase()]),
    )
    tours = tours.filter((t) => {
      const h = getCachedHotel(Number(t.id.replace(/^lt_/, '')))
      if (!h?.meal_prices) return true
      return Object.keys(h.meal_prices).some((m) => meals.has(m.toUpperCase()))
    })
  }

  if (input.priceMin && input.priceMin > 0) {
    tours = tours.filter((t) => t.price >= input.priceMin!)
  }
  if (input.priceMax && input.priceMax > 0) {
    const max =
      currency === 'RUB' && input.priceMax <= 10000 ? input.priceMax * 100 : input.priceMax
    tours = tours.filter((t) => t.price <= max)
  }
  if (input.starsFrom) {
    tours = tours.filter((t) => (t.stars ?? 0) >= input.starsFrom!)
  }
  if (input.starsTo) {
    tours = tours.filter((t) => (t.stars ?? 5) <= input.starsTo!)
  }

  if (input.sortBy === 'rating') {
    tours.sort((a, b) => b.rating - a.rating || a.price - b.price)
  } else if (input.sortBy === 'stars') {
    tours.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.price - b.price)
  } else {
    tours.sort((a, b) => a.price - b.price || b.rating - a.rating)
  }
  const limit = Math.min(Math.max(Number(input.limit ?? 120), 1), 500)
  tours = tours.slice(0, limit)
  cacheTours(tours)

  const hotels = tours
    .map((t) => getCachedHotel(Number(t.id.replace(/^lt_/, ''))))
    .filter((h): h is HotelInfo => Boolean(h))

  try {
    // IMPORTANT: write debug dumps OUTSIDE the project tree. Writing into
    // server/ made Vite's file watcher think the project changed after every
    // search and full-reload the page — killing the assistant's response the
    // moment results arrived ("everything refreshes, no result").
    writeFileSync(
      path.join(tmpdir(), 'totus-lt-last-search.json'),
      JSON.stringify(
        {
          requestId,
          destination: dest,
          nights,
          startDate,
          currency,
          status,
          okOperators,
          hotelsCount: hotelsRaw.length,
          mapped: tours.length,
          priceSample: tours.slice(0, 3).map((t) => ({ id: t.id, price: t.price, name: t.name })),
        },
        null,
        2,
      ),
    )
  } catch {
    // ignore
  }

  // Soft filter by requested amenities. Search results carry only a few flags,
  // so a strict filter would wipe the list; we apply it only when it leaves a
  // usable number of hotels and ALWAYS report whether it actually ran, so the
  // assistant can never claim "all of these have an aquapark" without proof.
  if (softFeatures.length) {
    const matches = tours.filter((t) => {
      const hotel = getCachedHotel(Number(t.id.replace(/^lt_/, '')))
      const hay = [
        t.name,
        t.description,
        ...(t.inclusions ?? []),
        hotel?.description ?? '',
        ...(hotel?.facilities ?? []),
        ...Object.keys(hotel?.features ?? {}),
      ]
        .join(' ')
        .toLowerCase()
      return softFeatures.every((f) => featureMatches(hay, f))
    })
    featuresMatched = matches.length
    if (matches.length >= 3) {
      tours = matches
      featuresApplied = true
    }
  }
  // Amenities Level.Travel filtered itself are confirmed for every hotel in
  // the list. `featuresApplied` is true only when EVERY requested amenity was
  // actually filtered — by Level.Travel or by the text filter above.
  const ltAmenityLabels = [
    ...new Set([...splitFeatures(input.features).amenities, ...(input.amenities ?? [])]),
  ]
    .filter((a): a is LtAmenity => (LT_AMENITY_KEYS as readonly string[]).includes(a))
    .map((a) => LT_AMENITY_LABELS[a])
  if (ltAmenityLabels.length) {
    const ltAmenitiesOk = ltAmenityLabels.every((l) => ltFiltersApplied.includes(l))
    featuresApplied = ltAmenitiesOk && (softFeatures.length === 0 || featuresApplied)
  }

  logSearchStages(tours.length, afterNameCount)
  void mappedCount
  const searchParamsForLinks: SearchParams = {
    from_city: resolveFromCity(input.fromCity),
    to_country: dest.country,
    to_city: dest.city,
    nights,
    start_date: startDate,
    adults: input.adults ?? 2,
    kids: kids || undefined,
    kids_ages: kidsAges,
  }
  // Point every tour at the company's OWN site instead of the supplier's.
  tours = tours.map((t) => {
    const hid = Number(t.id.replace(/^lt_/, ''))
    const url = buildTotusHotelUrl({
      hotelId: hid,
      requestId,
      params: searchParamsForLinks,
    })
    return url ? { ...t, link: url } : t
  })
  cacheTours(tours)
  const searchParams: SearchParams = {
    from_city: resolveFromCity(input.fromCity),
    to_country: dest.country,
    to_city: dest.city,
    nights,
    start_date: startDate,
    adults: input.adults ?? 2,
    kids: kids || undefined,
    kids_ages: kidsAges,
  }
  lastSearchContext = { requestId, okOperators, params: searchParams }
  for (const t of tours) {
    const hid = Number(t.id.replace(/^lt_/, ''))
    if (Number.isFinite(hid)) {
      hotelSearchIndex.set(hid, { requestId, okOperators, params: searchParams })
    }
  }
  return { tours, hotels, source: 'level.travel', requestId, okOperators, stats: { raw: totalHotels, afterName: afterNameCount, featuresApplied, featuresMatched, assumedCountry, ltFiltersApplied, ltFiltersUnavailable, ltHotelsCount, ltFilterError } }
}

/**
 * Last successful search context (module-global). Lets the REST tour page show
 * room types without an assistant session: the page reuses the most recent
 * request_id from any chat search in this process.
 */
type SearchParams = {
  from_city: string
  to_country: string
  to_city?: string
  nights: number
  start_date: string
  adults: number
  kids?: number
  kids_ages?: number[]
}
type SearchContext = { requestId: string; okOperators: string[]; params?: SearchParams }
let lastSearchContext: SearchContext | null = null
export function getLastSearchContext() {
  return lastSearchContext
}

/**
 * hotel_id → the search context that actually produced this hotel. Without
 * this, room offers were requested with the LAST search's request_id — after
 * several searches in one chat, hotels from earlier searches got "нет данных".
 */
const hotelSearchIndex = new Map<number, SearchContext>()
export function getHotelSearchContext(hotelId: number) {
  return hotelSearchIndex.get(hotelId)
}

/**
 * Booking URL for the client's OWN platform. Configured via
 * TOTUS_BOOKING_URL_TEMPLATE with {tour_id}, {hotel_id}, {room} placeholders,
 * e.g. https://totusclub.ru/order?tour={tour_id}&room={room}
 * Returns undefined when not configured — the UI then falls back to the
 * internal tour page. The AI never creates bookings; the order is formed by
 * the client's platform behind this URL.
 */
export function buildBookingUrl(opts: {
  tourId?: string
  hotelId?: number
  room?: string
}): string | undefined {
  const template = process.env.TOTUS_BOOKING_URL_TEMPLATE?.trim()
  if (!template) {
    // No custom template configured — fall back to the company's own hotel
    // page, so booking buttons still stay on totus.club.
    if (opts.hotelId) {
      const ctx = getHotelSearchContext(opts.hotelId) ?? getLastSearchContext()
      const url = buildTotusHotelUrl({
        hotelId: opts.hotelId,
        requestId: ctx?.requestId,
        params: ctx?.params,
      })
      if (url) {
        return opts.room ? `${url}&room_type=${encodeURIComponent(opts.room)}` : url
      }
    }
    return undefined
  }
  return template
    .replaceAll('{tour_id}', encodeURIComponent(opts.tourId ?? ''))
    .replaceAll('{hotel_id}', encodeURIComponent(String(opts.hotelId ?? '')))
    .replaceAll('{room}', encodeURIComponent(opts.room ?? ''))
}

/**
 * Representative photo for a destination, taken ONLY from the Level.Travel
 * hotel cache (hotel photos are LT data). Matches city/region/country by
 * substring; returns the photo of the highest-rated matching hotel.
 */
export function findDestinationImage(query: string): string | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  let best: { rating: number; image: string } | undefined
  for (const h of hotelCache.values()) {
    if (!h.images?.length) continue
    const hay = `${h.city} ${h.region} ${h.country}`.toLowerCase()
    if (!hay.includes(q)) continue
    if (!best || h.rating > best.rating) best = { rating: h.rating, image: h.images[0] }
  }
  return best?.image
}

export type RoomGroup = {
  room_type: string
  min_price: number
  currency: string
  meals: Record<string, number>
  offers_count: number
  sample_tour_id?: string
  url?: string
}

/**
 * Normalize an operator-supplied room name into a grouping key. Tour operators
 * write the SAME room differently: "Standard Land View", "STANDARD ROOM LAND
 * VIEW", "Standard Room Land View [b2b]", "STANDART ROOM LAND VIEW" — without
 * normalization these show up as four separate rooms. We lowercase, drop
 * [b2b]/(...) markers, fix the common "standart" typo, drop filler words
 * (room/номер) and sort tokens so word order doesn't matter. Meaningful words
 * (sea/land/superior/suite…) survive, so genuinely different rooms stay apart.
 */
function normalizeRoomKey(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/standart/g, 'standard')
    .replace(/[^a-zа-яё0-9]+/g, ' ')
  const tokens = cleaned
    .split(' ')
    .filter((t) => t && t !== 'room' && t !== 'номер' && t !== 'rooms')
  return tokens.sort().join(' ')
}

/** Lower = nicer display variant (no [b2b], not ALL CAPS, no typos). */
function roomDisplayScore(name: string): number {
  let score = 0
  if (/\[[^\]]*\]/.test(name)) score += 2
  if (name === name.toUpperCase()) score += 1
  if (/standart/i.test(name)) score += 1
  return score
}

/** Group a full offers list by NORMALIZED room type: duplicates from different
 *  operators merge into one card; min price per meal, counts, links. */
export function groupOffersByRoom(
  offers: Awaited<ReturnType<typeof getHotelOffers>>,
): RoomGroup[] {
  const groups = new Map<string, RoomGroup>()
  const displayScores = new Map<string, number>()
  for (const o of offers) {
    const rawName = (o.room_type || '').trim() || 'Стандартный номер'
    const key = normalizeRoomKey(rawName) || 'стандартный'
    let g = groups.get(key)
    if (!g) {
      g = { room_type: rawName, min_price: Infinity, currency: 'RUB', meals: {}, offers_count: 0 }
      groups.set(key, g)
      displayScores.set(key, roomDisplayScore(rawName))
    } else {
      // Keep the prettiest spelling among operator variants for display.
      const candidateScore = roomDisplayScore(rawName)
      if (candidateScore < (displayScores.get(key) ?? Infinity)) {
        g.room_type = rawName
        displayScores.set(key, candidateScore)
      }
    }
    g.offers_count += 1
    if (o.price > 0 && o.price < g.min_price) {
      g.min_price = o.price
      g.sample_tour_id = o.tour_id
      g.url = o.url
    }
    const mealKey = (o.meal || '').toUpperCase().trim()
    if (mealKey && o.price > 0) {
      const prev = g.meals[mealKey]
      if (prev === undefined || o.price < prev) g.meals[mealKey] = o.price
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, min_price: g.min_price === Infinity ? 0 : g.min_price }))
    .sort((a, b) => (a.min_price || Infinity) - (b.min_price || Infinity))
}

/**
 * A BROAD listing search returns only a couple of cheapest offers per hotel —
 * that is why room lists looked almost empty. totus.club's hotel page solves
 * this by running a NEW search narrowed to a single hotel: the decoded
 * request_id of its hotel page contains the hotel id
 * (213|225|0|1056|9223758|...), while a listing request_id has that field
 * empty. We reproduce exactly that: enqueue a hotel-scoped search, wait for
 * the operators, and read offers from THAT request_id — then the API returns
 * every room type, meal plan and operator.
 */
const hotelScopedCache = new Map<string, { requestId: string; ts: number }>()

async function hotelScopedRequestId(
  hotelId: number,
  fallbackParams?: SearchParams,
): Promise<string | null> {
  const ctx = hotelSearchIndex.get(hotelId) ?? lastSearchContext
  const params = ctx?.params ?? fallbackParams
  if (!params) return null
  const key = `${hotelId}:${params.start_date}:${params.nights}:${params.adults}:${params.from_city}`
  const cached = hotelScopedCache.get(key)
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.requestId
  try {
    const enq = await enqueue({ ...params, hotel_ids: [hotelId] })
    const rid = enq.request_id
    if (!rid) return null
    await waitForSearch(rid)
    hotelScopedCache.set(key, { requestId: rid, ts: Date.now() })
    console.log(`[level.travel] hotel-scoped search hotel=${hotelId} request_id=${rid.slice(0, 24)}…`)
    return rid
  } catch (err) {
    console.warn(`[level.travel] hotel-scoped search failed for ${hotelId}: ${String(err)}`)
    return null
  }
}

export async function getHotelOffers(params: {
  requestId: string
  hotelId: number
  /** Run a separate hotel-scoped search for the complete room catalogue (slow) */
  deepRooms?: boolean
  operatorIds?: string[]
  mealTypes?: string[]
  roomType?: string
  compact?: boolean
}) {
  // A hotel-scoped search returns the FULL room catalogue but costs another
  // 30-45 s round trip through the operators. That made every hotel question
  // slow and pushed the conversation towards rooms instead of the hotel
  // itself, so it is now opt-in: used only when the customer explicitly wants
  // the whole room list.
  const scopedId = params.deepRooms ? await hotelScopedRequestId(params.hotelId) : null
  const roomsParams = {
    request_id: scopedId ?? params.requestId,
    hotel_id: params.hotelId,
    operator_ids:
      !scopedId && params.operatorIds?.length ? params.operatorIds.join(',') : undefined,
    // IMPORTANT: no `compact` by default. Level.Travel's compact mode
    // collapses the list to one best offer per meal type, which is why the
    // assistant used to see a single room. Full mode returns every
    // room/meal/operator variant.
    compact: params.compact === true ? 1 : undefined,
  }
  type RoomsResponse = {
    hotel_rooms?: unknown[]
    rooms?: unknown[]
    hotel_offers?: unknown[]
    offers?: unknown[]
    success?: boolean
  }
  const extract = (d: RoomsResponse) =>
    (Array.isArray(d.hotel_rooms) && d.hotel_rooms) ||
    (Array.isArray(d.rooms) && d.rooms) ||
    (Array.isArray(d.hotel_offers) && d.hotel_offers) ||
    (Array.isArray(d.offers) && d.offers) ||
    []

  // ROLLED BACK to the original single endpoint: the /search/hotel_rooms
  // experiment could return a different (shorter) structure and mask the
  // full offers list. get_hotel_offers is the proven source again.
  //
  // PAGINATION GUARD: level.travel's hotel page shows dozens of offer
  // variants per room type ("Показать ещё 79 вариантов"), so the offers
  // response may be paginated. We request a large per_page (ignored if
  // unsupported) and, if the response reports a bigger total or keeps
  // returning full pages, fetch subsequent pages and merge.
  const firstPage = await ltGet<RoomsResponse & { total?: number; total_count?: number }>(
    '/search/get_hotel_offers',
    { ...roomsParams, per_page: 200 },
  )
  const offers: unknown[] = [...extract(firstPage)]
  const reportedTotal = Number(firstPage.total ?? firstPage.total_count ?? NaN)
  if (offers.length > 0) {
    const pageSize = offers.length
    const wantMore = () =>
      (Number.isFinite(reportedTotal) && offers.length < reportedTotal) ||
      (!Number.isFinite(reportedTotal) && offers.length % pageSize === 0)
    for (let page = 2; page <= 10 && wantMore(); page++) {
      try {
        const next = extract(
          await ltGet<RoomsResponse>('/search/get_hotel_offers', {
            ...roomsParams,
            per_page: 200,
            page,
          }),
        )
        if (!next.length) break
        // Some APIs ignore `page` and return the same first page — detect and stop.
        if (JSON.stringify(next[0]) === JSON.stringify(offers[0])) break
        offers.push(...next)
      } catch {
        break
      }
    }
  }
  if (Number.isFinite(reportedTotal) && offers.length < reportedTotal) {
    console.warn(
      `[level.travel] rooms hotel=${params.hotelId}: получено ${offers.length} из ${reportedTotal} (возможна пагинация с другими параметрами)`,
    )
  }
  const hotel = getCachedHotel(params.hotelId)
  const summarized = offers.map((o) => {
    const rec = asRecord(o) ?? {}
    const pansion = asRecord(rec.pansion)
    const roomRec = asRecord(rec.room)
    const roomsArr = Array.isArray(rec.rooms) ? rec.rooms : []
    const firstRoom = roomsArr[0]
    const tourId = pickString(rec.id, rec.tour_id)
    const meal = pickString(
      pansion?.name,
      pansion?.original_name,
      typeof rec.pansion === 'string' ? rec.pansion : undefined,
      rec.pansion_name,
      rec.meal,
      rec.meal_type,
    )
    const price = pickNumber(rec.price, rec.net_price)
    const rawOfferLink = pickString(rec.link, rec.url, rec.package_link, asRecord(rec.package)?.link)
    const url =
      toPublicTourUrl(rawOfferLink, tourId) ||
      hotel?.link ||
      toPublicTourUrl(undefined, tourId)
    const summary = {
      tour_id: tourId,
      hotel_id: Number(rec.hotel_id ?? params.hotelId),
      hotel_name: pickString(rec.hotel_name, hotel?.name),
      // Room name lives under different keys depending on API version/operator.
      room_type: pickString(
        rec.room_name,
        rec.room_name_ru,
        rec.room_type,
        rec.room_type_name,
        rec.room_type_ru,
        typeof rec.room === 'string' ? rec.room : undefined,
        roomRec?.name,
        roomRec?.name_ru,
        roomRec?.original_name,
        asRecord(rec.hotel_room)?.name,
        typeof firstRoom === 'string' ? firstRoom : undefined,
        asRecord(firstRoom)?.name,
        asRecord(firstRoom)?.name_ru,
        asRecord(firstRoom)?.original_name,
      ),
      meal,
      meal_description: pickString(pansion?.description),
      nights: pickNumber(rec.nights_count, rec.nights),
      start_date: pickString(rec.start_date),
      price,
      currency: 'RUB',
      operator: rec.operator,
      region: pickString(rec.region_name),
      stars: pickNumber(rec.stars),
      url,
      tour_url: url,
    }
    if (tourId) offerCache.set(tourId, { ...summary, raw: rec })
    return summary
  })

  // Diagnostics: how many offers arrived and how many room names we parsed.
  // If offers is large but named is tiny, the room-name field key is wrong —
  // the raw dump in tmpdir shows the actual structure.
  const named = summarized.filter((o) => o.room_type.trim().length > 0).length
  const distinctRooms = new Set(
    summarized.map((o) => normalizeRoomKey(o.room_type) || '__unnamed__'),
  ).size
  console.log(
    `[level.travel] rooms hotel=${params.hotelId} offers=${summarized.length} named=${named} distinct_rooms=${distinctRooms}`,
  )
  try {
    writeFileSync(
      path.join(tmpdir(), 'totus-lt-rooms-debug.json'),
      JSON.stringify(
        {
          hotel_id: params.hotelId,
          request_id: params.requestId,
          offers_total: summarized.length,
          named,
          distinct_rooms: distinctRooms,
          raw_sample: offers.slice(0, 3),
          parsed_sample: summarized.slice(0, 3),
        },
        null,
        2,
      ),
    )
  } catch {
    // debug dump is best-effort
  }

  if (params.mealTypes?.length) {
    const meals = new Set(params.mealTypes.map((m) => m.toUpperCase()))
    return summarized.filter((o) => o.meal && meals.has(o.meal.toUpperCase()))
  }
  if (params.roomType?.trim()) {
    const q = params.roomType.trim().toLowerCase()
    return summarized.filter((o) => o.room_type.toLowerCase().includes(q))
  }
  return summarized
}

export async function actualizeOffer(params: { requestId: string; tourId: string }) {
  const data = await ltGet<Record<string, unknown>>('/search/actualize', {
    request_id: params.requestId,
    tour_id: params.tourId,
  })
  const price = pickNumber(data.price, data.net_price)
  const cached = getCachedOffer(params.tourId)
  const result = {
    tour_id: params.tourId,
    actualized: Boolean(data.actualized ?? data.success),
    available: data.actualized !== false && data.success !== false,
    price,
    previous_price: cached?.price,
    price_changed: cached?.price != null && price > 0 && Number(cached.price) !== price,
    currency: 'RUB',
    transfer: data.transfer,
    medical_insurance: data.medical_insurance,
    visa_price: pickNumber(data.visa_price),
    extras: data.extras,
    flights: data.flights,
    note: 'Актуальная цена на момент проверки. Окончательно фиксируется менеджером при бронировании.',
  }
  offerCache.set(params.tourId, { ...cached, ...result })
  return result
}

/**
 * Search parameters for a hotel when there is no search to reuse (server
 * restarted, chat restored, hotel named by the customer): the hotel's country,
 * ~3 weeks ahead, 7 nights, 2 adults. Used only to get room offers.
 */
export async function defaultParamsForHotel(hotelId: number): Promise<SearchParams | null> {
  const known = hotelSearchIndex.get(hotelId)?.params
  if (known) return known
  const info = getCachedHotel(hotelId) ?? (await fetchHotelInfo(hotelId).catch(() => null))
  const dest = resolveDestination(info?.country) ?? resolveDestination(info?.region) ?? resolveDestination(info?.city)
  if (!dest) return null
  return {
    from_city: resolveFromCity(undefined),
    to_country: dest.country,
    nights: 7,
    start_date: defaultStartDate(),
    adults: 2,
  }
}

/**
 * Room offers that do not give up. The fast path reads the chat's search; if
 * that search has expired, failed or has no offers for this hotel (or there is
 * no search at all), we run a NEW search narrowed to this one hotel — the way
 * totus.club's hotel page does — and read offers from it. The customer only
 * ever sees rooms, never "сбой".
 */
export async function getHotelOffersResilient(params: {
  hotelId: number
  requestId?: string
  operatorIds?: string[]
  mealTypes?: string[]
  roomType?: string
  deepRooms?: boolean
}): Promise<{ offers: Awaited<ReturnType<typeof getHotelOffers>>; via: 'search' | 'hotel_search' | 'none'; error?: string }> {
  let error: string | undefined
  if (params.requestId && !params.deepRooms) {
    try {
      const offers = await getHotelOffers({
        requestId: params.requestId,
        hotelId: params.hotelId,
        operatorIds: params.operatorIds,
        mealTypes: params.mealTypes,
        roomType: params.roomType,
      })
      if (offers.length) return { offers, via: 'search' }
      console.warn(`[level.travel] rooms hotel=${params.hotelId}: 0 offers in chat search — hotel-scoped retry`)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      console.warn(`[level.travel] rooms hotel=${params.hotelId}: ${error} — hotel-scoped retry`)
    }
  }
  try {
    const fallback = await defaultParamsForHotel(params.hotelId)
    const rid = await hotelScopedRequestId(params.hotelId, fallback ?? undefined)
    if (!rid) return { offers: [], via: 'none', error: error ?? 'no search parameters for this hotel' }
    const used = hotelSearchIndex.get(params.hotelId)?.params ?? lastSearchContext?.params ?? fallback ?? undefined
    // Booking links for these rooms must point at the search that has them.
    hotelSearchIndex.set(params.hotelId, { requestId: rid, okOperators: [], params: used })
    const offers = await getHotelOffers({
      requestId: rid,
      hotelId: params.hotelId,
      mealTypes: params.mealTypes,
      roomType: params.roomType,
    })
    return { offers, via: 'hotel_search', error }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[level.travel] rooms hotel=${params.hotelId}: hotel-scoped search failed: ${msg}`)
    return { offers: [], via: 'none', error: msg }
  }
}

/** Link to the hotel page on totus.club (with the best search we have). */
export async function hotelPageUrl(hotelId: number): Promise<string | undefined> {
  const ctx = hotelSearchIndex.get(hotelId)
  const params = ctx?.params ?? (await defaultParamsForHotel(hotelId)) ?? undefined
  return buildTotusHotelUrl({ hotelId, requestId: ctx?.requestId, params })
}

/**
 * Words of countries, resorts and departure cities known to the booking
 * system — for the personal-data guard: «Лара», «Владимир», «София» there are
 * places, not people.
 */
export function knownPlaceWords(): string[] {
  const out = new Set<string>()
  const add = (s?: string) => {
    for (const w of String(s ?? '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/)) if (w.length >= 3) out.add(w)
  }
  for (const k of Object.keys(DESTINATION_MAP)) add(k)
  for (const k of countriesFromApi.keys()) add(k)
  for (const k of Object.keys(FROM_CITY_MAP)) add(k)
  for (const k of departuresFromApi.keys()) add(k)
  for (const [k, v] of Object.entries(REGION_ALIASES)) {
    add(k)
    add(v)
  }
  return [...out]
}

let hotelWordsCache: { size: number; words: Set<string> } | null = null
/** Words of hotel names seen by this server — «Ali Bey», «Kaya Palazzo». */
export function cachedHotelWords(): Set<string> {
  if (hotelWordsCache && hotelWordsCache.size === hotelCache.size) return hotelWordsCache.words
  const words = new Set<string>()
  for (const h of hotelCache.values()) {
    for (const w of h.name.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/)) if (w.length >= 3) words.add(w)
  }
  hotelWordsCache = { size: hotelCache.size, words }
  return words
}

export interface HotelReview {
  rating?: number
  title?: string
  text: string
  date?: string
  pros?: string
  cons?: string
}

/**
 * Guest reviews from Level.Travel's reference book.
 * Endpoint: GET /references/hotel_reviews/{hotel_id}?page=&per_page=
 * (hotel_id is part of the PATH, not a query parameter).
 */
export async function fetchHotelReviews(
  hotelId: number,
  opts: { page?: number; perPage?: number } = {},
): Promise<{ reviews: HotelReview[]; total?: number }> {
  const perPage = Math.min(Math.max(opts.perPage ?? 10, 1), 30)
  const page = Math.max(opts.page ?? 1, 1)
  const data = await ltGet<unknown>(`/references/hotel_reviews/${hotelId}`, {
    page,
    per_page: perPage,
  })
  const root = asRecord(data) ?? {}
  const list: unknown[] = Array.isArray(data)
    ? data
    : (['hotel_reviews', 'reviews', 'data', 'results', 'items'] as const)
        .map((k) => root[k])
        .find((v): v is unknown[] => Array.isArray(v)) ?? []

  const reviews: HotelReview[] = []
  for (const item of list) {
    const rec = asRecord(item)
    if (!rec) continue
    const text = pickString(
      rec.text,
      rec.content,
      rec.comment,
      rec.body,
      rec.review,
      rec.description,
      rec.message,
    )
    const pros = pickString(rec.pros, rec.advantages, rec.positive, rec.plus)
    const cons = pickString(rec.cons, rec.disadvantages, rec.negative, rec.minus)
    if (!text && !pros && !cons) continue
    // No personal data goes on to the model (owner's rule): the author is
    // dropped, names / phones inside the texts are masked.
    const title = pickString(rec.title, rec.header)
    reviews.push({
      rating: pickNumber(rec.rating, rec.mark, rec.score) || undefined,
      title: title ? maskPii(title) : undefined,
      text: maskPii((text || '').slice(0, 700)),
      date: pickString(rec.date, rec.created_at, rec.published_at) || undefined,
      pros: pros ? maskPii(pros.slice(0, 300)) : undefined,
      cons: cons ? maskPii(cons.slice(0, 300)) : undefined,
    })
  }
  const total = pickNumber(root.total, root.total_count, root.count) || undefined
  console.log(`[level.travel] reviews hotel=${hotelId} page=${page} got=${reviews.length}`)
  return { reviews, total }
}

/** Raw reviews response — diagnostics only. */
export async function fetchHotelReviewsRaw(hotelId: number, perPage = 5): Promise<unknown> {
  return ltGet<unknown>(`/references/hotel_reviews/${hotelId}`, { page: 1, per_page: perPage })
}

/** Raw hotel reference record — exposed for diagnostics. */
export async function fetchHotelReferenceRaw(hotelId: number): Promise<unknown> {
  return ltGet<unknown>('/references/hotels', { hotel_ids: hotelId })
}

/** Pull a list of human-readable facility names out of any shape the API uses. */
function extractFacilities(rec: Record<string, unknown>): string[] {
  const out = new Set<string>()
  const arrayKeys = [
    'facilities',
    'hotel_facilities',
    'amenities',
    'services',
    'features_list',
    'options',
    'infrastructure',
    'restaurants',
    'meals',
    'entertainment',
    'sport',
    'kids',
  ]
  for (const key of arrayKeys) {
    const val = rec[key]
    if (!Array.isArray(val)) continue
    for (const item of val) {
      const name = pickString(
        typeof item === 'string' ? item : undefined,
        asRecord(item)?.name,
        asRecord(item)?.title,
        asRecord(item)?.name_ru,
      )
      if (name) out.add(name.trim())
      // Nested groups: { name: 'Питание', items: [...] }
      const nested = asRecord(item)?.items ?? asRecord(item)?.values
      if (Array.isArray(nested)) {
        for (const n of nested) {
          const nn = pickString(typeof n === 'string' ? n : undefined, asRecord(n)?.name)
          if (nn) out.add(nn.trim())
        }
      }
    }
  }
  // Boolean/YES flags inside the features object
  const feat = asRecord(rec.features) ?? {}
  for (const [k, v] of Object.entries(feat)) {
    if (v === true || v === 'YES' || v === 'FREE') out.add(k.replace(/_/g, ' '))
  }
  return [...out].filter(Boolean).slice(0, 60)
}

/**
 * Full hotel card. The search response carries only a handful of flags (beach,
 * line, wifi), so questions like "is there an aquapark / how many a la carte
 * restaurants" could never be answered. Here we always consult the hotel
 * reference book — which holds the real description and facility list — and
 * merge it into the cached card.
 */
export async function fetchHotelInfo(hotelId: number): Promise<HotelInfo | null> {
  const cached = getCachedHotel(hotelId)
  // Sparse cards from search results must still be enriched — returning the
  // cached one straight away was why the reference was never fetched.
  if (cached?.enriched) return cached

  try {
    const data = await fetchHotelReferenceRaw(hotelId)
    const root = asRecord(data) ?? {}
    const list: unknown[] = Array.isArray(data)
      ? data
      : (['hotels', 'data', 'results'] as const)
          .map((k) => root[k])
          .find((v): v is unknown[] => Array.isArray(v)) ?? []
    const first = asRecord(list[0])
    if (!first) return cached ?? null

    const hotelRec = asRecord(first.hotel) ?? first
    const description = pickString(
      hotelRec.description,
      hotelRec.description_ru,
      hotelRec.full_description,
      hotelRec.text,
      hotelRec.short_description,
      cached?.description,
    )
    const facilities = extractFacilities(hotelRec)
    const rating = pickNumber(hotelRec.rating, hotelRec.rating_value) || cached?.rating || 0
    const reviewCount =
      pickNumber(hotelRec.reviews_count, hotelRec.review_count, hotelRec.reviews) ||
      cached?.review_count ||
      0

    const merged: HotelInfo = {
      ...(cached ?? {
        hotel_id: hotelId,
        name: pickString(hotelRec.name, `Hotel ${hotelId}`),
        stars: pickNumber(hotelRec.stars) || 0,
        rating: 0,
        review_count: 0,
        city: pickString(hotelRec.city),
        region: pickString(hotelRec.region),
        country: pickString(hotelRec.country),
        features: asRecord(hotelRec.features) ?? {},
        description: '',
        images: [],
      }),
      description: maskPii(description || cached?.description || ''),
      facilities: facilities.length ? facilities : cached?.facilities,
      rating,
      review_count: reviewCount,
      enriched: true,
    }
    cacheHotel(merged)
    console.log(
      `[level.travel] hotel enriched id=${hotelId} facilities=${facilities.length} desc=${description ? description.length : 0} reviews=${reviewCount}`,
    )
    return merged
  } catch (err) {
    console.warn(`[level.travel] hotel reference failed for ${hotelId}: ${String(err)}`)
    return cached ?? null
  }
}

const TOTUS_SITE = (process.env.TOTUS_SITE_URL || 'https://totus.club').replace(/\/+$/, '')

/**
 * Build kids_ages list for hotel-details URLs.
 * Always one age entry per child (repeat last age if fewer ages than kids).
 */
function normalizeKidsAgesForUrl(kids?: number, kidsAges?: number[]): number[] {
  const ages = (kidsAges ?? []).filter((n) => Number.isFinite(n) && n >= 0)
  const count = Math.max(Number(kids) || 0, ages.length)
  if (count <= 0 || ages.length === 0) return ages
  if (ages.length >= count) return ages.slice(0, count)
  const padded = [...ages]
  const last = padded[padded.length - 1]
  while (padded.length < count) padded.push(last)
  return padded
}

/**
 * Build a link to the CLIENT'S OWN hotel page (totus.club/hotel-details).
 * Mirrors the exact query format their site uses, e.g.
 *   /hotel-details?hotel_id=9223758&from_city=Moscow&from_country=RU
 *     &to_country=EG&to_city=&adults=2&kids=0
 *     &start_date=2026-08-01&start_date_from=2026-08-01&end_date_till=2026-08-08
 *     &nights=7&search_type=package&flex_dates=0&request_id=...
 * The supplier domain is never exposed to the customer this way, and the
 * request_id is reused so their page shows the same live search results.
 */
export function buildTotusHotelUrl(opts: {
  hotelId: number
  requestId?: string
  params?: SearchParams
}): string | undefined {
  const { hotelId, requestId, params } = opts
  if (!Number.isFinite(hotelId) || hotelId <= 0 || !params) return undefined
  const start = params.start_date
  let endTill = start
  try {
    const d = new Date(`${start}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + (params.nights || 7))
    endTill = d.toISOString().slice(0, 10)
  } catch {
    endTill = start
  }
  const q = new URLSearchParams()
  q.set('hotel_id', String(hotelId))
  q.set('from_city', params.from_city)
  q.set('from_country', 'RU')
  q.set('to_country', params.to_country)
  q.set('to_city', params.to_city ?? '')
  q.set('adults', String(params.adults))
  // kedam /hotel-details expects ONE kids_ages per child, e.g.
  //   kids=2&kids_ages=3&kids_ages=3
  //   kids=2&kids_ages=3&kids_ages=6
  const kidsAges = normalizeKidsAgesForUrl(params.kids, params.kids_ages)
  q.set('kids', String(kidsAges.length > 0 ? kidsAges.length : (params.kids ?? 0)))
  for (const age of kidsAges) {
    q.append('kids_ages', String(age))
  }
  q.set('start_date', start)
  q.set('start_date_from', start)
  q.set('end_date_till', endTill)
  q.set('nights', String(params.nights))
  q.set('search_type', 'package')
  q.set('flex_dates', '0')
  if (requestId) q.set('request_id', requestId)
  return `${TOTUS_SITE}/hotel-details?${q.toString()}`
}

const FEATURE_SYNONYMS: Record<string, string[]> = {
  аквапарк: ['аквапарк', 'aquapark', 'water park', 'waterpark', 'горк', 'slide'],
  'водные горки': ['горк', 'slide', 'аквапарк', 'aquapark'],
  'детский клуб': ['детский клуб', 'kids club', 'мини-клуб', 'miniclub', 'mini club'],
  'детский бассейн': ['детский бассейн', 'kids pool', 'children pool'],
  анимация: ['анимаци', 'animation', 'entertainment'],
  спа: ['спа', 'spa', 'wellness'],
  фитнес: ['фитнес', 'fitness', 'gym'],
  теннис: ['теннис', 'tennis'],
  wifi: ['wi-fi', 'wifi', 'wi fi'],
  'только для взрослых': ['adults only', 'только для взрослых', '16+', '18+'],
  'семейные номера': ['family room', 'семейн'],
  'крытый бассейн': ['крытый бассейн', 'indoor pool'],
  'подогреваемый бассейн': ['подогрев', 'heated pool'],
  'a la carte': ['a la carte', 'а-ля-карт', 'а ля карт', 'алякарт'],
}

/** Does the hotel text mention the requested amenity (with synonyms)? */
function featureMatches(haystack: string, feature: string): boolean {
  const key = feature.trim().toLowerCase()
  const variants = FEATURE_SYNONYMS[key] ?? [key]
  return variants.some((v) => haystack.includes(v))
}

function extractHotels(grouped: unknown): unknown[] {
  const g = asRecord(grouped)
  if (!g) return []
  const candidates = [g.hotels, asRecord(g.data)?.hotels, asRecord(g.result)?.hotels, g.items]
  for (const c of candidates) {
    if (Array.isArray(c)) return c
    const rec = asRecord(c)
    if (rec) return Object.values(rec)
  }
  return []
}

/** Search several popular destinations when filters are empty */
export async function searchPopularLevelTravel(): Promise<Tour[]> {
  const destinations = ['Turkey', 'Egypt', 'UAE', 'Thailand']
  const results = await Promise.allSettled(
    destinations.map((destination) =>
      searchLevelTravelPackages({ destination, nights: 7, adults: 2 }),
    ),
  )
  const tours: Tour[] = []
  const seen = new Set<string>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const t of r.value.tours) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      tours.push(t)
    }
  }
  cacheTours(tours)
  return tours.slice(0, 200)
}
