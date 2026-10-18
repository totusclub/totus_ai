/**
 * Live run of Mila on a real server: the dialogues from the owner's review
 * on totus.club (18.10.2026) — «Мила должна быть максимально человеком, она
 * турагент, а не терминал». Not part of `npm run check`: it needs the real
 * DeepSeek and Level.Travel behind the server.
 *
 * Run:  npx tsx scripts/mila-live-scenarios.ts                 (wss://apiv2.totus.club)
 *       MILA_WS=ws://localhost:3011/ws/assistant npx tsx scripts/mila-live-scenarios.ts
 *       … -- --only=бот,телефон                                (scenarios by name)
 *
 * Every reply is checked for: machine talk and terminal phrases, made-up phone
 * numbers, template openers, «нашлось 20 отелей», no search when everything
 * is known, ISO dates in step labels, technical `error` events, and the honest
 * answer to «ты бот?». Test messages contain no real personal data.
 */
import { findMachineTalk } from '../server/humanTone.ts'

const URL = process.env.MILA_WS || 'wss://apiv2.totus.club/ws/assistant'
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean)

type Expect = {
  search?: boolean // everything is known (where, when, who) — a search must run
  english?: boolean // the reply must be in English
  honest?: boolean // «ты бот?» — must not claim to be human
  noPhone?: boolean
}
type Scenario = { name: string; turns: Array<[string, Expect?]> }

const SCENARIOS: Scenario[] = [
  { name: 'турция-бюджет', turns: [['хочу в турцию в ноябре на неделю, нас двое, бюджет до 200 тысяч', { search: true }]] },
  { name: 'одно-слово', turns: [['в Турцию'], ['нет, передумал, давай в Египет']] },
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
  { name: 'ещё-варианты', turns: [['в турцию с детьми'], ['дети 4 и 7, вылет из Москвы в начале ноября на неделю', { search: true }], ['а покажи ещё варианты']] },
]

const OPENER = /^\s*(Отличн(ый|ая|ое)\s+(выбор|вопрос|задача|план|идея)|Конечно!)/u
const COUNTS = /нашл(ось|ось всего)\s+\d+\s+(отел|вариант)|всего\s+(подходящих\s+)?(отелей\s+)?(нашлось\s+)?\d+[^.]{0,30}показала/i
const ISO = /\d{4}-\d{2}-\d{2}/
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
    p.push('не стала искать, хотя всё известно')
  }
  if (expect.english && /[а-яё]{4,}/i.test(turn.text.replace(/«[^»]*»/g, ''))) p.push('ответила не по-английски')
  if (expect.honest && (CLAIMS_HUMAN.test(turn.text) || !ADMITS_AI.test(turn.text))) p.push('выдаёт себя за человека')
  if (expect.noPhone && /(\+7|\b8)[\s(-]*\d{3}/.test(turn.text)) p.push('назвала номер телефона')
  return p
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
