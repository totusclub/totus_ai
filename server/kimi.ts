import OpenAI from 'openai'
import { logEvent } from './chatLog.js'
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type { WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import type { AssistantDeps, Session } from './assistant.js'
import type { Tour } from './types.js'
import { buildTotusSystemPrompt, singleDepartureCity, totusConfig } from './totusPrompt.js'
import {
  apiTraceLength,
  apiTraceSince,
  fetchHotelInfo,
  fetchHotelReviews,
  isSupportedDestination,
  mealLabel,
  supportedCountries,
  getCachedHotel,
  getCachedTour,
  buildBookingUrl,
  findDestinationImage,
  getHotelOffers,
  getHotelSearchContext,
  groupOffersByRoom,
  looksLikeHotelName,
  resolveFromCity,
  searchLevelTravelPackages,
  type HotelInfo,
} from './levelTravel.js'

export const TOUR_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_tours',
      description:
        'Поиск туров в системе бронирования. Прослойка ставит запрос в очередь, дожидается результатов по туроператорам и возвращает отфильтрованный топ отелей. Каждый результат: hotel_id, отель, звёзды, рейтинг, ключевые особенности, минимальная цена, ссылка на страницу тура. Направление принимает страну, курорт или конкретный отель.',
      parameters: {
        type: 'object',
        required: ['destination', 'start_date_from', 'adults'],
        properties: {
          departure_city: {
            type: 'string',
            description: 'Город вылета из списка компании',
          },
          destination: {
            type: 'string',
            description:
              'Страна, курорт или название отеля — как сказал клиент. Географию резолвит система.',
          },
          start_date_from: {
            type: 'string',
            description: 'Ранняя дата вылета ГГГГ-ММ-ДД',
          },
          start_date_to: {
            type: 'string',
            description:
              'Поздняя дата вылета ГГГГ-ММ-ДД. Если клиент назвал одну дату — поставь диапазон ±2 дня',
          },
          nights_min: { type: 'integer', description: 'По умолчанию 6' },
          nights_max: { type: 'integer', description: 'По умолчанию 8' },
          adults: { type: 'integer', minimum: 1 },
          kids_ages: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Возраст каждого ребёнка на дату вылета',
          },
          stars_min: { type: 'integer', minimum: 1, maximum: 5 },
          min_rating: {
            type: 'number',
            description: 'Минимальный рейтинг отеля',
          },
          beach_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['песчаный', 'галечный', 'песчано-галечный', 'платформа'],
            },
          },
          first_line: { type: 'boolean', description: 'Только первая береговая линия' },
          meal_types: {
            type: 'array',
            items: { type: 'string', enum: ['RO', 'BB', 'HB', 'FB', 'AI', 'UAI'] },
          },
          features: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'аквапарк',
                'водные горки',
                'детский клуб',
                'детский бассейн',
                'анимация',
                'подогреваемый бассейн',
                'крытый бассейн',
                'спа',
                'фитнес',
                'теннис',
                'wifi',
                'только для взрослых',
                'семейные номера',
              ],
            },
            description: 'Инфраструктура отеля // сверить точный список с документацией',
          },
          hotel_name: {
            type: 'string',
            description: 'Одно название отеля или бренд (напр. "Rixos").',
          },
          hotel_names: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Список названий для поиска СЕМЕЙСТВА отелей одним вызовом: бренд + отели семейства, в названии которых бренда нет. Пример для Rixos в Турции: ["Rixos", "Land of Legends"]. Названия — латиницей, как в названиях отелей.',
          },
          price_max: { type: 'number', description: 'Максимальная цена за весь тур на всех' },
          sort_by: { type: 'string', enum: ['price', 'rating'], description: 'По умолчанию price' },
          limit: {
            type: 'integer',
            description:
              'Сколько отелей показать. По умолчанию 5. Если клиент просит больше вариантов («покажи 10», «а ещё есть?», «покажи все») — передай нужное число, максимум 10.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hotel_info',
      description:
        'Полная карточка отеля из локального кэша справочника: описание, пляж (тип, линия, расстояние, протяжённость), территория, бассейны, детская инфраструктура, типы номеров, питание, особенности. Мгновенно, без поиска.',
      parameters: {
        type: 'object',
        required: ['hotel_id'],
        properties: {
          hotel_id: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hotel_offers',
      description:
        'Варианты туров в конкретный отель из последнего поиска: тип номера, питание, туроператор, рейс, цена и ссылка на каждый тур. Вызывать после search_tours.',
      parameters: {
        type: 'object',
        required: ['hotel_id'],
        properties: {
          hotel_id: { type: 'integer' },
          meal_types: {
            type: 'array',
            items: { type: 'string', enum: ['RO', 'BB', 'HB', 'FB', 'AI', 'UAI'] },
            description: 'Опциональный фильтр',
          },
          room_type: { type: 'string', description: 'Опциональный фильтр по типу номера' },
          all_rooms: {
            type: 'boolean',
            description:
              'Полный каталог номеров отеля. МЕДЛЕННО — запускает отдельный поиск, 30-45 секунд. Включай ТОЛЬКО если клиент прямо просит показать все варианты размещения. По умолчанию false: быстрый ответ по доступным номерам.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hotel_reviews',
      description:
        'Отзывы гостей об отеле (реальные тексты). Вызывать, когда клиент спрашивает про отзывы, впечатления, «что пишут», «стоит ли ехать», а также чтобы проверить конкретные детали — питание, рестораны a la carte, уборку, шум.',
      parameters: {
        type: 'object',
        required: ['hotel_id'],
        properties: {
          hotel_id: { type: 'integer' },
          limit: { type: 'integer', description: 'Сколько отзывов вернуть, по умолчанию 10' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'annotate_hotels',
      description:
        'Добавить в УЖЕ показанные карточки отелей персональный комментарий (одна фраза на отель: чем он хорош именно под запрос клиента). Вызывать СРАЗУ после search_tours.',
      parameters: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['hotel_id', 'comment'],
              properties: {
                hotel_id: { type: 'integer' },
                comment: {
                  type: 'string',
                  description: 'До 90 знаков, без markdown. ТОЛЬКО факты из выдачи поиска или из get_hotel_info по этому отелю. ЗАПРЕЩЕНО: любые цены и суммы (они уже есть в карточке) и коды питания (UAI, AI, HB, BB) — пиши «Ультра всё включено», «Всё включено», «Полупансион», «Завтраки». Запрещено упоминать удобства (аквапарк, a la carte, спа), если они не подтверждены данными. Пример: «Песчаный пляж, 1-я линия, ультра всё включено»',
                },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_destinations',
      description:
        'Показать в чате красивые карточки направлений (городов/стран) с фото. Используйте ВМЕСТО текстового списка, когда предлагаете клиенту куда поехать: «не знаю куда», сезонные советы, выбор из 2–4 направлений.',
      parameters: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            description: '2–4 направления',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', description: 'Город или страна, напр. «Хургада» или «Египет»' },
                country: { type: 'string', description: 'Страна, если name — город' },
                tagline: {
                  type: 'string',
                  description: 'Одна короткая фраза, чем хорошо (до 80 символов), напр. «Тёплое море и коралловые рифы круглый год»',
                },
              },
            },
          },
        },
      },
    },
  },
]

export function isKimiEnabled() {
  return Boolean(
    process.env.LLM_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.MOONSHOT_API_KEY ||
      process.env.KIMI_API_KEY,
  )
}

/**
 * Provider resolution. The project speaks the OpenAI protocol, so switching the
 * model is only env vars. Priority: generic LLM_* → DeepSeek → Kimi/Moonshot.
 * DeepSeek: base https://api.deepseek.com, model deepseek-v4-flash
 * (legacy aliases deepseek-chat/reasoner are retired after 2026-07-24).
 */
function resolveProvider() {
  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.KIMI_API_KEY
  const isDeepseek = Boolean(process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY)
  const baseURL =
    process.env.LLM_BASE_URL ||
    process.env.KIMI_BASE_URL ||
    (isDeepseek ? 'https://api.deepseek.com' : 'https://api.moonshot.ai/v1')
  const model =
    process.env.LLM_MODEL ||
    process.env.KIMI_MODEL ||
    process.env.MOONSHOT_MODEL ||
    (isDeepseek ? 'deepseek-v4-flash' : 'moonshot-v1-8k')
  const temperature = Number(process.env.LLM_TEMPERATURE ?? 0.35)
  // DeepSeek V4 runs in "thinking" mode by default. For a website chat we do
  // not want chain-of-thought: it burns tokens, adds latency, and — critically —
  // the API then DEMANDS that `reasoning_content` be echoed back in the message
  // history ("The reasoning_content in the thinking mode must be passed back"),
  // which made the follow-up call after every tool result fail with HTTP 400.
  // Override with LLM_THINKING=enabled if you ever want it back.
  const thinkingDisabled =
    (process.env.LLM_THINKING ?? 'disabled').toLowerCase() !== 'enabled'
  return {
    apiKey,
    baseURL,
    model,
    temperature: Number.isFinite(temperature) ? temperature : 0.35,
    thinkingDisabled,
  }
}

function getClient() {
  const { apiKey, baseURL } = resolveProvider()
  if (!apiKey) throw new Error('LLM_API_KEY / DEEPSEEK_API_KEY / MOONSHOT_API_KEY is not set')

  return new OpenAI({ apiKey, baseURL })
}

function getModel() {
  return resolveProvider().model
}

function send(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload))
}

