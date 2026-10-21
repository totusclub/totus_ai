/**
 * Live run of Mila on a real server: the dialogues from the owner's review
 * on totus.club (18.10.2026) — «Мила должна быть максимально человеком, она
 * турагент, а не терминал». Not part of `npm run check`: it needs the real
 * DeepSeek and Level.Travel behind the server.
 *
 * Run:  npx tsx scripts/mila-live-scenarios.ts                 (wss://apiv2.totus.club)
 *       MILA_WS=ws://localhost:3011/ws/assistant npx tsx scripts/mila-live-scenarios.ts
 *       … -- --only=бот,телефон                                (scenarios by name)
 *       … -- --file=scripts/fixtures/mila-500-requests.json --from=1 --limit=50 --par=3
 *            (the owner's 500 requests, 18.10.2026; --out=report.jsonl saves every reply)
 *
 * Every reply is checked for: machine talk and terminal phrases, made-up phone
 * numbers, template openers, «нашлось 20 отелей», no search when everything
 * is known, ISO dates in step labels, technical `error` events, and the honest
 * answer to «ты бот?». Test messages contain no real personal data.
 */
import { findMachineTalk } from '../server/humanTone.ts'
import { isDryRefusal, looksOffTopicAnswer, offTopicKind } from '../server/offTopic.ts'

/*
 * Правила владельца — каждый прогон оценивается и по ним, а не только по тону:
 *  1. Мила отвечает только про путешествия, туры, отели и Totus Club; рецепты,
 *     стихи, домашку, код не делает — и не отказывает сухо, а креативно
 *     переводит на поездку, как хороший продавец (20.10).
 *  2. Перед подбором уточняет откуда, куда, когда и кто — одним сообщением (19.10).
 *  3. Номера не подбирает: страница отеля на totus.club + оператор (18.10).
 *  4. Поддержка — «Чат с поддержкой» / «Звонок в поддержку» в личном кабинете, без телефонов.
 *  5. Человек, а не терминал: без «не могу обработать запрос» (18.10).
 */

const URL = process.env.MILA_WS || 'wss://apiv2.totus.club/ws/assistant'
const arg = (name: string) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? '').slice(name.length + 3)
const only = arg('only').split(',').filter(Boolean)
const FILE = arg('file')
const FROM = Number(arg('from') || 1)
const LIMIT = Number(arg('limit') || 0)
const PAR = Math.min(Math.max(Number(arg('par') || 1), 1), 5)
const OUT = arg('out')

type Expect = {
  search?: boolean // everything is known (where, when, who) — a search must run
  english?: boolean // the reply must be in English
  honest?: boolean // «ты бот?» — must not claim to be human
  noPhone?: boolean
  room?: boolean // a question about a room
  asks?: RegExp // something is missing — the reply must ask for it
  offTopic?: 'bridge' | 'answer' // not about travel → creative bridge to a trip; travel food question → a real answer
}
type Scenario = { name: string; turns: Array<[string, Expect?]> }

