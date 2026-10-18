/**
 * «Опыт турагента» (server/agentPlaybook.ts): the right topics reach the
 * prompt, small talk gets none, the data agrees with the owner's rules.
 * Run: npx tsx scripts/check-playbook.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatPlaybooks, selectPlaybooks } from '../server/agentPlaybook.ts'
import { PLAYBOOKS } from '../server/agentPlaybookData.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('check-playbook')
const ids = (t: string, prev = '') => selectPlaybooks(t, prev).map((p) => p.id)

check('данные: темы есть, id уникальны, у фактов источники', () => {
  assert.ok(PLAYBOOKS.length >= 40, `тем ${PLAYBOOKS.length}`)
  assert.equal(new Set(PLAYBOOKS.map((p) => p.id)).size, PLAYBOOKS.length)
  for (const p of PLAYBOOKS) {
    assert.ok(p.triggers.length >= 3 && p.advise.length >= 1, p.id)
    for (const f of p.facts) assert.match(String(f.source ?? ''), /^https?:\/\//, `${p.id}: факт без источника «${f.text.slice(0, 50)}»`)
  }
})

check('данные не спорят с правилами владельца', () => {
  const all = JSON.stringify(PLAYBOOKS)
  // 19.10: город вылета, даты и состав Мила уточняет сама — Москву не подставляет.
  assert.ok(!/по умолчанию из Москвы|взять Москву|без единого варианта/i.test(all))
  // Никаких выдуманных телефонов и чужих сервисов.
  assert.ok(!/000-00-00/.test(all), 'номер-заглушка не попадает в промпт даже как пример ошибки')
  assert.ok(!/(?<!не )(через|на) (Airbnb|Booking)/i.test(all))
})

check('светская беседа и простой запрос — без тем', () => {
  for (const t of ['привет', 'спасибо!', 'ты бот?', 'хочу в Турцию в ноябре', 'сколько стоит?']) assert.deepEqual(ids(t), [], t)
})

check('тематические запросы получают свою тему', () => {
  const cases: Array<[string, RegExp]> = [
    ['Летим с ребёнком семи месяцев, нужна люлька в самолёте', /infant/],
    ['Я пользуюсь коляской, нужен номер без порогов', /wheelchair|accessib|mobility/],
    ['У дочки аллергия на орехи, нужен отель, где это учтут', /allerg/],
    ['Хотим поехать с собакой 12 кг', /pet/],
    ['Хотим в круиз по Средиземному морю', /cruise|not-sold/],
    ['В отеле грязно и шумно, что делать?', /hotel-problem/],
    ['Хочу романтический отпуск на годовщину', /couples|romantic/],
    ['Хочу понырять с аквалангом, никогда не пробовал', /div/],
  ]
  for (const [t, re] of cases) assert.ok(ids(t).some((id) => re.test(id)), `${t} → ${ids(t).join(', ') || '—'}`)
})

check('уточнение по ходу разговора держит тему', () => {
  assert.ok(ids('а справка нужна?', 'хотим поехать с собакой').some((id) => /pet/.test(id)))
})

check('не больше двух тем, раздел не раздувает промпт', () => {
  const t = 'Летим с младенцем и собакой, у мужа коляска, у дочки аллергия'
  assert.ok(selectPlaybooks(t).length <= 2)
  assert.ok(formatPlaybooks(selectPlaybooks(t)).length < 6000)
  assert.equal(formatPlaybooks([]), '')
})

check('покрытие запросов владельца: у большинства есть тема', () => {
  const req = JSON.parse(readFileSync(new URL('./fixtures/mila-500-requests.json', import.meta.url), 'utf8')) as Array<{ q: string }>
  const covered = req.filter((r) => selectPlaybooks(r.q).length > 0).length
  assert.ok(covered / req.length >= 0.75, `с темой ${covered} из ${req.length}`)
  console.log(`    (с темой ${covered} из ${req.length})`)
})

console.log(`check-playbook: ${passed} passed`)