function toIsoDate(raw?: string) {
  if (!raw) return undefined
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return undefined
}

function summarizeHotel(h: HotelInfo) {
  return {
    hotel_id: h.hotel_id,
    name: h.name,
    stars: h.stars,
    rating: h.rating,
    review_count: h.review_count,
    city: h.city,
    region: h.region,
    country: h.country,
    beach: h.beach,
    // Plain Russian names instead of codes so the model can't echo "UAI".
    meals: h.meal_prices ? [...new Set(Object.keys(h.meal_prices).map(mealLabel))] : undefined,
    min_price: h.min_price,
    currency: h.currency || 'RUB',
    url: h.link,
    tour_url: h.link,
    description: h.description.slice(0, 280),
    images: h.images.slice(0, 2),
  }
}

/**
 * Kayak-style selection: instead of the first N by price, pick a DIVERSE top —
 * best value, cheapest, best rating — and label each pick so the assistant can
 * say WHY a card is shown (the way Kayak explains its picks).
 */
function pickKayakStyle(tours: Tour[], limit: number): { picks: Tour[]; labels: Map<string, string> } {
  const labels = new Map<string, string>()
  const pool = tours.filter((t) => t.price > 0)
  const base = pool.length ? pool : tours
  if (!base.length) return { picks: [], labels }

  const maxPrice = Math.max(...base.map((t) => t.price), 1)
  // Higher rating pulls up, higher price pulls down — a simple value score.
  const score = (t: Tour) => (t.rating ?? 0) / 10 - (t.price / maxPrice) * 0.45

  const byPrice = [...base].sort((a, b) => a.price - b.price)
  const byRating = [...base].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  const byValue = [...base].sort((a, b) => score(b) - score(a))

  const picks: Tour[] = []
  const add = (t: Tour | undefined, label?: string) => {
    if (!t || picks.some((x) => x.id === t.id)) return
    picks.push(t)
    if (label) labels.set(t.id, label)
  }

  add(byValue[0], 'оптимум цена/качество')
  add(byPrice[0], 'самая низкая цена')
  if ((byRating[0]?.rating ?? 0) > 0) add(byRating[0], 'лучший рейтинг')
  for (const t of byValue) {
    if (picks.length >= limit) break
    add(t)
  }
  return { picks: picks.slice(0, limit), labels }
}

