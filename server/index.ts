import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { SCHEMA_TABLES } from './data.js'
import { handleAssistantMessage, createSession, type Session } from './assistant.js'
import { kimiStatus } from './kimi.js'
import {
  BUILD_TAG,
  buildBookingUrl,
  fetchHotelReferenceRaw,
  fetchHotelReviewsRaw,
  getCachedTour,
  getHotelSearchContext,
  getHotelOffers,
  getLastSearchContext,
  groupOffersByRoom,
  isLevelTravelEnabled,
  levelTravelStatus,
  loadCountries,
  loadDepartures,
  searchLevelTravelPackages,
  searchPopularLevelTravel,
  supportedCountries,
} from './levelTravel.js'
import { logDir, readRecentLog, readSessions } from './chatLog.js'
import type { BookingRequest, SearchFilters, Tour } from './types.js'

const PORT = Number(process.env.PORT ?? 3011)
const CORS_ORIGINS = (process.env.CORS_ORIGINS ??
  'http://localhost:3012,https://ai.totus.club,https://totus.club,https://www.totus.club')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const bookings: Array<
  BookingRequest & {
    booking_id: string
    status: string
    total_price: number
    created_at: string
  }
> = []

const app = express()
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin) and configured frontends.
      if (!origin || CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    credentials: true,
  }),
)
app.use(express.json())

async function searchTours(query: Partial<SearchFilters>): Promise<Tour[]> {
  if (!isLevelTravelEnabled()) {
    throw new Error('LEVEL_TRAVEL_API_KEY is missing. Add your partner token to .env')
  }

  const nights = query.nights || (query.duration === 'half-day' || query.duration === 'full-day' ? 3 : 7)

  if (query.destination?.trim()) {
    const result = await searchLevelTravelPackages({
      destination: query.destination,
      fromCity: query.fromCity,
      nights,
      adults: query.adults,
      kids: query.kids,
      startDate: query.startDate || query.dateFrom || undefined,
      starsFrom: query.starsFrom,
      starsTo: query.starsTo,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      sortBy: query.sortBy,
      limit: 200,
    })
    return result.tours
  }

  return searchPopularLevelTravel()
}

function findTour(id: string) {
  return getCachedTour(id)
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'tour-assistant',
    kimi: kimiStatus(),
    levelTravel: levelTravelStatus(),
  })
})

app.get('/api/tours', async (req, res) => {
  const filters: Partial<SearchFilters> = {
    fromCity: String(req.query.fromCity ?? 'Moscow'),
    destination: String(req.query.destination ?? ''),
    nights: req.query.nights ? Number(req.query.nights) : 7,
    adults: req.query.adults ? Number(req.query.adults) : 2,
    kids: req.query.kids ? Number(req.query.kids) : 0,
    startDate: String(req.query.startDate ?? req.query.dateFrom ?? ''),
    starsFrom: req.query.starsFrom ? Number(req.query.starsFrom) : 1,
    starsTo: req.query.starsTo ? Number(req.query.starsTo) : 5,
    priceMin: req.query.priceMin ? Number(req.query.priceMin) : 0,
    priceMax: req.query.priceMax ? Number(req.query.priceMax) : 500000,
    sortBy: (String(req.query.sortBy ?? 'price') as SearchFilters['sortBy']) || 'price',
  }
  try {
    const tours = await searchTours(filters)
    res.setHeader('X-Tour-Source', 'level.travel')
    res.json(tours)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    console.error('[level.travel]', message)
    res.status(502).json({
      error: message,
      source: 'level.travel',
      tours: [],
    })
  }
})

app.get('/api/tours/:id', (req, res) => {
  const tour = findTour(req.params.id)
  if (!tour) {
    res.status(404).json({
      error: 'Tour not found. Search again from the home page (results are cached from Level.Travel).',
    })
    return
  }
  res.json(tour)
})

/** Which destinations we can actually search. */
app.get('/api/debug/countries', (_req, res) => {
  const list = supportedCountries()
  res.json({ count: list.length, countries: list })
})