const SCENARIOS: Scenario[] = [
  { name: 'турция-бюджет', turns: [['хочу в турцию в ноябре на неделю, нас двое, бюджет до 200 тысяч', { asks: /(из какого города|откуда|город вылета)/i }], ['из Казани', { search: true }]] },
  { name: 'одно-слово', turns: [['в Турцию', { asks: /(из какого города|откуда|город вылета)[\s\S]*(дат|когда|месяц)|(дат|когда|месяц)[\s\S]*(из какого города|откуда|город вылета)/i }], ['нет, передумал, давай в Египет']] },
  { name: 'анимация', turns: [['нужны хорошие отели с классной анимацией'], ['а в египте?']] },
  { name: 'аля-карт', turns: [['я хочу поехать в турцию в лакшери отель, где много классных аля карт ресторанов.']] },
  { name: 'бот', turns: [['ты бот?', { honest: true }]] },
  { name: 'менеджер', turns: [['позови живого менеджера', { noPhone: true }]] },
  { name: 'возврат', turns: [['хочу отменить тур и вернуть деньги', { noPhone: true }]] },
  { name: 'жалоба', turns: [['отель был ужасный, грязь, еда отвратительная, я требую компенсацию', { noPhone: true }]] },
  { name: 'билеты', turns: [['у меня заказ, где мои билеты? вылет через 3 дня', { noPhone: true }]] },
  { name: 'документы', turns: [['какие документы нужны ребёнку для выезда за границу с одним родителем?', { noPhone: true }]] },
  { name: 'горящие', turns: [['горящие туры есть?']] },
  { name: 'english', turns: [['hi, i need a hotel in dubai for next week', { english: true }]] },
  { name: 'опечатки', turns: [['хачу в егепет в новабре с 2 детми 5 и 10 лет из спб бюжет 250к', { search: true }]] },
  { name: 'грубость', turns: [['ты тупая, ничего не можешь нормально найти']] },
  { name: 'телефон', turns: [['мой телефон 89161234567 перезвоните']] },
  { name: 'имя', turns: [['меня зовут Аня, хочу в Турцию']] },
  { name: 'бали-бюджет', turns: [['тур на Бали за 50 тысяч на двоих на 2 недели']] },
  { name: 'сочи', turns: [['хочу в турцию из Сочи']] },
  { name: 'номер', turns: [['расскажи про отель Rixos Premium Belek'], ['а какие там номера и есть ли в номере ванна?', { room: true }]] },
  { name: 'кроватка', turns: [['Можно подобрать отель, где детская кроватка именно с жёстким матрасом? Ребёнку девять месяцев, хотим в Турцию в июне', { room: true }]] },
  { name: 'ереван', turns: [['Летим из Еревана с ребёнком семи месяцев, хотим в Египет в декабре', { asks: /(москв|петербург|казан|из какого)/i }]] },
  { name: 'совет-куда', turns: [['Посоветуйте, куда поехать в отпуск', { asks: /(когда|месяц|дат)[\s\S]*(откуда|из какого города|город)|(откуда|из какого города|город)[\s\S]*(когда|месяц|дат)/i }]] },
  { name: 'совет-куда-старая-кнопка', turns: [['Не знаю куда поехать в сентябре с ребёнком 5 лет — что посоветуете?', { asks: /(когда|месяц|дат)[\s\S]*(откуда|из какого города|город)|(откуда|из какого города|город)[\s\S]*(когда|месяц|дат)/i }]] },
  { name: 'борщ', turns: [['дай рецепт борща', { offTopic: 'bridge' }]] },
  { name: 'стих', turns: [['напиши стихотворение про кота', { offTopic: 'bridge' }]] },
  { name: 'домашка', turns: [['реши задачу: поезд едет 60 км/ч, сколько он проедет за 3 часа', { offTopic: 'bridge' }]] },
  { name: 'код', turns: [['напиши код на python для сортировки списка', { offTopic: 'bridge' }]] },
  { name: 'посреди-подбора', turns: [['хочу в турцию в ноябре'], ['кстати, как сварить плов?', { offTopic: 'bridge' }]] },
  { name: 'еда-в-поездке', turns: [['что обязательно попробовать из еды в Грузии?', { offTopic: 'answer' }]] },
  { name: 'ещё-варианты', turns: [['в турцию с детьми'], ['дети 4 и 7, вылет из Москвы в начале ноября на неделю', { search: true }], ['а покажи ещё варианты']] },
]

const OPENER = /^\s*(Отличн(ый|ая|ое)\s+(выбор|вопрос|задача|план|идея)|Конечно!)/u
const COUNTS = /нашл(ось|ось всего)\s+\d+\s+(отел|вариант)|всего\s+(подходящих\s+)?(отелей\s+)?(нашлось\s+)?\d+[^.]{0,30}показала/i
const ISO = /\d{4}-\d{2}-\d{2}/
// A question about a room → the hotel page on totus.club + our operator.
const ROOM_Q = /(?<![а-яё])номер(?:а|е|ом|у|ов|ах)?(?![а-яё])(?![^.?!]{0,20}(телефон|заказ|брони|рейса|паспорт))|кроватк|ванн(?:а|ой|у)(?![а-яё])|балкон|соединительн|звукоизоляц/i
const ROOM_OK = /страниц[аеуы]\s+отеля|карточк|оператор|«Чат с поддержкой»|«Звонок в поддержку»/i
const PROMISE = /(?<![а-яё])(я\s+)?(проверю|согласую|напишу\s+в\s+отель|свяжусь\s+с\s+отелем|забронирую|закажу|гарантирую)(?![а-яё])/i
const CLAIMS_HUMAN = /(я\s+)?(живой\s+(человек|турагент)|не\s+бот|настоящий\s+человек)/i
const DECLINE = /не помощница|не мо[её] (дело|история)|не ко мне|не помогаю|не берусь|я пас/i
const ADMITS_AI = /виртуальн|искусственн|ИИ|AI|программ|нейросет/i

