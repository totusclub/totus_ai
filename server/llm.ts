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
  findDestinationImage,
  hotelPageUrl,
  looksLikeHotelName,
  resolveFromCity,
  searchLevelTravelPackages,
  splitFeatures,
  type HotelInfo,
} from './levelTravel.js'
import { confirmFeatures, evidenceComment, researchHotel, type FeatureConfirmation } from './hotelFacts.js'
import { fallbackReply, findMachineTalk, humanizeReply, removeMadeUpPhones, stripTemplateOpener } from './humanTone.js'
import { assertNoPiiInRequest, guardContext } from './pii/guard.js'

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
          stars_max: { type: 'integer', minimum: 1, maximum: 5, description: 'Только если клиент ограничил сверху («не дороже четвёрки»)' },
          min_rating: {
            type: 'number',
            description: 'Минимальный рейтинг отеля по 10-балльной шкале (8 = «хорошие отзывы», 9 = «отличные»)',
          },
          resorts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Курорты/регионы внутри страны, по-русски: ["Кемер"], ["Анталья", "Белек"], ["Хургада"]. Лара, Кунду, Конъяалты — это «Анталья». Несколько курортов — destination = страна, курорты сюда.',
          },
          rest_type: {
            type: 'string',
            enum: ['beach', 'sightseeing', 'ski'],
            description:
              'Тип отдыха. beach — только пляжные курорты (без Стамбула, Каппадокии и т.п.). Ставь beach для любого запроса про море, пляж, аквапарк, всё включено, если курорты не названы.',
          },
          beach_lines: {
            type: 'array',
            items: { type: 'integer', enum: [1, 2, 3] },
            description: 'Линии пляжа. «Первая или вторая линия» → [1, 2]. Только первая — first_line=true.',
          },
          beach_type: {
            type: 'string',
            enum: ['собственный', 'общественный'],
            description: 'Собственный пляж отеля или общественный',
          },
          hotel_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Отель', 'Апарт-отель', 'Апартаменты', 'Вилла', 'Гостевой дом', 'Мини-отель', 'Бунгало', 'Коттедж', 'Пансионат', 'Хостел'],
            },
            description: 'Тип размещения — только если клиент назвал',
          },
          categories: {
            type: 'array',
            items: { type: 'string', enum: ['для семьи', 'для пар', 'активный отдых'] },
            description: 'Категория отеля: «семейный отель» → для семьи, «романтика вдвоём» → для пар',
          },
          instant_confirm: {
            type: 'boolean',
            description: 'Только туры с мгновенным подтверждением брони',
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
            description: 'AI включает и «всё включено 24 часа», и «премиум всё включено»',
          },
          features: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'аквапарк',
                'водные горки',
                'бассейн',
                'детский бассейн',
                'подогреваемый бассейн',
                'детский клуб',
                'детское меню',
                'няня',
                'кондиционер',
                'парковка',
                'бар',
                'массаж',
                'термальные процедуры',
                'бесплатный wifi',
                'только для взрослых',
                'без одиноких мужчин',
                'прямой перелёт',
                'анимация',
                'крытый бассейн',
                'спа',
                'фитнес',
                'теннис',
                'семейные номера',
              ],
            },
            description:
              'Удобства отеля и перелёта. Всё от «аквапарк» до «прямой перелёт» отбирается по всем отелям направления. Анимация, крытый бассейн, спа, фитнес, теннис, семейные номера проверяются по описанию каждого отеля и отзывам гостей: в ответе у отеля будет confirmed_features.',
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
      name: 'hotel_rooms_page',
      description:
        'Любой вопрос про номера: какие номера есть, цена конкретного номера, ванна, балкон, вид, кроватка, кровати, соединительная дверь, этаж, «покажи номера». Номера Мила НЕ подбирает: инструмент показывает клиенту карточку отеля с кнопкой на страницу отеля на totus.club, где все номера с ценами на его даты. Возвращает hotel_page_url и общие сведения о номерах отеля.',
      parameters: {
        type: 'object',
        required: ['hotel_id'],
        properties: {
          hotel_id: { type: 'integer' },
          question: { type: 'string', description: 'Что клиент хочет знать о номере (коротко), например «ванна в номере»' },
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
      name: 'research_hotel',
      description:
        'Всё, что известно о конкретной стороне отеля: анимация, аквапарк, детский клуб, пляж и море, кухня и рестораны, номера, территория, спа, шум, персонал, трансфер и т.п. Сам проверяет описание и удобства отеля, затем отзывы гостей, и возвращает готовые факты. Вызывай на ЛЮБОЙ вопрос о конкретном отеле, на который нет ответа в уже полученных данных.',
      parameters: {
        type: 'object',
        required: ['hotel_id', 'topic'],
        properties: {
          hotel_id: { type: 'integer' },
          topic: {
            type: 'string',
            description: 'О чём вопрос, 1–3 слова по-русски: «анимация», «пляж», «детский клуб», «рестораны a la carte», «номера для семьи»',
          },
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
                  description: 'До 90 знаков, без markdown. ТОЛЬКО факты из выдачи поиска, confirmed_features/evidence, get_hotel_info или research_hotel по этому отелю. ЗАПРЕЩЕНО: любые цены и суммы (они уже есть в карточке) и коды питания (UAI, AI, HB, BB) — пиши «Ультра всё включено», «Всё включено», «Полупансион», «Завтраки». Запрещено упоминать удобства (аквапарк, a la carte, спа), если они не подтверждены данными. Пример: «Песчаный пляж, 1-я линия, ультра всё включено»',
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

export function isLlmEnabled() {
  return Boolean(process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY)
}

/**
 * Provider resolution. The project speaks the OpenAI protocol, so switching the
 * model is only env vars: LLM_* overrides, otherwise DeepSeek defaults.
 * DeepSeek: base https://api.deepseek.com, model deepseek-v4-flash
 * (legacy aliases deepseek-chat/reasoner are retired after 2026-07-24).
 */
function resolveProvider() {
  const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY
  const baseURL = process.env.LLM_BASE_URL || 'https://api.deepseek.com'
  const model = process.env.LLM_MODEL || 'deepseek-v4-flash'
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
  if (!apiKey) throw new Error('LLM_API_KEY / DEEPSEEK_API_KEY is not set')

  return new OpenAI({ apiKey, baseURL })
}

function getModel() {
  return resolveProvider().model
}

/**
 * The ONLY way to call DeepSeek. Every request passes the personal-data check
 * first: a user message with personal data stops the request (PiiBlockedError),
 * Mila's earlier replies are masked. A new call site cannot forget the check.
 */
async function callDeepSeek(client: OpenAI, body: Record<string, unknown>, hotelNames?: string[]) {
  const safe = assertNoPiiInRequest(body as { messages?: Array<{ role?: string; content?: unknown }> }, guardContext({ hotelNames }))
  return client.chat.completions.create(safe as unknown as ChatCompletionCreateParamsNonStreaming)
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])
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

/**
 * Top for «отели с классной анимацией»: the hotel guests praise most first,
 * then the usual diverse picks among confirmed hotels, then the rest.
 */
function pickSoftFeatureTop(
  pool: Tour[],
  limit: number,
  confirmedCount: number,
  praiseOf: (t: Tour) => number,
) {
  const confirmed = pool.slice(0, confirmedCount)
  const rest = pool.slice(confirmedCount)
  const first = confirmed[0]
  const praised = first && praiseOf(first) > 0
  const kayak = praised
    ? pickKayakStyle(confirmed.slice(1), Math.max(limit - 1, 0))
    : pickKayakStyle(confirmed, limit)
  const labels = new Map(kayak.labels)
  const picks: Tour[] = praised ? [first, ...kayak.picks] : [...kayak.picks]
  if (praised) labels.set(first.id, 'гости хвалят больше всего')
  for (const t of rest) {
    if (picks.length >= limit) break
    picks.push(t)
  }
  return { picks: picks.slice(0, limit), labels }
}

/**
 * What the model sees when a tool fails: no supplier names, HTTP codes or
 * "сбой" — those words used to end up in the reply verbatim. The raw error
 * stays in the journal.
 */
export function sanitizeToolResult(name: string, result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  const r = result as Record<string, unknown>
  if (typeof r.error !== 'string') return result
  if (r.error === 'destination_not_supported') return result
  if (/^Нужен |^Нет показанных/.test(r.error)) return result
  const notes: Record<string, string> = {
    search_tours:
      'Подобрать варианты прямо сейчас не получилось. Не говорите о сбое, системе или поиске. Повторите search_tours один раз, слегка изменив даты (±1–2 дня). Если снова пусто — продолжайте разговор по сути (направление, курорты, сезон) и предложите посмотреть соседние даты.',
    get_hotel_info: 'Вызовите research_hotel с нужной темой — он соберёт факты об отеле.',
    get_hotel_reviews: 'Вызовите research_hotel с нужной темой — он соберёт, что пишут гости.',
    hotel_rooms_page:
      'Не говорите о сбое. Скажите, что все номера с ценами — на странице отеля на totus.club (кнопка на карточке отеля), а детали по конкретному номеру подтвердит наш оператор в личном кабинете: «Чат с поддержкой» или «Звонок в поддержку».',
  }
  return { error: 'unavailable', note: notes[name] ?? 'Продолжайте разговор по сути, без упоминания технических проблем.' }
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
    .filter((x) => !/₽|руб|\d{4,}|\d{1,3}(?:[\s\u00A0]\d{3})+/i.test(x))
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

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

/** «2026-11-17» → «17 ноября» (the year only when it is not the current one). */
export function humanDate(iso: string, now = new Date()): string {
  const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  const sameSeason = y === now.getFullYear() || (y === now.getFullYear() + 1 && mo < now.getMonth() + 1)
  return `${d} ${MONTHS_GEN[mo - 1]}${sameSeason ? '' : ` ${y}`}`
}

/** Human-readable step label for the "thinking process" shown in chat. */
function toolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'search_tours': {
      const dest = String(args.destination ?? '').trim()
      const list = Array.isArray(args.hotel_names)
        ? (args.hotel_names as unknown[]).map((x) => String(x).trim()).filter(Boolean)
        : [String(args.hotel_name ?? '').trim()].filter(Boolean)
      const names = list.length > 2 ? `${list.slice(0, 2).join(', ')} и ещё ${list.length - 2}` : list.join(', ')
      const date = humanDate(String(args.start_date_from ?? ''))
      const bits = [dest, names, date ? `с ${date}` : ''].filter(Boolean).join(', ')
      return `Подбираю туры${bits ? ` — ${bits}` : ''}`
    }
    case 'get_hotel_info':
      return 'Изучаю отель'
    case 'get_hotel_reviews':
      return 'Смотрю, что пишут гости'
    case 'research_hotel':
      return `Узнаю подробности${args.topic ? ` — ${String(args.topic).slice(0, 40)}` : ''}`
    case 'get_hotel_offers':
    case 'hotel_rooms_page':
      return 'Открываю страницу отеля'
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
        ? Array.isArray((r as { filters_applied?: unknown }).filters_applied)
          ? `всего отелей ${raw}, под ваши пожелания (${((r as { filters_applied: string[] }).filters_applied).join(', ')}) — ${Number(r.hotels_matching_filters ?? total)}`
          : `в выдаче ${raw} отелей, после фильтров ${total}`
        : `найдено отелей: ${total}`
    }
    case 'get_hotel_offers':
    case 'hotel_rooms_page':
      return r.hotel_page_url ? 'страница отеля' : 'карточка отеля'
    case 'get_hotel_info':
      return 'карточка получена'
    case 'get_hotel_reviews':
      return `отзывов: ${Number((result as Record<string, unknown>)?.count ?? 0)}`
    case 'research_hotel':
      return `фактов: ${Array.isArray(r.facts) ? r.facts.length : 0}`
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
      // message turn. The model's tool loop can call search_tours several times; if
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
      const requestedFeatures = Array.isArray(args.features) ? (args.features as unknown[]).map(String) : []
      const softFeatures = splitFeatures(requestedFeatures).rest
      const hardFeatures = requestedFeatures.filter((f) => !softFeatures.includes(f.trim().toLowerCase()))

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
          starsTo: args.stars_max ? Number(args.stars_max) : undefined,
          // Hotel ratings are on a 10-point scale; a 5-point value («от 4.5»)
          // used to wipe out the whole list.
          minRating: args.min_rating
            ? Number(args.min_rating) <= 5
              ? Number(args.min_rating) * 2
              : Number(args.min_rating)
            : undefined,
          resorts: Array.isArray(args.resorts)
            ? args.resorts.map((x) => String(x).trim()).filter(Boolean)
            : undefined,
          restType: ['beach', 'sightseeing', 'ski'].includes(String(args.rest_type))
            ? String(args.rest_type)
            : undefined,
          beachLines: Array.isArray(args.beach_lines)
            ? args.beach_lines.map(Number).filter((n) => n >= 1 && n <= 3)
            : undefined,
          beachType:
            args.beach_type === 'собственный'
              ? 'DESIGNATED'
              : args.beach_type === 'общественный'
                ? 'PUBLIC'
                : undefined,
          hotelTypes: Array.isArray(args.hotel_types) ? (args.hotel_types as string[]) : undefined,
          categories: Array.isArray(args.categories)
            ? (args.categories as string[])
                .map((c) =>
                  c === 'для семьи' ? 'FAMILY' : c === 'для пар' ? 'COUPLES' : c === 'активный отдых' ? 'ACTIVE' : '',
                )
                .filter(Boolean)
            : undefined,
          instantConfirm: Boolean(args.instant_confirm),
          beachTypes: Array.isArray(args.beach_types)
            ? (args.beach_types as string[])
            : undefined,
          firstLine: Boolean(args.first_line),
          // Soft features (анимация, спа …) are confirmed below by the facts
          // cascade; Level.Travel gets only what it can filter itself.
          features: hardFeatures.length ? hardFeatures : undefined,
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
          limit: softFeatures.length ? 60 : Math.max(limit * 2, 20),
        })

        session.ltRequestId = result.requestId
        session.ltOkOperators = result.okOperators

        // «Отели с классной анимацией»: check every candidate against the
        // hotel card, guest reviews and the web; confirmed ones go first,
        // the ones guests praise most — at the very top.
        let pool = result.tours
        let confirmations = new Map<number, FeatureConfirmation>()
        let softConfirmed = 0
        const praiseOf = (t: Tour) => confirmations.get(Number(t.id.replace(/^lt_/, '')))?.praise ?? 0
        if (softFeatures.length && pool.length) {
          const ids = pool.map((t) => Number(t.id.replace(/^lt_/, ''))).filter(Number.isFinite)
          confirmations = await confirmFeatures(ids, softFeatures)
          const isFull = (t: Tour) =>
            (confirmations.get(Number(t.id.replace(/^lt_/, '')))?.confirmed.length ?? 0) >= softFeatures.length
          const confirmed = [...pool.filter(isFull)].sort((a, b) => praiseOf(b) - praiseOf(a))
          softConfirmed = confirmed.length
          pool =
            confirmed.length >= Math.min(3, limit)
              ? confirmed
              : [...confirmed, ...pool.filter((t) => !isFull(t))]
        }

        const { picks, labels } = softFeatures.length && softConfirmed
          ? pickSoftFeatureTop(pool, limit, softConfirmed, praiseOf)
          : pickKayakStyle(pool, limit)
        const sentPicks = picks.map((t) => ({
          ...t,
          pick_label: labels.get(t.id),
          // Fact-based fallback comment; the model replaces it with a
          // personalized one via annotate_hotels.
          comment:
            evidenceComment(confirmations.get(Number(t.id.replace(/^lt_/, '')))) ?? hotelFallbackComment(t),
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
        // result.tours is capped by the limit we asked for: «нашлось 20»
        // was the cap, not the real number. Report a total only when it is
        // known — the booking system's count, or a list that was not cut off.
        const askedLimit = softFeatures.length ? 60 : Math.max(limit * 2, 20)
        const knownTotal =
          typeof result.stats?.ltHotelsCount === 'number'
            ? result.stats.ltHotelsCount
            : result.tours.length < askedLimit
              ? result.tours.length
              : undefined
        const payload = {
          count: picks.length,
          total_found: knownTotal,
          more_available: knownTotal === undefined ? true : knownTotal > picks.length || undefined,
          search_stats: result.stats,
          name_filter_miss: nameMiss || undefined,
          departure_city: departure,
          nights,
          start_date: startDate,
          price_range:
            minPrice != null ? { from: minPrice, to: maxPrice, currency: 'RUB' } : null,
          features_requested: args.features ?? [],
          features_filter_applied: softFeatures.length
            ? softConfirmed > 0
            : result.stats?.featuresApplied ?? false,
          soft_features_confirmed_hotels: softFeatures.length ? softConfirmed : undefined,
          // Filters the booking system applied to the WHOLE result set: every
          // hotel in `hotels` satisfies each of them.
          filters_applied: result.stats?.ltFiltersApplied?.length ? result.stats.ltFiltersApplied : undefined,
          filters_not_available: result.stats?.ltFiltersUnavailable?.length
            ? result.stats.ltFiltersUnavailable
            : undefined,
          hotels_matching_filters: result.stats?.ltHotelsCount,
          assumed_country: result.stats?.assumedCountry,
          features_matched: result.stats?.featuresMatched,
          hotels: picks.map((t) => {
            const c = confirmations.get(Number(t.id.replace(/^lt_/, '')))
            return {
              ...summarizeTourCard(t),
              pick_label: labels.get(t.id),
              confirmed_features: softFeatures.length ? (c?.confirmed ?? []) : undefined,
              evidence: c && Object.keys(c.evidence).length
                ? Object.fromEntries(Object.entries(c.evidence).map(([f, e]) => [f, `${e.source === 'guests' ? 'гости: ' : ''}${e.text}`]))
                : undefined,
              guests_praise: c?.praise || undefined,
            }
          }),
          note:
            picks.length === 0 && nameMiss
              ? `По направлению найдено ${result.stats?.raw ?? 0} отелей, но по названию совпадений нет. Скажите клиенту по-человечески: на эти даты именно этого отеля (бренда) среди вариантов нет — без слов «система», «поиск», «не найден в базе». Предложите соседние даты или похожие отели того же уровня рядом и уточните написание названия, если оно необычное.`
              : picks.length === 0 && result.stats?.ltFiltersApplied?.length
              ? `Под все пожелания сразу (${result.stats.ltFiltersApplied.join('; ')}) на эти даты отелей нет. Скажите клиенту честно и по-человечески, без слов «фильтр» и «система» (например: «с аквапарком и на первой линии в Кемере на эти даты ничего нет — посмотрим вторую линию или Белек?»), либо сами ослабьте одно пожелание (курорт, звёзды, линия, даты ±3 дня) и повторите поиск.`
              : picks.length === 0
              ? 'Пустая выдача — ослабьте фильтры (даты ±3–5 дней, звёзды, бюджет, соседний курорт) и повторите поиск.'
              : 'Карточки отелей УЖЕ показаны клиенту. ФИЛЬТРЫ: всё из filters_applied система применила ко всей выдаче — у КАЖДОГО показанного отеля это есть (например, «аквапарк» в filters_applied = аквапарк у всех отелей подтверждён), об этом можно говорить уверенно и писать в комментариях. hotels_matching_filters — сколько всего отелей подошло. filters_not_available — таких вариантов в этом поиске нет вообще: скажите об этом честно и предложите замену. Удобства вроде анимации, спа, тенниса: у каждого отеля есть confirmed_features и evidence — что подтверждено и чем (описание отеля, гости). Подтверждённое называйте уверенно, своими словами («гости очень хвалят вечерние шоу»). У отеля без подтверждения не утверждайте удобство и не говорите, что его нет или что «информации нет» — просто не делайте на нём акцент; если клиент спросит именно про него, вызовите research_hotel. НИКОГДА не говорите, что поиск по аквапарку, детскому клубу, бассейну и т.п. невозможен — он работает. ГОВОРИТЕ ПО-ЧЕЛОВЕЧЕСКИ: клиенту не нужны слова «фильтр», «система», «выдача», «применено» — скажите как турагент: «подобрала пятёрки в Анталье, где есть аквапарк». Сколько всего отелей нашлось — не пересказывайте (total_found и hotels_matching_filters — для вас, а не для клиента), разве что клиент сам спросил. СЛЕДУЮЩИЙ ШАГ: annotate_hotels — по одной фразе на отель, ТОЛЬКО по фактам из выдачи, filters_applied и evidence (пляж, линия, питание, удобства, впечатления гостей, рейтинг, pick_label). Потом текст: 1–2 фразы + один вопрос, без markdown и ссылок.',
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
          'Ищите ответ в facilities и description. Если нужного там нет — НЕ говорите клиенту «информации нет», а вызовите research_hotel(hotel_id, topic): он проверит отзывы гостей.',
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

    // Owner, 18.10.2026: «наш ИИ не ищет по номерам, пока у нас этого нет —
    // когда вопрос про номер: вот вам страница на totus.club, выбирайте, дальше
    // спросите у нашего оператора». No room search, no room cards: the hotel
    // card with the button to the hotel page, plus general facts about rooms.
    case 'get_hotel_offers':
    case 'hotel_rooms_page': {
      const hotelId = Number(args.hotel_id)
      if (!Number.isFinite(hotelId)) return { error: 'Нужен hotel_id' }
      const [pageUrl, facts] = await Promise.all([
        hotelPageUrl(hotelId).catch(() => undefined),
        withTimeout(researchHotel(hotelId, 'номера'), 8000).catch(() => null),
      ])
      const tour = getCachedTour(`lt_${hotelId}`)
      if (tour) send(ws, { type: 'tours', tours: [{ ...tour, ...(pageUrl ? { link: pageUrl } : {}) }], messageId })
      const hotel = getCachedHotel(hotelId)
      return {
        hotel_id: hotelId,
        hotel_name: hotel?.name ?? tour?.name,
        hotel_card_shown: Boolean(tour),
        hotel_page_url: pageUrl,
        room_facts: facts?.facts.map((f) => f.text).slice(0, 5) ?? [],
        note:
          'Номера ты НЕ подбираешь и цены отдельных номеров не называешь. Скажи по-человечески: все номера с ценами на даты клиента — на странице отеля на totus.club' +
          (tour ? ' (кнопка «Перейти к бронированию» на карточке отеля выше)' : ', ссылка — hotel_page_url (напиши её текстом один раз, без markdown)') +
          ', выбрать номер можно там. Если клиенту важна конкретика номера (ванна, кроватка, кровати, вид, этаж, соединительная дверь, звукоизоляция) — это подтвердит наш оператор: личный кабинет, «Чат с поддержкой» или «Звонок в поддержку». Из room_facts можно мягко сказать, какие номера в отеле бывают («есть семейные номера с двумя спальнями»), но не обещай, что это будет именно в его номере. Ничего не выдумывай. 2–4 фразы и один вопрос.',
      }
    }

    case 'research_hotel': {
      const hotelId = Number(args.hotel_id)
      const topic = String(args.topic ?? '').trim()
      if (!Number.isFinite(hotelId)) return { error: 'Нужен hotel_id' }
      if (!topic) return { error: 'Нужен topic — о чём вопрос' }
      const r = await researchHotel(hotelId, topic)
      return {
        hotel_id: hotelId,
        name: r.name,
        topic,
        facts: r.facts.map((f) => ({
          from: f.source === 'guests' ? 'гости' : 'отель',
          tone: f.tone,
          text: f.text,
        })),
        guests_mentions: r.guests.total || undefined,
        guests_positive: r.guests.positive || undefined,
        guests_negative: r.guests.negative || undefined,
        note: r.found
          ? 'Ответьте клиенту по сути, своими словами, как турагент, который сам всё знает: факты отеля — уверенно («в отеле есть…»), мнения гостей — «гости хвалят / отмечают / жалуются». Не называйте источники, не говорите про описание, отзывы на сайте, систему или поиск. Плюсы и минусы — честно и коротко.'
          : 'Конкретики по этой теме нет. НЕ говорите «информации нет», «не нашла», «не удалось проверить». Ответьте по сути, как опытный турагент: что обычно бывает в отелях такого уровня и типа (мягко: «как правило»), без утверждений про этот отель, и предложите полезное — подобрать похожие отели, где это точно есть, или рассказать о другом.',
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
        error: `Инструмент «${name}» недоступен. Есть search_tours, get_hotel_info, hotel_rooms_page, get_hotel_reviews, research_hotel, annotate_hotels, show_destinations. Бронирование — на странице отеля.`,
      }
  }
}

const MAX_TOOL_ROUNDS = 10

export const ANKETA_NUDGE =
  'Стоп: ты собиралась ответить клиенту анкетой (куда, когда, откуда, сколько вас) вместо подбора. Так нельзя — турагент сначала показывает варианты. Сделай поиск сейчас: недостающее подставь сама — направление самое подходящее по сезону и пожеланиям клиента (несколько подходящих стран — show_destinations), вылет из Москвы, даты — ближайший подходящий месяц, состав — из сообщения или двое взрослых; пожелания клиента передай в features и другие параметры search_tours. Потом 2–4 живые фразы: что подобрала и почему, какие допущения сделала, что из особых пожеланий подтвердит наш оператор, и ОДИН вопрос. Если клиент спрашивает не про подбор (документы, визы, правила) — просто ответь по сути и задай не больше одного вопроса.'

/**
 * A reply that asks the customer for search parameters instead of searching:
 * two or more questions, or a question about two of where / from where /
 * when / who. One question after an answer is fine.
 */
export function isQuestionnaire(text: string): boolean {
  const t = text.toLowerCase().replace(/ё/g, 'е')
  const questions = (t.match(/\?/g) ?? []).length
  const asks = [
    /(куда|какое направление|какую страну|какая страна|турция, египет|в какую сторону)[^.!]{0,60}\?|куда (хотите|смотр|планир|поед|лет)/,
    /(откуда|город вылета|из какого города)/,
    /(какие|на какие|примерно какие)[^.?!]{0,20}дат|когда (планир|хотите|собира|лет)|на какой месяц|в какой месяц/,
    /(сколько вас|сколько человек|состав|кто едет|сколько взрослых|возраст (ребенка|детей))/,
  ].filter((re) => re.test(t)).length
  return (questions >= 2 && asks >= 1) || asks >= 2
}

/** Stream a reply from Mila that did not come from the model (fallbacks). */
export async function streamHumanReply(ws: WebSocket, session: Session, text: string, messageId: string) {
  session.llmMessages?.push({ role: 'assistant', content: text })
  session.history.push({ role: 'assistant', content: text })
  logEvent({ session: session.logId ?? 'unknown', kind: 'assistant', text })
  for (const chunk of text.match(/.{1,14}/gs) ?? [text]) {
    if (ws.readyState !== ws.OPEN) return
    send(ws, { type: 'token', content: chunk, messageId })
    await new Promise((r) => setTimeout(r, 10))
  }
  send(ws, { type: 'done', messageId })
}

export { fallbackReply }

export async function handleLlmMessage(
  ws: WebSocket,
  session: Session,
  userText: string,
  deps: AssistantDeps,
) {
  const client = getClient()
  const model = getModel()
  const messageId = randomUUID()
  const basePrompt = buildTotusSystemPrompt()
  // A restored dialogue carries a note about hotels already shown — without it
  // "этот отель" is unresolvable, because card names never appear in the text.
  const systemPrompt = session.contextNote
    ? `${basePrompt}\n\n## Контекст восстановленного диалога\n${session.contextNote}`
    : basePrompt

  if (!session.llmMessages) {
    session.llmMessages = [{ role: 'system', content: systemPrompt }]
  } else if (session.llmMessages[0]?.role === 'system') {
    session.llmMessages[0] = { role: 'system', content: systemPrompt }
  } else {
    session.llmMessages.unshift({ role: 'system', content: systemPrompt })
  }

  session.history.push({ role: 'user', content: userText })
  session.llmMessages.push({ role: 'user', content: userText })

  // Clear the per-turn search dedup cache so a legitimate new search in this
  // message can run; it only blocks identical repeats *within* the same turn.
  session.lastSearchSignature = undefined
  session.lastSearchResult = undefined

  send(ws, { type: 'typing' })

  let guard = 0
  // One nudge per message: a questionnaire instead of a search goes back to
  // the model once (owner, 18.10.2026: of 96 detailed requests only 13 got a
  // search — the rest got «скажите, куда, когда и сколько вас»).
  let anketaNudged = false
  let searchedThisTurn = false
  while (guard < MAX_TOOL_ROUNDS) {
    guard += 1

    const provider = resolveProvider()
    // `thinking` is a DeepSeek-only field, absent from the OpenAI schema, so the
    // body is assembled separately and cast once — casting the call itself made
    // the return type ambiguous (streaming vs non-streaming union).
    const requestBody: Record<string, unknown> = {
      model,
      messages: session.llmMessages as ChatCompletionMessageParam[],
      tools: TOUR_TOOLS,
      // Last round: the model must answer with what it already has instead of
      // calling tools again (it used to end with «Слишком много шагов…»).
      tool_choice: guard >= MAX_TOOL_ROUNDS ? 'none' : 'auto',
      temperature: provider.temperature,
    }
    if (provider.thinkingDisabled) requestBody.thinking = { type: 'disabled' }

    const completion = await callDeepSeek(client, requestBody, session.lastPicks?.map((t) => t.name))

    const choice = completion.choices[0]
    const assistantMessage = choice.message
    const finishReason = choice.finish_reason

    if (finishReason === 'tool_calls' && assistantMessage.tool_calls?.length) {
      // Keep every field the provider sent (including DeepSeek's
      // `reasoning_content`) — thinking mode requires it echoed back verbatim.
      session.llmMessages.push({ ...assistantMessage } as ChatCompletionMessageParam)

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
        if (toolCall.function.name === 'search_tours' || toolCall.function.name === 'show_destinations') searchedThisTurn = true
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
          api_calls: apiCalls.length ? apiCalls : undefined,
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
            // No supplier endpoints / raw errors to the browser: the summary
            // of a failed step is neutral; details stay in the journal.
            summary: resultError ? undefined : toolSummary(toolCall.function.name, result),
          },
          messageId,
        })
        session.llmMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(sanitizeToolResult(toolCall.function.name, result)),
        })
      }
      continue
    }

    if (!anketaNudged && !searchedThisTurn && guard < MAX_TOOL_ROUNDS && isQuestionnaire(assistantMessage.content ?? '')) {
      anketaNudged = true
      logEvent({ session: session.logId ?? 'unknown', kind: 'anketa_nudge', text: (assistantMessage.content ?? '').slice(0, 300) })
      // A temporary instruction for this round only; removed right after.
      session.llmMessages.push({ role: 'system', content: ANKETA_NUDGE })
      continue
    }
    session.llmMessages = session.llmMessages.filter((m) => !(m.role === 'system' && m.content === ANKETA_NUDGE))

    let content = stripTemplateOpener(assistantMessage.content?.trim() || 'Чем ещё могу помочь с подбором?')
    // Safety net for the tone: if the reply still talks like a program
    // («система не отдаёт», «информации нет», «временный сбой», «не могу
    // обработать запрос», a made-up phone), rewrite it once as a live travel
    // agent would say it.
    const allowedPhone = totusConfig().companyPhone
    const machineTalk = findMachineTalk(content, { allowedPhone })
    if (machineTalk.length) {
      const rewritten = await humanizeReply(content, async (system, user) => {
        const body: Record<string, unknown> = {
          model,
          temperature: 0.4,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }
        if (provider.thinkingDisabled) body.thinking = { type: 'disabled' }
        const c = await callDeepSeek(client, body, session.lastPicks?.map((t) => t.name))
        return c.choices[0]?.message?.content ?? ''
      }, { allowedPhone })
      logEvent({
        session: session.logId ?? 'unknown',
        kind: 'humanize',
        found: machineTalk,
        changed: rewritten !== content,
      })
      content = rewritten
    }
    content = removeMadeUpPhones(content, allowedPhone)
    session.llmMessages.push({ role: 'assistant', content })
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

  // Not reachable in practice (the last round has tool_choice «none»), but
  // the customer still gets a human reply, never a technical error.
  session.llmMessages = session.llmMessages.filter((m) => !(m.role === 'system' && m.content === ANKETA_NUDGE))
  await streamHumanReply(ws, session, fallbackReply('stuck'), messageId)
}

export function llmStatus() {
  const cfg = totusConfig()
  return {
    enabled: isLlmEnabled(),
    model: getModel(),
    baseURL: resolveProvider().baseURL,
    agent: cfg.agentName,
    brand: 'Тотус клуб',
    prompt: 'v3-assistant',
  }
}