function summarizeTourCard(tour: Tour, hotel?: HotelInfo | null) {
  const h = hotel ?? getCachedHotel(Number(tour.id.replace(/^lt_/, '')))
  const url = h?.link
  return {
    hotel_id: h?.hotel_id ?? Number(tour.id.replace(/^lt_/, '')),
    name: tour.name,
    stars: tour.stars,
    destination: tour.destination,
    price_from: tour.price,
    currency: tour.currency,
    nights: tour.duration,
    rating: h?.rating ?? tour.rating,
    beach: h?.beach,
    meals: h?.meal_prices ? [...new Set(Object.keys(h.meal_prices).map(mealLabel))] : undefined,
    url,
    tour_url: url,
    short_description: tour.description.slice(0, 160),
    available_dates: tour.available_dates.slice(0, 5),
  }
}

const DESTINATION_EMOJI: Record<string, string> = {
  'турция': '🇹🇷', 'египет': '🇪🇬', 'оаэ': '🇦🇪', 'эмираты': '🇦🇪', 'таиланд': '🇹🇭',
  'вьетнам': '🇻🇳', 'мальдивы': '🇲🇻', 'шри-ланка': '🇱🇰', 'куба': '🇨🇺', 'китай': '🇨🇳',
  'хайнань': '🇨🇳', 'абхазия': '🏔️', 'россия': '🇷🇺', 'сочи': '🌴', 'грузия': '🇬🇪',
  'индия': '🇮🇳', 'гоа': '🇮🇳', 'индонезия': '🇮🇩', 'бали': '🇮🇩', 'катар': '🇶🇦',
}

function destinationEmoji(nameOrCountry: string): string {
  const q = nameOrCountry.trim().toLowerCase()
  for (const [key, emoji] of Object.entries(DESTINATION_EMOJI)) {
    if (q.includes(key)) return emoji
  }
  return '🏖️'
}

