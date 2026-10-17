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
 * numbers, template openers, «нашлось 20 отелей», questionnaire instead of a
 * search, ISO dates in step labels, technical `error` events, and the honest
 * answer to «ты бот?». Test messages contain no real personal data.
 */
import { findMachineTalk } from '../server/humanTone.ts'

const URL = process.env.MILA_WS || 'wss://apiv2.totus.club/ws/assistant'
const arg = (name: string) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? '').slice(name.length + 3)
const only = arg('only').split(',').filter(Boolean)
const FILE = arg('file')
const FROM = Number(arg('from') || 1)
const LIMIT = Number(arg('limit') || 0)
const PAR = Math.min(Math.max(Number(arg('par') || 1), 1), 5)
const OUT = arg('out')

type Expect = {
  search?: boolean // a search must run in this turn
  english?: boolean // the reply must be in English
  honest?: boolean // «ты бот?» — must not claim to be human
  noPhone?: boolean
  room?: boolean // a question about a room
}
type Scenario = { name: string; turns: Array<[string, Expect?]> }

const SCENARIOS: Scenario[] = [
  { name: 'турция-бюджет', turns: [['хочу в турцию в ноябре на неделю, нас двое, бюджет до 200 тысяч', { search: true }]] },
  { name: 'одно-слово', turns: [['в Турцию', { search: true }], ['нет, передумал, давай в Египет', { search: true }]] },
  { name: 'анимация', turns: [['нужны хорошие отели с классной анимацией'], ['а в египте?', { search: true }]] },
  { name: 'аля-карт', turns: [['я хочу поехать в турцию в лакшери отель, где много классных аля карт ресторанов.', { search: true }]] },
  { name: 'бот', turns: [['ты бот?', { honest: true }]] },
  { name: 'менеджер', turns: [['позови живого менеджера', { noPhone: true }]] },
  { name: 'возврат', turns: [['хочу отменить тур и вернуть деньги', { noPhone: true }]] },
  { name: 'жалоба', turns: [['отель был ужасный, грязь, еда отвратительная, я требую компенсацию', { noPhone: true }]] },
  { name: 'билеты', turns: [['у меня заказ, где мои билеты? вылет через 3 дня', { noPhone: true }]] },
  { name: 'документы', turns: [['какие документы нужны ребёнку для выезда за границу с одним родителем?', { noPhone: true }]] },
  { name: 'горящие', turns: [['горящие туры есть?', { search: true }]] },
  { name: 'english', turns: [['hi, i need a hotel in dubai for next week', { english: true, search: true }]] },
  { name: 'опечатки', turns: [['хачу в егепет в новабре с 2 детми 5 и 10 лет из спб бюжет 250к', { search: true }]] },
  { name: 'грубость', turns: [['ты тупая, ничего не можешь нормально найти']] },
  { name: 'телефон', turns: [['мой телефон 89161234567 перезвоните']] },
  { name: 'имя', turns: [['меня зовут Аня, хочу в Турцию']] },
  { name: 'бали-бюджет', turns: [['тур на Бали за 50 тысяч на двоих на 2 недели']] },
  { name: 'сочи', turns: [['хочу в турцию из Сочи']] },
  { name: 'номер', turns: [['расскажи про отель Rixos Premium Belek'], ['а какие там номера и есть ли в номере ванна?', { room: true }]] },
  { name: 'кроватка', turns: [['Можно подобрать отель, где детская кроватка именно с жёстким матрасом? Ребёнку девять месяцев, хотим в Турцию в июне', { search: true, room: true }]] },
  { name: 'ереван', turns: [['Летим из Еревана с ребёнком семи месяцев, хотим в Египет в декабре', { search: true }]] },
  { name: 'ещё-варианты', turns: [['в турцию с детьми', { search: true }], ['дети 4 и 7', { search: true }], ['а покажи ещё варианты']] },
]

const OPENER = /^\s*(Отличн(ый|ая|ое)\s+(выбор|вопрос|задача|план|идея)|Конечно!)/u
const COUNTS = /нашл(ось|ось всего)\s+\d+\s+(отел|вариант)|всего\s+(подходящих\s+)?(отелей\s+)?(нашлось\s+)?\d+[^.]{0,30}показала/i
const QUESTIONNAIRE = /(уточн(ю|ите)|подскажите)[^.?!]{0,40}(город\s+вылета|даты)[^?]*\?/i
const ISO = /\d{4}-\d{2}-\d{2}/
// A question about a room → the hotel page on totus.club + our operator.
const ROOM_Q = /(?<![а-яё])номер(?:а|е|ом|у|ов|ах)?(?![а-яё])(?![^.?!]{0,20}(телефон|заказ|брони|рейса|паспорт))|кроватк|ванн(?:а|ой|у)(?![а-яё])|балкон|соединительн|звукоизоляц/i
const ROOM_OK = /страниц[аеуы]\s+отеля|карточк|оператор|«Чат с поддержкой»|«Звонок в поддержку»/i
const PROMISE = /(?<![а-яё])(я\s+)?(проверю|согласую|напишу\s+в\s+отель|свяжусь\s+с\s+отелем|забронирую|закажу|гарантирую)(?![а-яё])/i
const CLAIMS_HUMAN = /(я\s+)?(живой\s+(человек|турагент)|не\s+бот|настоящий\s+человек)/i
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
    p.push(QUESTIONNAIRE.test(turn.text) ? 'анкета вместо подбора' : 'не стала искать')
  }
  if (expect.english && /[а-яё]{4,}/i.test(turn.text.replace(/«[^»]*»/g, ''))) p.push('ответила не по-английски')
  if (expect.honest && (CLAIMS_HUMAN.test(turn.text) || !ADMITS_AI.test(turn.text))) p.push('выдаёт себя за человека')
  if (expect.noPhone && /(\+7|\b8)[\s(-]*\d{3}/.test(turn.text)) p.push('назвала номер телефона')
  if (turn.tools.some((t) => t.startsWith('get_hotel_offers')) || turn.events.includes('rooms')) p.push('подбирает номера (должна вести на страницу отеля)')
  if (expect.room && !ROOM_OK.test(turn.text)) p.push('вопрос про номер: нет страницы отеля и оператора')
  if (PROMISE.test(turn.text)) p.push(`обещает сама: «${turn.text.match(PROMISE)![0]}»`)
  if (/\*\*|^#{1,3}\s|^\s*[-*]\s/m.test(turn.text)) p.push('markdown')
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
    const pr = problems(t, { room: ROOM_Q.test(it.q) })
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
