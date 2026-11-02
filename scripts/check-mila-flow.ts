/**
 * End-to-end dialogue on fakes: the real server/llm.ts + server/levelTravel.ts,
 * with Level.Travel and the model replaced by a fake `fetch`. No keys needed.
 *
 *  1. «риксос парк белек мне подходит — поможешь выбрать номер?» → no room
 *     search (owner, 18.10.2026): the hotel card with a button to the hotel
 *     page on totus.club, details of a room — from our operator.
 *  2. «Хорошие отели с классной анимацией» → hotels guests praise for the
 *     animation come first, with confirmed_features for the model.
 *  3. A reply that still sounds like a program is rewritten before sending.
 *
 * Run: npx tsx scripts/check-mila-flow.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.LEVEL_TRAVEL_API_KEY = 'test-key-0123456789'
process.env.DEEPSEEK_API_KEY = 'test-key'
process.env.LLM_BASE_URL = 'https://llm.test/v1'
process.env.TOTUS_LOG_DIR = mkdtempSync(path.join(tmpdir(), 'mila-check-'))
process.env.TOTUS_DEPARTURE_CITIES = 'Москва'
delete process.env.TOTUS_BOOKING_URL_TEMPLATE

type Json = Record<string, unknown>
type Completion = { content?: string; tool?: { name: string; args: Json } }

const RIXOS = 9001
const HOTELS: Json[] = [
  { id: RIXOS, name: 'Rixos Park Belek', city: 'Белек', country: 'Турция', stars: 5, rating: 9.2 },
  { id: 9002, name: 'Alpha Family Resort', city: 'Белек', country: 'Турция', stars: 5, rating: 9.0 },
  { id: 9003, name: 'Beta Garden Hotel', city: 'Белек', country: 'Турция', stars: 5, rating: 8.6 },
  { id: 9004, name: 'Gamma Quiet Hotel', city: 'Белек', country: 'Турция', stars: 5, rating: 8.8 },
  { id: 9005, name: 'Delta Club', city: 'Белек', country: 'Турция', stars: 5, rating: 8.4 },
]
const DESCRIPTIONS: Record<number, string> = {
  [RIXOS]: 'Семейный отель. Номера: Deluxe Room, Family Room с двумя спальнями.',
  9002: 'Большой аквапарк. Анимационная команда: вечерние шоу и мини-диско.',
  9003: 'Сад и бассейн.',
  9004: 'Спокойный отель для отдыха.',
  9005: 'Анимация для детей и взрослых.',
}
const REVIEWS: Record<number, Json[]> = {
  [RIXOS]: [
    { text: 'Спасибо аниматору Саше и Ольге на ресепшене! Звоните им +90 532 123 45 67', author: 'Ирина Петрова', rating: 10 },
  ],
  9003: [
    { text: 'Анимация супер, аниматоры весёлые, каждый вечер шоу!', rating: 10 },
    { pros: 'Отличная анимация', text: 'Хороший отель', rating: 9 },
    { text: 'Аниматоры молодцы, дети в восторге', rating: 10 },
  ],
  9004: [{ text: 'Анимации нет совсем, вечером скучно.', rating: 6 }],
}

const ltCalls: string[] = []
const llmBodies: Json[] = []
let script: Completion[] = []
let enqueued = 0
// When set, the model endpoint answers with this HTTP error (no retries on 400).
let llmFailStatus = 0

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.host === 'llm.test') {
    const body = JSON.parse(String(init?.body)) as Json
    llmBodies.push(body)
    if (llmFailStatus) return json({ error: { message: 'Invalid request: model overloaded', type: 'invalid_request_error' } }, llmFailStatus)
    const isHumanize = !body.tools
    const step = isHumanize
      ? { content: 'На эти даты в Rixos Park Belek мест не вижу — сдвинем вылет на пару дней?' }
      : script.shift()
    assert.ok(step, 'модель вызвана больше раз, чем в сценарии')
    const message = step.tool
      ? { role: 'assistant', content: null, tool_calls: [{ id: `call_${llmBodies.length}`, type: 'function', function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) } }] }
      : { role: 'assistant', content: step.content }
    return json({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, message, finish_reason: step.tool ? 'tool_calls' : 'stop' }] })
  }
  ltCalls.push(`${url.pathname}?${url.searchParams.toString()}`)
  const p = url.pathname
  const q = url.searchParams
  if (p === '/search/enqueue') {
    enqueued++
    return json({ success: true, request_id: q.get('hotel_ids') ? `rid-hotel-${q.get('hotel_ids')}` : `rid-search-${enqueued}` })
  }
  if (p === '/search/status') return json({ success: true, completeness: 100, status: { 1: 'completed' } })
  if (p === '/search/get_grouped_hotels') {
    return json({ success: true, hotels_count: HOTELS.length, filters: {}, hotels: HOTELS.map((h, i) => ({ hotel: h, min_price: 300000 + i * 10000, pansion_prices: { UAI: 300000 + i * 10000 } })) })
  }
  if (p === '/search/get_hotel_offers') {
    // The chat's search has expired — exactly what the owner hit.
    if (!String(q.get('request_id')).startsWith('rid-hotel-')) return json({ success: false, message: 'Request not found' }, 404)
    return json({ success: true, hotel_offers: [
      { id: 't1', hotel_id: RIXOS, room_name: 'Family Room', pansion: { name: 'UAI' }, price: 512000 },
      { id: 't2', hotel_id: RIXOS, room_name: 'Deluxe Room', pansion: { name: 'UAI' }, price: 471000 },
    ] })
  }
  if (p === '/references/hotels') {
    const id = Number(q.get('hotel_ids'))
    const h = HOTELS.find((x) => x.id === id)
    return json({ hotels: h ? [{ hotel: { ...h, description: DESCRIPTIONS[id] } }] : [] })
  }
  const rev = p.match(/^\/references\/hotel_reviews\/(\d+)$/)
  if (rev) return json({ hotel_reviews: REVIEWS[Number(rev[1])] ?? [], total: (REVIEWS[Number(rev[1])] ?? []).length })
  return json({ success: false, message: `unexpected ${p}` }, 404)
}) as typeof fetch

const { handleLlmMessage } = await import('../server/llm.ts')
const { createSession, handleAssistantMessage, seedRestoredSession } = await import('../server/assistant.ts')
const { trimMessages } = await import('../server/chatHistory.ts')
const { logEvent, readRecentLog } = await import('../server/chatLog.ts')
const { isDryRefusal } = await import('../server/offTopic.ts')

function fakeWs() {
  const events: Json[] = []
  return { events, ws: { readyState: 1, OPEN: 1, send: (d: string) => events.push(JSON.parse(d)) } }
}
const text = (events: Json[]) => events.filter((e) => e.type === 'token').map((e) => e.content).join('')
const toolResult = (name: string) => {
  for (let i = llmBodies.length - 1; i >= 0; i--) {
    const msgs = llmBodies[i].messages as Json[]
    const callIds = new Set(
      msgs.flatMap((m) => ((m.tool_calls as Json[] | undefined) ?? []).filter((c) => (c.function as Json).name === name).map((c) => c.id)),
    )
    const res = [...msgs].reverse().find((m) => m.role === 'tool' && callIds.has(m.tool_call_id))
    if (res) return JSON.parse(String(res.content)) as Json
  }
  return undefined
}

let passed = 0
async function check(name: string, fn: () => Promise<void>) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('check-mila-flow')
const session = createSession()

await check('вопрос про номер: страница отеля на totus.club и оператор, без подбора номеров (владелец, 18.10)', async () => {
  script = [
    { tool: { name: 'search_tours', args: { destination: 'Турция', resorts: ['Белек'], start_date_from: '2026-11-01', adults: 2, kids_ages: [5, 9], stars_min: 5 } } },
    { content: 'Подобрала пятёрки в Белеке для вашей семьи. Какой отель ближе?' },
  ]
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, session, 'Белек в ноябре, двое взрослых и двое детей 5 и 9 лет, пятёрка', {} as never)
  assert.ok(a.events.some((e) => e.type === 'tours'), JSON.stringify(toolResult('search_tours')).slice(0, 400) + ' | ' + ltCalls.slice(0,6).join(' ; '))

  const offersCallsBefore = ltCalls.filter((c) => c.startsWith('/search/get_hotel_offers')).length
  const enqueueBefore = ltCalls.filter((c) => c.startsWith('/search/enqueue')).length
  script = [
    { tool: { name: 'hotel_rooms_page', args: { hotel_id: RIXOS, question: 'номер с двумя спальнями' } } },
    { content: 'Все номера с ценами — на странице отеля, кнопка на карточке. Выберите там, а детали подтвердит наш оператор.' },
  ]
  const b = fakeWs()
  await handleLlmMessage(b.ws as never, session, 'риксос парк белек мне подходит - поможешь выбрать номер?', {} as never)
  const result = toolResult('hotel_rooms_page')!
  assert.equal(result.error, undefined, JSON.stringify(result).slice(0, 200))
  assert.match(String(result.hotel_page_url), /^https:\/\/totus\.club\/hotel-details\?hotel_id=9001&/, 'ссылка на страницу отеля на totus.club')
  assert.match(String(result.note), /Чат с поддержкой/)
  assert.ok(!b.events.some((e) => e.type === 'rooms'), 'карточки номеров больше не показываются')
  const card = b.events.find((e) => e.type === 'tours') as Json | undefined
  assert.ok(card, 'карточка отеля с кнопкой на страницу отеля')
  assert.match(String(((card.tours as Json[])[0]).link), /totus\.club\/hotel-details\?hotel_id=9001/)
  assert.equal(ltCalls.filter((c) => c.startsWith('/search/get_hotel_offers')).length, offersCallsBefore, 'номера не ищутся')
  assert.equal(ltCalls.filter((c) => c.startsWith('/search/enqueue')).length, enqueueBefore, 'нового поиска по отелю нет')
  // The model does not even see a room-search tool any more.
  const tools = (llmBodies.at(-1)!.tools as Json[]).map((t) => (t.function as Json).name)
  assert.ok(tools.includes('hotel_rooms_page') && !tools.includes('get_hotel_offers'), tools.join(', '))
})

await check('в браузер не уходят адреса поставщика и сырые ошибки', async () => {
  const a = fakeWs()
  script = [{ tool: { name: 'hotel_rooms_page', args: { hotel_id: RIXOS } } }, { content: 'Готово.' }]
  await handleLlmMessage(a.ws as never, session, 'покажи номера ещё раз', {} as never)
  const wire = JSON.stringify(a.events)
  const leak = wire.match(/.{0,120}(level\.travel|api_calls|Request not found).{0,60}/i)
  assert.ok(!leak, leak?.[0])
})

await check('«хорошие отели с классной анимацией»: сначала те, что хвалят гости', async () => {
  script = [
    { tool: { name: 'search_tours', args: { destination: 'Турция', resorts: ['Белек'], start_date_from: '2026-11-01', adults: 2, stars_min: 5, features: ['анимация'], sort_by: 'rating' } } },
    { content: 'Подобрала пятёрки в Белеке, где с анимацией всё отлично.' },
  ]
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, createSession(), 'нужны хорошие отели с классной анимацией в Белеке', {} as never)
  const r = toolResult('search_tours')!
  const hotels = r.hotels as Json[]
  const names = hotels.map((h) => h.name)
  assert.equal(names[0], 'Beta Garden Hotel', `первым должен быть отель, который хвалят гости: ${names.join(', ')}`)
  assert.ok(!names.includes('Gamma Quiet Hotel'), '«анимации нет» — такой отель не показываем')
  for (const h of hotels) assert.deepEqual(h.confirmed_features, ['анимация'], String(h.name))
  assert.equal(r.features_filter_applied, true)
  const cards = (a.events.find((e) => e.type === 'tours') as Json).tours as Json[]
  assert.match(String(cards[0].comment), /^Гости: /)
})

await check('ответ «как программа» переписывается до отправки клиенту', async () => {
  script = [
    { content: 'Прошу прощения, сейчас система не отдаёт варианты по этому отелю — похоже, временный сбой на стороне поиска. Давайте попробуем через минуту, я перезапущу подбор.' },
  ]
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, createSession(), 'а номера?', {} as never)
  const sent = text(a.events)
  assert.equal(sent, 'На эти даты в Rixos Park Belek мест не вижу — сдвинем вылет на пару дней?')
  assert.ok(a.events.some((e) => e.type === 'done'))
})

// ---------------------------------------------------------------------------
// Personal data (owner's rule 12.10.2026): nothing reaches DeepSeek.
// ---------------------------------------------------------------------------
const deps = { filterTours: async () => [], getTour: () => undefined, createBooking: () => ({}) } as never
const sentToModel = () => JSON.stringify(llmBodies)

await check('сообщение с телефоном и именем не уходит в DeepSeek — клиенту предупреждение', async () => {
  const s = createSession()
  const before = llmBodies.length
  script = []
  const a = fakeWs()
  await handleAssistantMessage(a.ws as never, s, 'Меня зовут Анна Смирнова, мой номер +7 916 123-45-67, хотим в Белек', deps)
  assert.equal(llmBodies.length, before, 'модель не должна вызываться')
  assert.deepEqual((a.events.find((e) => e.type === 'pii_blocked') as Json)?.types, ['name', 'phone'])
  const warning = text(a.events)
  assert.match(warning, /^Имя или фамилию и номер телефона лучше в этот чат не писать/)
  assert.match(warning, /то же сообщение ещё раз, только без этого/)
  assert.match(warning, /«Звонок в поддержку»/)
  assert.ok(!/не обработала|уберите из сообщения/.test(warning), 'без канцелярита')
  assert.ok(!/Анна|916/.test(warning), 'значение в предупреждении не повторяется')
  assert.ok(a.events.some((e) => e.type === 'done'))
  assert.equal(s.history.length, 0, 'в сессию не попало')
  const log = JSON.stringify(readRecentLog(50))
  assert.ok(log.includes('pii_blocked') && !/Смирнова|123-45-67|916 123/.test(log), 'в журнале только тип')
})

await check('после исправления то же сообщение без данных уходит как обычно', async () => {
  const s = createSession()
  script = [{ content: 'Подобрала варианты в Белеке.' }]
  const a = fakeWs()
  await handleAssistantMessage(a.ws as never, s, 'Хотим в Белек, двое взрослых', deps)
  assert.equal(text(a.events), 'Подобрала варианты в Белеке.')
  assert.ok(!a.events.some((e) => e.type === 'pii_blocked'))
})

await check('restore: паспорт, телефон и имя из истории клиента маскируются до модели', async () => {
  const s = createSession()
  seedRestoredSession(s, {
    messages: [
      { role: 'user', content: 'паспорт 45 12 345678, звоните 89161234567' },
      { role: 'assistant', content: 'Сергей, подобрала вам отели' },
    ],
    hotels: [{ id: RIXOS, name: 'Rixos Park Belek' }, { id: 1, name: 'Иван Петров +79161234567' }],
  })
  script = [{ content: 'Пляж песчаный.' }]
  const before = llmBodies.length
  await handleAssistantMessage(fakeWs().ws as never, s, 'а пляж там какой?', deps)
  const body = JSON.stringify(llmBodies.slice(before))
  const leak = body.match(/45 12 345678|89161234567|79161234567|Сергей|Петров/)
  assert.ok(!leak, `утечка: ${leak?.[0]} … ${body.slice(Math.max(0, (leak?.index ?? 0) - 200), (leak?.index ?? 0) + 60)}`)
  assert.ok(body.includes('[скрыто: паспорт]') && body.includes('Rixos Park Belek'))
})

await check('restore заблокированного раньше сообщения не блокирует следующие вопросы', async () => {
  // Old app versions keep the blocked bubble and send it back in `restore`.
  const s = createSession()
  seedRestoredSession(s, {
    messages: [
      { role: 'user', content: 'Меня зовут Анна, телефон 89161234567, хотим в Белек' },
      { role: 'assistant', content: 'Пожалуйста, уберите из сообщения личные данные' },
    ],
    hotels: [],
  })
  script = [{ content: 'Пляж песчаный.' }]
  const before = llmBodies.length
  const a = fakeWs()
  await handleAssistantMessage(a.ws as never, s, 'А пляж там какой?', deps)
  assert.equal(llmBodies.length, before + 1, 'вопрос должен уйти в модель')
  assert.ok(!a.events.some((e) => e.type === 'pii_blocked'))
  const body = JSON.stringify(llmBodies.at(-1))
  assert.ok(body.includes('Меня зовут [скрыто: имя], телефон [скрыто: телефон]') && !/Анна|89161234567/.test(body))
})

await check('страховка перед DeepSeek: данные в контексте сессии — запрос не отправляется', async () => {
  const s = createSession()
  s.llmMessages = [{ role: 'system', content: '' }, { role: 'user', content: 'мой e-mail anna@mail.ru' }] as never
  const before = llmBodies.length
  script = [{ content: 'не должно дойти' }]
  const a = fakeWs()
  await handleAssistantMessage(a.ws as never, s, 'что с погодой в ноябре?', deps)
  assert.equal(llmBodies.length, before)
  assert.ok(a.events.some((e) => e.type === 'pii_blocked'))
  script = []
})

await check('отзывы: имена сотрудников, телефон и автор не уходят в модель', async () => {
  const s = createSession()
  script = [
    { tool: { name: 'get_hotel_reviews', args: { hotel_id: RIXOS } } },
    { content: 'Гости хвалят аниматоров.' },
  ]
  await handleLlmMessage(fakeWs().ws as never, s, 'что пишут гости про анимацию?', deps)
  const r = JSON.stringify(toolResult('get_hotel_reviews'))
  assert.ok(!/Саше|Ольге|532 123|Ирина|Петрова|author/.test(r), r)
  assert.ok(r.includes('[скрыто: имя]') && r.includes('[скрыто: телефон]'))
})

await check('история чатов (MySQL) и журнал — только с маскированными данными', async () => {
  const saved = trimMessages([{ id: '1', role: 'user', content: 'карта 2202 2000 0000 0008, ФИО Сидоров Пётр' }])
  assert.equal(saved[0].content, 'карта [скрыто: карта], ФИО [скрыто: имя] [скрыто: имя]')
  logEvent({ session: 'pii-check', kind: 'assistant', text: 'Иван, ваш номер 89161234567', args: { q: 'anna@mail.ru' } })
  const entry = readRecentLog(500, 'pii-check').at(-1)!
  assert.equal(entry.text, '[скрыто: имя], ваш номер [скрыто: телефон]')
  assert.deepEqual(entry.args, { q: '[скрыто: e-mail]' })
  assert.ok(!sentToModel().includes('anna@mail.ru'))
})

// ---------------------------------------------------------------------------
// Masha is a travel agent, not a terminal (owner, 18.10.2026).
// ---------------------------------------------------------------------------
await check('ошибка модели: клиент видит слова Маши, а не «Не удалось выполнить запрос: …»', async () => {
  const s = createSession()
  llmFailStatus = 400
  const a = fakeWs()
  try {
    await handleAssistantMessage(a.ws as never, s, 'хочу в Египет в декабре', deps)
  } finally {
    llmFailStatus = 0
  }
  assert.ok(!a.events.some((e) => e.type === 'error'), 'событие error показывается клиенту как текст ошибки')
  const t = text(a.events)
  assert.match(t, /ещё раз/)
  assert.ok(!/не удалось|ошибк|invalid|overloaded|400|запрос/i.test(t), t)
  assert.ok(a.events.some((e) => e.type === 'done'))
  assert.equal(s.history.length, 0, 'неотвеченное сообщение не остаётся в диалоге')
})

await check('много шагов подряд: последний шаг — ответ без инструментов, а не «Слишком много шагов…»', async () => {
  const s = createSession()
  const dest = { tool: { name: 'show_destinations', args: { items: [{ name: 'Египет', tagline: 'тепло' }] } } }
  script = [...Array.from({ length: 9 }, () => dest), { content: 'В декабре тепло в Египте — подобрать отели?' }]
  const before = llmBodies.length
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, s, 'куда поехать в декабре?', deps)
  const bodies = llmBodies.slice(before)
  assert.equal(bodies.length, 10)
  assert.equal(bodies.at(-1)!.tool_choice, 'none', 'на последнем шаге модель должна ответить текстом')
  assert.ok(bodies.slice(0, -1).every((b) => b.tool_choice === 'auto'))
  assert.equal(text(a.events), 'В декабре тепло в Египте — подобрать отели?')
  assert.ok(!a.events.some((e) => e.type === 'error'))
})

await check('выдуманный телефон и «Отличный выбор!» не доходят до клиента', async () => {
  script = [{ content: 'Отличный выбор! Возвратом занимается поддержка: личный кабинет, «Звонок в поддержку», либо по телефону +7 (800) 000-00-00.' }]
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, createSession(), 'хочу вернуть деньги', deps)
  const t = text(a.events)
  assert.ok(!/800|000-00-00/.test(t), t)
  assert.ok(!/^Отличный выбор/.test(t), t)
})

await check('метка шага — по-человечески: «с 17 ноября», без 2026-11-17', async () => {
  script = [
    { tool: { name: 'search_tours', args: { destination: 'Турция', start_date_from: '2026-11-17', adults: 2 } } },
    { content: 'Подобрала варианты в Турции.' },
  ]
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, createSession(), 'Турция', deps)
  const labels = a.events.filter((e) => e.type === 'tool').map((e) => String((e.tool as Json).label))
  assert.ok(labels.some((l) => /Подбираю туры — Турция, с 17 ноября/.test(l)), labels.join(' | '))
  assert.ok(!labels.some((l) => /\d{4}-\d{2}-\d{2}/.test(l)), labels.join(' | '))
  const r = toolResult('search_tours')!
  assert.equal(r.total_found, 5, 'список не обрезан — число известно')
})

await check('опыт турагента: тема сообщения попадает в промпт этого шага, светская беседа — без неё', async () => {
  script = [{ content: 'С малышом лучше короткий перелёт. Подскажите, из какого города полетите, на какие даты и сколько лет малышу?' }]
  const before = llmBodies.length
  await handleLlmMessage(fakeWs().ws as never, createSession(), 'Летим с ребёнком семи месяцев, нужна люлька в самолёте', deps)
  const sys = String(((llmBodies[before].messages as Json[])[0]).content)
  assert.match(sys, /## Опыт турагента по теме этого сообщения/)
  assert.match(sys, /младен|люльк/i)
  script = [{ content: 'Привет! Куда хочется поехать?' }]
  const b2 = llmBodies.length
  await handleLlmMessage(fakeWs().ws as never, createSession(), 'привет', deps)
  assert.ok(!/Опыт турагента/.test(String(((llmBodies[b2].messages as Json[])[0]).content)))
})

await check('посторонняя тема (рецепт борща): модель получает указание на креативный мостик, её мостик уходит клиенту (владелец, 20.10)', async () => {
  const bridge = 'Свой фирменный рецепт я храню в секрете 😉 А вот где после дня у моря вас накормят так, что захочется добавки, подскажу с радостью. Куда бы махнули?'
  script = [{ content: bridge }]
  const before = llmBodies.length
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, createSession(), 'дай рецепт борща', deps)
  assert.equal(llmBodies.length, before + 1, 'ответ сочиняет модель')
  const sys = String(((llmBodies[before].messages as Json[])[0]).content)
  assert.match(sys, /## Это сообщение не про путешествия/)
  assert.match(sys, /креативный мостик/)
  assert.ok(!/## Опыт турагента/.test(sys), 'темы базы знаний на этом шаге не нужны')
  assert.equal(text(a.events), bridge)
  assert.ok(!a.events.some((e) => e.type === 'error'))
})

await check('модель написала рецепт или стих — клиенту уходит готовый мостик к поездке', async () => {
  const cases: Array<[string, string, RegExp]> = [
    ['дай рецепт борща', 'Борщ просто!\nИнгредиенты: 500 г говядины, 2 свёклы, 300 г капусты, 3 картофелины.\nВарите бульон 1,5 часа.', /говядин|свёкл/],
    ['напиши стихотворение про кота', 'Пушистый кот на окне\nГреет лапы в тишине\nСмотрит важно на луну\nИ мурлычет про весну', /мурлычет|лапы/],
    ['а чем борщ отличается от щей?', 'Ингредиенты борща: 500 г говядины, 2 свёклы, 300 г капусты. А в щах свёклы нет.', /говядин|свёкл/],
  ]
  for (const [q, answer, leak] of cases) {
    script = [{ content: answer }]
    const a = fakeWs()
    await handleLlmMessage(a.ws as never, createSession(), q, deps)
    const t = text(a.events)
    assert.ok(!leak.test(t), t)
    assert.match(t, /поездк|отдых|тур|отел|море|махн|куда/i, t)
    assert.ok(!isDryRefusal(t), t)
  }
})

await check('модель отказала сухо («это не ко мне») — клиенту уходит креативный мостик', async () => {
  script = [{ content: 'Это не ко мне — я помогаю только с поездками.' }]
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, createSession(), 'напиши код на python для сортировки списка', deps)
  const t = text(a.events)
  assert.ok(!isDryRefusal(t), t)
  assert.match(t, /\?\s*$/, t)
})

await check('вопрос про еду в поездке — обычный ответ модели, не отказ', async () => {
  script = [{ content: 'В Грузии обязательно попробуйте хинкали и хачапури по-аджарски. Планируете поездку — подскажите, из какого города и когда?' }]
  const before = llmBodies.length
  const a = fakeWs()
  await handleLlmMessage(a.ws as never, createSession(), 'что обязательно попробовать из еды в Грузии?', deps)
  assert.equal(llmBodies.length, before + 1)
  assert.match(text(a.events), /хинкали/)
})

console.log(`check-mila-flow: ${passed} passed`)