/** Fact line for a hotel card built from Level.Travel data (inclusions). */
function hotelFallbackComment(t: Tour): string | undefined {
  const facts = (t.inclusions ?? [])
    .filter((x) => x && !x.toLowerCase().startsWith('проживание'))
    // No prices in the comment — the card already shows them right above.
    .filter((x) => !/₽|руб|\d{4,}|\d{1,3}(?:[\s\u00a0]\d{3})+/i.test(x))
    .slice(0, 3)
  return facts.length ? facts.join(' · ') : undefined
}

/** Collapse a raw API trace into short readable lines for the chat:
 *  repeated /search/status polls become one line with a count. */
function summarizeApiCalls(calls: ReturnType<typeof apiTraceSince>): string[] {
  const lines: string[] = []
  let statusCount = 0
  let statusMs = 0
  const flushStatus = () => {
    if (!statusCount) return
    lines.push(
      `GET api.level.travel/search/status ×${statusCount} (${(statusMs / 1000).toFixed(1)} с — опрос туроператоров)`,
    )
    statusCount = 0
    statusMs = 0
  }
  for (const c of calls) {
    if (c.endpoint.endsWith('/search/status')) {
      statusCount++
      statusMs += c.ms
      continue
    }
    flushStatus()
    lines.push(`${c.endpoint}${c.params ? ` — ${c.params}` : ''}`)
  }
  flushStatus()
  return lines.slice(0, 12)
}

/** Human-readable step label for the "thinking process" shown in chat. */
function toolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'search_tours': {
      const dest = String(args.destination ?? '').trim()
      const names = Array.isArray(args.hotel_names)
        ? (args.hotel_names as unknown[]).map(String).join(', ')
        : String(args.hotel_name ?? '').trim()
      const date = String(args.start_date_from ?? '').trim()
      const bits = [dest, names, date].filter(Boolean).join(' · ')
      return `Ищу туры${bits ? ` — ${bits}` : ''}`
    }
    case 'get_hotel_info':
      return 'Читаю карточку отеля'
    case 'get_hotel_reviews':
      return 'Читаю отзывы гостей'
    case 'get_hotel_offers':
      return 'Запрашиваю номера и цены у туроператоров'
    case 'annotate_hotels':
      return 'Готовлю персональные комментарии к отелям'
    case 'show_destinations':
      return 'Собираю подборку направлений'
    default:
      return `Выполняю: ${name}`
  }
}