/** Raw hotel reference — diagnostics only, lets us see the real field names. */
app.get('/api/debug/hotel/:id', async (req, res) => {
  const hotelId = Number(String(req.params.id).replace(/^lt_/, ''))
  if (!Number.isFinite(hotelId)) {
    res.status(400).json({ error: 'bad hotel id' })
    return
  }
  try {
    res.json(await fetchHotelReferenceRaw(hotelId))
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

/** Raw reviews response — diagnostics only. */
app.get('/api/debug/reviews/:id', async (req, res) => {
  const hotelId = Number(String(req.params.id).replace(/^lt_/, ''))
  if (!Number.isFinite(hotelId)) {
    res.status(400).json({ error: 'bad hotel id' })
    return
  }
  try {
    res.json(await fetchHotelReviewsRaw(hotelId, 5))
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

/** Diagnostic journal of real dialogues — for debugging, not for customers. */
app.get('/api/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200) || 200, 2000)
  const session = req.query.session ? String(req.query.session) : undefined
  res.json({ dir: logDir(), entries: readRecentLog(limit, session) })
})

app.get('/api/logs/sessions', (_req, res) => {
  res.json({ dir: logDir(), sessions: readSessions(50) })
})

app.get('/api/tours/:id/rooms', async (req, res) => {
  const hotelIdForCtx = Number(String(req.params.id).replace(/^lt_/, ''))
  const ctx =
    (Number.isFinite(hotelIdForCtx) ? getHotelSearchContext(hotelIdForCtx) : undefined) ??
    getLastSearchContext()
  if (!ctx) {
    res.status(409).json({
      error: 'Нет активного поиска — типы номеров появятся после поиска туров в чате.',
      rooms: [],
    })
    return
  }
  const hotelId = Number(String(req.params.id).replace(/^lt_/, ''))
  if (!Number.isFinite(hotelId)) {
    res.status(400).json({ error: 'Некорректный id тура', rooms: [] })
    return
  }
  try {
    const offers = await getHotelOffers({
      requestId: ctx.requestId,
      hotelId,
      operatorIds: ctx.okOperators,
    })
    const rooms = groupOffersByRoom(offers).map((r) => ({
      ...r,
      booking_url: buildBookingUrl({ tourId: r.sample_tour_id, hotelId, room: r.room_type }),
    }))
    res.json({ hotel_id: hotelId, rooms })
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Не удалось получить номера',
      rooms: [],
    })
  }
})

app.get('/api/tours/:id/availability', (req, res) => {
  const tour = findTour(req.params.id)
  if (!tour) {
    res.status(404).json({ error: 'Tour not found' })
    return
  }
  const date = String(req.query.date ?? '')
  const guests = Number(req.query.guests ?? 1)
  const available =
    (tour.available_dates.includes(date) || tour.available_dates.length === 0) &&
    guests <= tour.max_group_size
  res.json({
    tour_id: tour.id,
    date,
    available,
    spots_left: available ? Math.max(2, tour.max_group_size - guests) : 0,
    price: tour.price,
  })
})

app.post('/api/bookings', (req, res) => {
  const body = req.body as BookingRequest
  const tour = findTour(body.tour_id)
  if (!tour) {
    res.status(404).json({ error: 'Tour not found' })
    return
  }
  if (!body.date || !body.contact_email || !body.guests) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }
  const booking = {
    ...body,
    booking_id: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
    status: 'confirmed' as const,
    total_price: tour.price * body.guests,
    created_at: new Date().toISOString(),
    tour_name: tour.name,
  }
  bookings.push(booking)
  res.status(201).json(booking)
})

app.get('/api/schema', (_req, res) => {
  res.json(SCHEMA_TABLES)
})

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/assistant' })
const sessions = new WeakMap<WebSocket, Session>()

wss.on('connection', (ws) => {
  sessions.set(ws, createSession())

  ws.on('message', async (raw) => {
    let payload: {
      type?: string
      content?: string
      messages?: Array<{ role?: string; content?: string }>
    }
    try {
      payload = JSON.parse(String(raw))
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Некорректное сообщение' }))
      return
    }

    if (payload.type === 'reset') {
      sessions.set(ws, createSession())
      return
    }

    // Switching back to an older chat: rebuild the server-side context from the
    // history the browser kept, otherwise the assistant would "forget" what the
    // conversation was about the moment the customer reopens it.
    if (payload.type === 'restore') {
      const restored = createSession()
      const history = Array.isArray(payload.messages) ? payload.messages : []
      for (const m of history.slice(-40)) {
        const role = m?.role === 'assistant' ? 'assistant' : 'user'
        const content = typeof m?.content === 'string' ? m.content.trim() : ''
        if (!content) continue
        restored.history.push({ role, content })
      }
      sessions.set(ws, restored)
      return
    }

    if (payload.type !== 'chat' || !payload.content) return

    const session = sessions.get(ws) ?? createSession()
    sessions.set(ws, session)

    try {
      await handleAssistantMessage(ws, session, payload.content, {
        filterTours: async (query) =>
          searchTours({
            destination: query.destination,
            fromCity: 'Moscow',
            nights: 7,
            adults: 2,
            kids: 0,
            startDate: '',
            starsFrom: 1,
            starsTo: 5,
            priceMin: 0,
            priceMax: 500000,
            sortBy: 'price',
            category: (query.category as SearchFilters['category']) ?? 'all',
          }),
        getTour: (id: string) => findTour(id),
        createBooking: (body: BookingRequest) => {
          const tour = findTour(body.tour_id)
          const booking = {
            booking_id: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
            status: (tour ? 'confirmed' : 'pending') as 'confirmed' | 'pending',
            total_price: tour ? tour.price * body.guests : 0,
            created_at: new Date().toISOString(),
            tour_name: tour?.name ?? 'Заявка менеджеру',
            date: body.date,
            guests: body.guests,
          }
          bookings.push({ ...body, ...booking })
          return booking
        },
      })
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: 'error',
          error: err instanceof Error ? err.message : 'Ошибка ассистента',
        }),
      )
    }
  })
})

server.listen(PORT, () => {
  const kimi = kimiStatus()
  const lt = levelTravelStatus()
  console.log(`Тотус клуб API + WS on http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/ws/assistant`)
  console.log(
    kimi.enabled
      ? `Kimi: ON · ${kimi.agent} · model=${kimi.model}`
      : 'Kimi: OFF',
  )
  console.log(
    lt.enabled
      ? `Level.Travel: ON · v${lt.version} · ${lt.baseURL} (real data only) · ${BUILD_TAG}`
      : 'Level.Travel: OFF — set LEVEL_TRAVEL_API_KEY',
  )
  // Pull the canonical departure-city spellings from Level.Travel so the API
  // names never have to be guessed (background, non-blocking).
  void loadDepartures()
  void loadCountries()
})
