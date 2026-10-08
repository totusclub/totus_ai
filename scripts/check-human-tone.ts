/**
 * Tone safety net (server/humanTone.ts): replies that talk like a program are
 * caught; normal travel-agent replies are left alone.
 * Run: npx tsx scripts/check-human-tone.ts
 */
import assert from 'node:assert/strict'
import { findMachineTalk, humanizeReply } from '../server/humanTone.ts'

let passed = 0
async function check(name: string, fn: () => Promise<void> | void) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('check-human-tone')

const BAD: Array<[string, string[]]> = [
  // Real reply from the owner's screenshot, 08.10.2026.
  [
    'Прошу прощения, сейчас система не отдаёт варианты по этому отелю — похоже, временный сбой на стороне поиска. Давайте попробуем через минуту, я перезапущу подбор номеров по Rixos Park Belek.',
    ['система', 'сбой', 'перезапуск'],
  ],
  ['К сожалению, в описании этого отеля такой информации нет.', ['информации нет', 'в описании нет']],
  ['Я не вижу информации об анимации, посмотрите отзывы.', ['не нашла информацию']],
  ['Не удалось проверить наличие аквапарка.', ['не удалось']],
  ['По данным Level.Travel отель на первой линии.', ['поставщик']],
  ['Нашла в интернете, что там есть спа.', ['источники']],
  ['Технические проблемы — данных нет.', ['технические проблемы', 'информации нет']],
]

await check('ловит «кухню» в ответах (в т.ч. ответ со скриншота)', () => {
  for (const [text, labels] of BAD) {
    const found = findMachineTalk(text)
    for (const l of labels) assert.ok(found.includes(l), `«${text}» → нет метки «${l}» (есть: ${found.join(', ')})`)
  }
})

await check('не трогает нормальные живые ответы', () => {
  const GOOD = [
    'Подобрала пятёрки в Белеке, где гости особенно хвалят анимацию — вечерние шоу и мини-клуб. Вам важнее песчаный пляж или аквапарк?',
    'На эти даты в Rixos Park Belek мест не вижу — давайте сдвинем вылет на пару дней или посмотрим соседний отель?',
    'Подбираю по всем туроператорам, с которыми работает Тотус клуб, а цены — из нашей системы бронирования.',
    'Спасибо! Номер Family Room подойдёт вчетвером: две спальни и одна ванная.',
  ]
  for (const t of GOOD) assert.deepEqual(findMachineTalk(t), [], t)
})

await check('переписывание: берётся новый текст', async () => {
  const out = await humanizeReply(BAD[0][0], async (system, user) => {
    assert.match(system, /живого турагента/)
    assert.equal(user, BAD[0][0])
    return 'На эти даты в Rixos Park Belek мест не вижу. Сдвинем вылет на пару дней?'
  })
  assert.equal(out, 'На эти даты в Rixos Park Belek мест не вижу. Сдвинем вылет на пару дней?')
})

await check('ошибка модели или пустой ответ → остаётся исходный текст', async () => {
  assert.equal(await humanizeReply('текст', async () => { throw new Error('x') }), 'текст')
  assert.equal(await humanizeReply('текст', async () => '   '), 'текст')
})

console.log(`check-human-tone: ${passed} passed`)