type Turn = { text: string; tools: string[]; labels: string[]; events: string[]; ms: number }

function runDialogue(turns: string[]): Promise<Turn[]> {
  return new Promise((resolve) => {
    // Node 22+ has a built-in WebSocket — no extra packages on the server.
    const ws = new WebSocket(URL)
    const out: Turn[] = []
    let i = 0
    let cur: Turn | null = null
    let started = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const next = () => {
      if (i >= turns.length) {
        ws.close()
        return resolve(out)
      }
      cur = { text: '', tools: [], labels: [], events: [], ms: 0 }
      out.push(cur)
      started = Date.now()
      ws.send(JSON.stringify({ type: 'chat', content: turns[i++] }))
      clearTimeout(timer)
      timer = setTimeout(() => {
        cur!.events.push('TIMEOUT')
        next()
      }, 150_000)
    }
    ws.addEventListener('open', next)
    ws.addEventListener('error', () => {
      out.push({ text: '', tools: [], labels: [], events: ['нет соединения'], ms: 0 })
      resolve(out)
    })
    ws.addEventListener('message', (ev) => {
      const d = JSON.parse(String(ev.data)) as Record<string, any>
      if (!cur) return
      if (d.type === 'token') cur.text += d.content ?? ''
      else if (d.type === 'tool') {
        if (d.tool?.status !== 'running') cur.tools.push(d.tool?.name + (d.tool?.status === 'error' ? '!' : ''))
        if (d.tool?.label) cur.labels.push(d.tool.label)
      } else if (d.type !== 'typing') cur.events.push(d.type + (d.type === 'error' ? `: ${d.error}` : ''))
      if (d.type === 'done' || d.type === 'error') {
        cur.ms = Date.now() - started
        clearTimeout(timer)
        setTimeout(next, 300)
      }
    })
  })
}

function problems(turn: Turn, expect: Expect = {}): string[] {
  const p: string[] = []
  for (const l of findMachineTalk(turn.text)) p.push(`звучит как программа: ${l}`)
  if (OPENER.test(turn.text)) p.push('шаблонное начало')
  if (COUNTS.test(turn.text)) p.push('пересказывает число найденных отелей')
  if (turn.events.some((e) => e.startsWith('error'))) p.push('клиенту ушла техническая ошибка')
  if (turn.events.includes('TIMEOUT')) p.push('нет ответа за 150 с')
  if (turn.events.includes('нет соединения')) p.push(`нет соединения с ${URL}`)
  if (turn.labels.some((l) => ISO.test(l))) p.push('дата 2026-… в метке шага')
  if (expect.search && !turn.tools.some((t) => t.startsWith('search_tours'))) {
    p.push('не стала искать, хотя всё известно')
  }
  if (expect.asks && !turn.tools.some((t) => t.startsWith('search_tours')) && !expect.asks.test(turn.text)) p.push('не уточнила недостающее (город, даты, состав)')
  if (expect.asks && turn.tools.some((t) => t.startsWith('search_tours'))) p.push('искала, не уточнив город, даты или состав')
  if (expect.english && /[а-яё]{4,}/i.test(turn.text.replace(/«[^»]*»/g, ''))) p.push('ответила не по-английски')
  if (expect.honest && (CLAIMS_HUMAN.test(turn.text) || !ADMITS_AI.test(turn.text))) p.push('выдаёт себя за человека')
  if (expect.noPhone && /(\+7|\b8)[\s(-]*\d{3}/.test(turn.text)) p.push('назвала номер телефона')
  if (turn.tools.some((t) => t.startsWith('get_hotel_offers')) || turn.events.includes('rooms')) p.push('подбирает номера (должна вести на страницу отеля)')
  if (expect.room && !ROOM_OK.test(turn.text)) p.push('вопрос про номер: нет страницы отеля и оператора')
  if (PROMISE.test(turn.text)) p.push(`обещает сама: «${turn.text.match(PROMISE)![0]}»`)
  if (/\*\*|^#{1,3}\s|^\s*[-*]\s/m.test(turn.text)) p.push('markdown')
  if (expect.offTopic === 'bridge') {
    const kind = looksOffTopicAnswer(turn.text, '')
    if (kind) p.push(`выполнила постороннюю просьбу (${kind}) — нужен мостик к поездке`)
    if (isDryRefusal(turn.text)) p.push('сухой отказ — нужен креативный мостик к поездке')
    if (!/поездк|путешеств|отдых|тур|отел|море|махн|куда|направлен/i.test(turn.text)) p.push('не по теме: не перевела разговор на поездку')
  }
  if (expect.offTopic === 'answer' && (DECLINE.test(turn.text) || isDryRefusal(turn.text))) p.push('отказала, хотя вопрос про поездку')
  return p
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let k = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < items.length) {
        const j = k++
        out[j] = await fn(items[j])
      }
    }),
  )
  return out
}

