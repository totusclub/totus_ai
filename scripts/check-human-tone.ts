/**
 * Tone safety net (server/humanTone.ts): replies that talk like a program are
 * caught; normal travel-agent replies are left alone.
 * Run: npx tsx scripts/check-human-tone.ts
 */
import assert from 'node:assert/strict'
import {
  fallbackReply,
  findMachineTalk,
  humanizeReply,
  removeMadeUpPhones,
  stripTemplateOpener,
} from '../server/humanTone.ts'
import { buildTotusSystemPrompt, realPhone, supportContactsLine } from '../server/totusPrompt.ts'
import { humanDate } from '../server/llm.ts'
import { buildPiiWarning } from '../server/pii/guard.ts'

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

// --- 18.10.2026: «она не терминал, она турагент» -----------------------------
// Real replies from the run on totus.club, 18.10.2026.
await check('ловит терминал и выдуманный телефон', () => {
  const cases: Array<[string, string]> = [
    ['К сожалению, не могу обработать ваш запрос.', 'терминал'],
    ['Это не входит в мои функции.', 'терминал'],
    ['Введите город вылета.', 'терминал'],
    ['Позвоните в поддержку: личный кабинет, «Звонок в поддержку», или по телефону +7 (800) 000-00-00.', 'выдуманный телефон'],
    ['Наш номер 8 916 123-45-67.', 'выдуманный телефон'],
  ]
  for (const [t, label] of cases) assert.ok(findMachineTalk(t).includes(label), `${t} → ${findMachineTalk(t).join(', ')}`)
  // The configured company phone is allowed.
  assert.deepEqual(findMachineTalk('Звоните: +7 (495) 123-45-67.', { allowedPhone: '+7 495 123 45 67' }), [])
  // Prices, dates and flight numbers are not phones.
  assert.deepEqual(findMachineTalk('От 176 000 ₽ на двоих, вылет 17 ноября рейсом SU 2134, 7 ночей.'), [])
})

await check('выдуманный телефон убирается вместе с «или по телефону»', () => {
  assert.equal(
    removeMadeUpPhones('Позвоните из личного кабинета: «Звонок в поддержку», либо по телефону +7 (800) 000-00-00. Там помогут.'),
    'Позвоните из личного кабинета: «Звонок в поддержку». Там помогут.',
  )
  assert.equal(removeMadeUpPhones('Звоните +7 (495) 123-45-67.', '+74951234567'), 'Звоните +7 (495) 123-45-67.')
})

await check('шаблонное «Отличный выбор!» в начале убирается', () => {
  assert.equal(
    stripTemplateOpener('Отличный выбор! Уточню город вылета — из Москвы или Казани?'),
    'Уточню город вылета — из Москвы или Казани?',
  )
  assert.equal(stripTemplateOpener('Отличный план на выходные! Стамбул в октябре — самое то.'), 'Стамбул в октябре — самое то.')
  // Too little would remain, or it is not an opener at all.
  assert.equal(stripTemplateOpener('Отличный выбор!'), 'Отличный выбор!')
  assert.equal(stripTemplateOpener('В ноябре в Египте отличный выбор отелей.'), 'В ноябре в Египте отличный выбор отелей.')
})

await check('запасные ответы — слова Милы, без «ошибки» и «запроса»', () => {
  for (let i = 0; i < 6; i++) {
    for (const kind of ['error', 'stuck'] as const) {
      const t = fallbackReply(kind, i)
      assert.deepEqual(findMachineTalk(t), [], t)
      assert.ok(!/ошибк|запрос|сервер|не удалось/i.test(t), t)
    }
  }
})

await check('телефон-заглушка не попадает в промпт; есть правило честности и поддержка из кабинета', () => {
  assert.equal(realPhone('+7 (800) 000-00-00'), '')
  assert.equal(realPhone(''), '')
  assert.equal(realPhone('8 800 111 11 11'), '')
  assert.equal(realPhone('+7 (495) 123-45-67'), '+7 (495) 123-45-67')
  const old = process.env.TOTUS_COMPANY_PHONE
  delete process.env.TOTUS_COMPANY_PHONE
  const prompt = buildTotusSystemPrompt(new Date('2026-10-18T10:00:00Z'))
  if (old !== undefined) process.env.TOTUS_COMPANY_PHONE = old
  assert.ok(!/000-00-00|\{COMPANY_PHONE\}|\{SUPPORT_CONTACTS\}/.test(prompt))
  assert.match(prompt, /не выдавай себя за человека/)
  assert.match(prompt, /«Чат с поддержкой» и «Звонок в поддержку»/)
  assert.match(prompt, /Номер телефона компании не называй и не придумывай/)
  assert.match(supportContactsLine('+7 (495) 123-45-67'), /Телефон для сложных вопросов: \+7 \(495\) 123-45-67/)
  assert.ok(!/«Тотус клуб».{0,20}приложени.{0,40}Звонок в поддержку/.test(prompt), 'не только «в приложении»: на сайте тоже есть')
})

await check('даты в метках шагов — по-человечески', () => {
  const now = new Date('2026-10-18T10:00:00Z')
  assert.equal(humanDate('2026-11-17', now), '17 ноября')
  assert.equal(humanDate('2027-07-01', now), '1 июля')
  assert.equal(humanDate('2027-12-28', now), '28 декабря 2027')
  assert.equal(humanDate('завтра', now), '')
})

await check('предупреждение о личных данных — голосом Милы, с просьбой отправить ещё раз', () => {
  for (const types of [['name'], ['phone'], ['passport'], ['order'], ['card'], ['name', 'phone', 'email']] as const) {
    const t = buildPiiWarning([...types])
    assert.deepEqual(findMachineTalk(t), [], t)
    assert.ok(!/не обработала|уберите из сообщения личные данные|Пожалуйста, уберите/.test(t), t)
    assert.match(t, /ещё раз/, t)
  }
  assert.match(buildPiiWarning(['phone']), /«Звонок в поддержку»/)
  assert.match(buildPiiWarning(['name']), /^Давайте без имён/)
})

console.log(`check-human-tone: ${passed} passed`)