/** Short human summary of a finished step, built from the tool result. */
function toolSummary(name: string, result: unknown): string | undefined {
  const r = result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
  if (typeof r.error === 'string') return r.error
  switch (name) {
    case 'search_tours': {
      const total = Number(r.total_found ?? 0)
      const stats = r.search_stats as { raw?: number } | undefined
      const raw = Number(stats?.raw ?? 0)
      return raw > 0
        ? `в выдаче ${raw} отелей, после фильтров ${total}`
        : `найдено отелей: ${total}`
    }
    case 'get_hotel_offers': {
      const offers = Number(r.offers_count ?? 0)
      const rooms = Number(r.rooms_count ?? 0)
      return `${offers} предложений · типов номеров: ${rooms}`
    }
    case 'get_hotel_info':
      return 'карточка получена'
    case 'get_hotel_reviews':
      return `отзывов: ${Number((result as Record<string, unknown>)?.count ?? 0)}`
    case 'annotate_hotels':
      return `комментариев: ${Number(r.annotated ?? 0)}`
    case 'show_destinations':
      return `направлений: ${Number(r.shown ?? 0)}`
    default:
      return undefined
  }
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  _deps: AssistantDeps,
  session: Session,
  ws: WebSocket,
  messageId: string,
) {
  switch (name) {
    case 'search_tours': {
      const destination = String(args.destination || '').trim()
      if (!destination) return { error: 'Нужен destination (страна, курорт или отель)' }

      // Guard against the model re-running an identical search within one
      // message turn. Kimi's tool loop can call search_tours several times; if
      // the parameters are identical we return the previous result instead of
      // hitting Level.Travel again (that was the cause of the same request_id
      // being searched 8 times in the logs). A genuinely different search
      // (new dates/destination/filters) has a different signature and runs.
      const searchSignature = JSON.stringify(args)
      if (session.lastSearchSignature === searchSignature && session.lastSearchResult) {
        return {
          ...session.lastSearchResult,
          note:
            'Повтор идентичного поиска — верните клиенту уже найденные варианты, не ищите заново. Если нужен другой результат, измените параметры (даты, направление, фильтры).',
        }
      }

      const kidsAges = Array.isArray(args.kids_ages)
        ? args.kids_ages.map(Number).filter((n) => Number.isFinite(n))
        : []
      const adults = Number(args.adults ?? 2)
      const nightsMin = Number(args.nights_min ?? 6)
      const nightsMax = Number(args.nights_max ?? 8)
      const nights = Math.round((nightsMin + nightsMax) / 2) || 7
      const startDate =
        toIsoDate(String(args.start_date_from ?? '')) ||
        new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10)
      const departureRaw =
        String(args.departure_city || '').trim() ||
        singleDepartureCity() ||
        totusConfig().departureCities.split(',')[0]?.trim() ||
        'Moscow'
      const departure = resolveFromCity(departureRaw)
      // Hard cap: never more than 5 tours per query.
      // Default 5 cards, but the customer can ask for more ("покажи 10") —
      // the cap is a default, not a wall.
      const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 10)

      try {
        if (
          destination &&
          !looksLikeHotelName(destination) &&
          !isSupportedDestination(destination) &&
          !(Array.isArray(args.hotel_names) && args.hotel_names.length)
        ) {
          return {
            error: 'destination_not_supported',
            destination,
            available_countries: supportedCountries()
              .map((c) => c.label)
              .slice(0, 40),
            note: 'Пакетных туров в это направление у нас нет. Скажите клиенту прямо, что по этому направлению туры не продаются, и предложи 2-3 подходящие альтернативы из available_countries. НЕ запускай поиск и НЕ показывай отели другой страны.',
          }
        }
        const result = await searchLevelTravelPackages({
          destination,
          fromCity: departure,
          nights,
          adults,
          kids: kidsAges.length,
          kidsAges,
          startDate,
          starsFrom: args.stars_min ? Number(args.stars_min) : undefined,
          minRating: args.min_rating ? Number(args.min_rating) : undefined,
          beachTypes: Array.isArray(args.beach_types)
            ? (args.beach_types as string[])
            : undefined,
          firstLine: Boolean(args.first_line),
          features: Array.isArray(args.features) ? (args.features as string[]) : undefined,
          mealTypes: Array.isArray(args.meal_types) ? (args.meal_types as string[]) : undefined,
          hotelNames: (() => {
            const arr = Array.isArray(args.hotel_names)
              ? args.hotel_names.map((x) => String(x).trim()).filter(Boolean)
              : []
            const single = String(args.hotel_name ?? '').trim()
            if (arr.length) return single ? [...arr, single] : arr
            if (single) return [single]
            return looksLikeHotelName(destination) ? [destination] : undefined
          })(),
          priceMax: args.price_max ? Number(args.price_max) : undefined,
          sortBy: args.sort_by === 'rating' ? 'rating' : 'price',
          limit: Math.max(limit * 2, 20),
        })

        session.ltRequestId = result.requestId
        session.ltOkOperators = result.okOperators

        const { picks, labels } = pickKayakStyle(result.tours, limit)
        const sentPicks = picks.map((t) => ({
          ...t,
          pick_label: labels.get(t.id),
          // Fact-based fallback comment from Level.Travel data; the model
          // replaces it with a personalized one via annotate_hotels.
          comment: hotelFallbackComment(t),
        }))
        session.lastPicks = sentPicks
        session.lastPicksMessageId = messageId
        send(ws, { type: 'tours', tours: sentPicks, messageId })

        const prices = picks.map((t) => t.price).filter((p) => p > 0)
        const minPrice = prices.length ? Math.min(...prices) : null
        const maxPrice = prices.length ? Math.max(...prices) : null

        const hasNameFilter =
          Boolean(String(args.hotel_name ?? '').trim()) ||
          (Array.isArray(args.hotel_names) && args.hotel_names.length > 0)
        const nameMiss =
          result.stats?.afterName === 0 ||
          (hasNameFilter && result.tours.length === 0 && (result.stats?.raw ?? 0) > 0)
        const payload = {
          count: picks.length,
          total_found: result.tours.length,
          search_stats: result.stats,
          name_filter_miss: nameMiss || undefined,
          departure_city: departure,
          nights,
          start_date: startDate,
          price_range:
            minPrice != null ? { from: minPrice, to: maxPrice, currency: 'RUB' } : null,
          features_requested: args.features ?? [],
          features_filter_applied: result.stats?.featuresApplied ?? false,
          assumed_country: result.stats?.assumedCountry,
          features_matched: result.stats?.featuresMatched,
          hotels: picks.map((t) => ({ ...summarizeTourCard(t), pick_label: labels.get(t.id) })),
          note:
            picks.length === 0 && nameMiss
              ? `По направлению найдено ${result.stats?.raw ?? 0} отелей, но по названию совпадений нет. Скажите клиенту честно: направление в системе есть, а именно этот отель/бренд на эти даты не найден. Предложите проверить написание (латиницей) или показать похожие отели уровня без фильтра названия.`
              : picks.length === 0
              ? 'Пустая выдача — ослабьте фильтры (даты ±3–5 дней, звёзды, бюджет, соседний курорт) и повторите поиск.'
              : 'Карточки отелей УЖЕ показаны клиенту. ВАЖНО ПРО УДОБСТВА: если features_filter_applied = false, значит отфильтровать по запрошенным удобствам (аквапарк, a la carte и т.п.) НЕ удалось — НЕ говорите «все с аквапарком» и не пишите этого в комментариях. Чтобы проверить удобство конкретного отеля, вызовите get_hotel_info (там facilities и описание) или get_hotel_reviews. СЛЕДУЮЩИЙ ШАГ: annotate_hotels — по одной фразе на отель, ТОЛЬКО по фактам из выдачи (пляж, линия, питание, цена, рейтинг, pick_label). Потом текст: 1–2 фразы + один вопрос, без markdown и ссылок.',
        }

        // Remember this search so an identical repeat within the turn is served
        // from memory (see the guard at the top of this case).
        session.lastSearchSignature = searchSignature
        session.lastSearchResult = payload

        return payload
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Ошибка поиска',
          count: 0,
          hotels: [],
        }
      }
    }

    case 'get_hotel_info': {
      const hotelId = Number(args.hotel_id)
      if (!Number.isFinite(hotelId)) return { error: 'Нужен hotel_id' }
      const info = (await fetchHotelInfo(hotelId)) || getCachedHotel(hotelId)
      if (!info) {
        return {
          error:
            'Карточка отеля не найдена в кэше. Сначала выполните search_tours, затем передайте hotel_id из выдачи.',
        }
      }
      const tour = getCachedTour(info.tour_card_id || `lt_${hotelId}`)
      if (tour) send(ws, { type: 'tours', tours: [tour], messageId })
      return {
        ...summarizeHotel(info),
        features: info.features,
        // Full facility list from the hotel reference book: aquapark, a la
        // carte restaurants, kids club, spa and so on.
        facilities: info.facilities ?? [],
        description: info.description,
        rating: info.rating,
        reviews_count: info.review_count,
        images: info.images.slice(0, 5),
        data_note:
          'facilities и description — полные данные по отелю. Отвечая про удобства (аквапарк, рестораны a la carte, детский клуб, спа), ищите их СНАЧАЛА в facilities и description. Если там нет — скажите, что такой информации нет, и НЕ утверждайте, что удобства не существует.',
      }
    }

    case 'get_hotel_reviews': {
      const hotelId = Number(args.hotel_id)
      if (!Number.isFinite(hotelId)) return { error: 'Нужен hotel_id' }
      const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 20)
      try {
        const { reviews, total } = await fetchHotelReviews(hotelId, { perPage: limit })
        const rated = reviews.filter((r) => typeof r.rating === 'number')
        const avg = rated.length
          ? Math.round((rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length) * 10) / 10
          : undefined
        return {
          hotel_id: hotelId,
          count: reviews.length,
          total_reviews: total,
          average_rating: avg,
          reviews,
          note:
            reviews.length === 0
              ? 'Отзывов по этому отелю нет. Скажите честно и не додумывайте.'
              : 'Это РЕАЛЬНЫЕ отзывы гостей. Кратко перескажи 2–3 самых показательных своими словами (что хвалят, на что жалуются), не копируй длинные цитаты целиком. Если клиент спрашивал про конкретное (рестораны a la carte, питание, уборку) — ищи ответ в текстах и ссылайся на то, что пишут гости. Не выдумывай того, чего в отзывах нет.',
        }
      } catch (err) {
        return {
          error: `Не удалось получить отзывы: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    case 'get_hotel_offers': {
      const hotelId = Number(args.hotel_id)
      if (!Number.isFinite(hotelId)) return { error: 'Нужен hotel_id' }
      const hotelCtx =
        getHotelSearchContext(hotelId) ??
        (session.ltRequestId
          ? { requestId: session.ltRequestId, okOperators: session.ltOkOperators ?? [] }
          : null)
      if (!hotelCtx) {
        return {
          error: 'Нет активного поиска. Сначала вызовите search_tours, затем get_hotel_offers.',
        }
      }
      try {
        const offers = await getHotelOffers({
          requestId: hotelCtx.requestId,
          hotelId,
          operatorIds: hotelCtx.okOperators,
          mealTypes: Array.isArray(args.meal_types) ? (args.meal_types as string[]) : undefined,
          roomType: args.room_type ? String(args.room_type) : undefined,
          deepRooms: Boolean(args.all_rooms),
        })
        const rooms = groupOffersByRoom(offers).map((r) => ({
          ...r,
          booking_url: buildBookingUrl({
            tourId: r.sample_tour_id,
            hotelId,
            room: r.room_type,
          }),
        }))
        const cachedHotel = getCachedHotel(hotelId)
        send(ws, {
          type: 'rooms',
          hotel: {
            id: hotelId,
            name: cachedHotel?.name,
            image: cachedHotel?.images?.[0],
          },
          rooms,
          messageId,
        })
        return {
          hotel_id: hotelId,
          rooms_count: rooms.length,
          // Room types with min price per meal — this is what the client asks
          // about ("какие там номера?"). Show ALL of these, not just one.
          rooms,
          offers_count: offers.length,
          offers_sample: offers.slice(0, 8),
          note:
            offers.length === 0
              ? 'Предложений нет — попробуйте другой отель или ослабьте фильтр питания/номера.'
              : 'Карточки номеров УЖЕ показаны клиенту в чате с ценами и кнопками бронирования. НЕ дублируйте список текстом и не вставляйте ссылки. Ваш текст: 1–2 фразы — какой номер лучше под задачу клиента — и один вопрос.',
        }
      } catch (err) {
        const hotel = getCachedHotel(hotelId)
        if (hotel?.link || hotel?.cheapest_tour_id) {
          return {
            hotel_id: hotelId,
            count: 1,
            offers: [
              {
                hotel_id: hotelId,
                hotel_name: hotel.name,
                price: hotel.min_price,
                currency: hotel.currency || 'RUB',
                meal: hotel.meal_prices
                  ? Object.keys(hotel.meal_prices).sort(
                      (a, b) => (hotel.meal_prices![a] ?? 0) - (hotel.meal_prices![b] ?? 0),
                    )[0]
                  : undefined,
                url: hotel.link,
                tour_url: hotel.link,
                note: 'Краткий вариант из выдачи поиска',
              },
            ],
          }
        }
        return { error: err instanceof Error ? err.message : 'Ошибка get_hotel_offers' }
      }
    }

    case 'annotate_hotels': {
      const items = Array.isArray(args.items) ? args.items : []
      if (!session.lastPicks?.length) {
        return { error: 'Нет показанных карточек — сначала вызовите search_tours.' }
      }
      const byHotel = new Map<number, string>()
      for (const it of items) {
        const rec = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
        const hid = Number(rec.hotel_id)
        const comment = String(rec.comment ?? '').replaceAll('*', '').trim().slice(0, 120)
        if (Number.isFinite(hid) && comment) byHotel.set(hid, comment)
      }
      if (!byHotel.size) return { error: 'Нужен items: [{hotel_id, comment}]' }
      session.lastPicks = session.lastPicks.map((t) => {
        const hid = Number(String(t.id).replace(/^lt_/, ''))
        const comment = byHotel.get(hid)
        return comment ? { ...t, comment } : t
      })
      send(ws, {
        type: 'tours',
        tours: session.lastPicks,
        messageId: session.lastPicksMessageId ?? messageId,
      })
      return {
        annotated: byHotel.size,
        note: 'Комментарии добавлены в карточки. В своём тексте их НЕ повторяйте — только общий вывод и один вопрос.',
      }
    }

    case 'show_destinations': {
      const itemsRaw = Array.isArray(args.items) ? args.items : []
      const cards = itemsRaw
        .map((it) => {
          const rec = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
          const cardName = String(rec.name ?? '').trim()
          if (!cardName) return null
          const country = String(rec.country ?? '').trim()
          return {
            name: cardName,
            country: country || undefined,
            tagline: String(rec.tagline ?? '').trim().slice(0, 90) || undefined,
            // Photos come from the Level.Travel hotel cache only.
            image:
              findDestinationImage(cardName) ??
              (country ? findDestinationImage(country) : undefined),
            emoji: destinationEmoji(country || cardName),
          }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .slice(0, 4)
      if (!cards.length) return { error: 'Нужен items: [{name, country?, tagline?}]' }
      send(ws, { type: 'destinations', destinations: cards, messageId })
      return {
        shown: cards.length,
        note: 'Карточки направлений уже показаны в чате. Коротко прокомментируйте (1–2 фразы, БЕЗ повторения списка текстом) и задайте один вопрос, какое направление ближе.',
      }
    }

    default:
      return {
        error: `Инструмент «${name}» недоступен. В v3 есть только search_tours, get_hotel_info, get_hotel_offers. Бронирование — по ссылке на тур.`,
      }
  }
}

export async function handleKimiMessage(
  ws: WebSocket,
  session: Session,
  userText: string,
  deps: AssistantDeps,
) {
  const client = getClient()
  const model = getModel()
  const messageId = randomUUID()
  const systemPrompt = buildTotusSystemPrompt()

  if (!session.kimiMessages) {
    session.kimiMessages = [{ role: 'system', content: systemPrompt }]
  } else if (session.kimiMessages[0]?.role === 'system') {
    session.kimiMessages[0] = { role: 'system', content: systemPrompt }
  }

  session.history.push({ role: 'user', content: userText })
  session.kimiMessages.push({ role: 'user', content: userText })

  // Clear the per-turn search dedup cache so a legitimate new search in this
  // message can run; it only blocks identical repeats *within* the same turn.
  session.lastSearchSignature = undefined
  session.lastSearchResult = undefined

  send(ws, { type: 'typing' })

  let guard = 0
  while (guard < 8) {
    guard += 1

    const provider = resolveProvider()
    // `thinking` is a DeepSeek-only field, absent from the OpenAI schema, so the
    // body is assembled separately and cast once — casting the call itself made
    // the return type ambiguous (streaming vs non-streaming union).
    const requestBody: Record<string, unknown> = {
      model,
      messages: session.kimiMessages as ChatCompletionMessageParam[],
      tools: TOUR_TOOLS,
      tool_choice: 'auto',
      temperature: provider.temperature,
    }
    if (provider.thinkingDisabled) requestBody.thinking = { type: 'disabled' }

    const completion = await client.chat.completions.create(
      requestBody as unknown as ChatCompletionCreateParamsNonStreaming,
    )

    const choice = completion.choices[0]
    const assistantMessage = choice.message
    const finishReason = choice.finish_reason

    if (finishReason === 'tool_calls' && assistantMessage.tool_calls?.length) {
      // Keep every field the provider sent (including DeepSeek's
      // `reasoning_content`) — thinking mode requires it echoed back verbatim.
      session.kimiMessages.push({ ...assistantMessage } as ChatCompletionMessageParam)

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== 'function') continue
        let toolArgs: Record<string, unknown> = {}
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>
        } catch {
          toolArgs = {}
        }
        send(ws, {
          type: 'tool',
          tool: {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolArgs,
            status: 'running',
            label: toolLabel(toolCall.function.name, toolArgs),
          },
          messageId,
        })
        const traceFrom = apiTraceLength()
        const result = await runTool(
          toolCall.function.name,
          toolArgs,
          deps,
          session,
          ws,
          messageId,
        )
        const apiCalls = summarizeApiCalls(apiTraceSince(traceFrom))
        logEvent({
          session: session.logId ?? 'unknown',
          kind: 'tool',
          tool: toolCall.function.name,
          args: toolArgs,
          summary: toolSummary(toolCall.function.name, result),
        })
        const resultError =
          result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)
        send(ws, {
          type: 'tool',
          tool: {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolArgs,
            status: resultError ? 'error' : 'done',
            label: toolLabel(toolCall.function.name, toolArgs),
            summary: toolSummary(toolCall.function.name, result),
            api_calls: apiCalls.length ? apiCalls : undefined,
          },
          messageId,
        })
        session.kimiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }
      continue
    }

    const content = assistantMessage.content ?? 'Чем ещё могу помочь с подбором?'
    session.kimiMessages.push({ role: 'assistant', content })
    session.history.push({ role: 'assistant', content })
    logEvent({ session: session.logId ?? 'unknown', kind: 'assistant', text: content })

    const chunks = content.match(/.{1,14}/gs) ?? [content]
    for (const chunk of chunks) {
      if (ws.readyState !== ws.OPEN) return
      send(ws, { type: 'token', content: chunk, messageId })
      await new Promise((r) => setTimeout(r, 10))
    }
    send(ws, { type: 'done', messageId })
    return
  }

  send(ws, {
    type: 'error',
    error: 'Слишком много шагов инструментов. Попробуйте ещё раз через минуту.',
  })
}

export function kimiStatus() {
  const cfg = totusConfig()
  return {
    enabled: isKimiEnabled(),
    model: getModel(),
    baseURL: resolveProvider().baseURL,
    agent: cfg.agentName,
    brand: 'Тотус клуб',
    prompt: 'v3-assistant',
  }
}