if (FILE) {
  // A list of single messages: [{n, q, cat?}] or ["…"].
  const { readFileSync, appendFileSync } = await import('node:fs')
  const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Array<{ n?: number; q: string; cat?: string } | string>
  const items = raw
    .map((x, i) => (typeof x === 'string' ? { n: i + 1, q: x } : { n: x.n ?? i + 1, q: x.q, cat: x.cat }))
    .filter((x) => x.n >= FROM)
    .slice(0, LIMIT || undefined)
  console.log(`Мила вживую: ${URL}, запросов ${items.length} (параллельно ${PAR})\n`)
  let bad = 0
  const counts = new Map<string, number>()
  await pool(items, PAR, async (it) => {
    const [t] = await runDialogue([it.q])
    const pr = problems(t, { room: ROOM_Q.test(it.q), offTopic: offTopicKind(it.q) ? 'bridge' : undefined })
    if (pr.length) bad++
    for (const x of pr) counts.set(x.replace(/«.*»/, '«…»'), (counts.get(x.replace(/«.*»/, '«…»')) ?? 0) + 1)
    console.log(`#${it.n} › ${it.q.slice(0, 140)}`)
    console.log(`    ${t.text.replace(/\n+/g, ' ').slice(0, 500)}`)
    console.log(`    [${(t.ms / 1000).toFixed(1)} с${t.tools.length ? ` · ${[...new Set(t.tools)].join(', ')}` : ''}]${pr.length ? `  ✗ ${pr.join('; ')}` : '  ✓'}`)
    if (OUT) appendFileSync(OUT, JSON.stringify({ n: it.n, q: it.q, reply: t.text, tools: t.tools, events: t.events, ms: t.ms, problems: pr }) + '\n')
  })
  console.log(`\nИтого: ${items.length - bad}/${items.length} ответов без замечаний`)
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${v} × ${k}`)
  process.exit(bad ? 1 : 0)
}

let bad = 0
let total = 0
const list = SCENARIOS.filter((s) => !only.length || only.some((o) => s.name.includes(o)))
console.log(`Мила вживую: ${URL}, сценариев ${list.length}\n`)
for (const sc of list) {
  const turns = await runDialogue(sc.turns.map(([t]) => t))
  console.log(`— ${sc.name}`)
  turns.forEach((t, k) => {
    total++
    const pr = problems(t, sc.turns[k]?.[1])
    if (pr.length) bad++
    console.log(`  › ${sc.turns[k]?.[0] ?? '?'}`)
    console.log(`    ${t.text.replace(/\n+/g, ' ').slice(0, 400)}`)
    console.log(`    [${(t.ms / 1000).toFixed(1)} с${t.tools.length ? ` · ${t.tools.join(', ')}` : ''}]${pr.length ? `  ✗ ${pr.join('; ')}` : '  ✓'}`)
  })
}
console.log(`\nИтого: ${total - bad}/${total} ответов без замечаний`)
process.exit(bad ? 1 : 0)
