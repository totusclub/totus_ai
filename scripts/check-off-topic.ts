/**
 * Mila talks only about travel, tours, hotels and Totus Club (owner, 20.10.2026:
 * «отвечать только на вопросы, связанные с нашей платформой, отдыхом и турами»).
 * Run: npx tsx scripts/check-off-topic.ts
 */
import assert from 'node:assert/strict'
import { looksOffTopicAnswer, offTopicKind, offTopicReply } from '../server/offTopic.ts'
import { findMachineTalk } from '../server/humanTone.ts'
import { buildTotusSystemPrompt } from '../server/totusPrompt.ts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}
console.log('check-off-topic')

check('явно посторонние просьбы распознаются', () => {
  const cases: Array<[string, string]> = [
    ['дай рецепт борща', 'recipe'],
    ['Рецепт борща', 'recipe'],
    ['как сварить борщ?', 'recipe'],
    ['как приготовить плов в казане', 'recipe'],
    ['сколько варить гречку', 'recipe'],
    ['give me a recipe for pancakes', 'recipe'],
    ['напиши стихотворение про кота', 'creative'],
    ['сочини песню про маму', 'creative'],
    ['придумай сказку для сына', 'creative'],
    ['расскажи анекдот', 'creative'],
    ['напиши мне поздравление для коллеги', 'creative'],
    ['напиши стих про отпуск в Турции', 'creative'],
    ['write a poem about a cat', 'creative'],
    ['реши задачу: поезд едет 60 км/ч, сколько он проедет за 3 часа', 'homework'],
    ['сделай домашку по математике', 'homework'],
    ['реши уравнение x+2=5', 'homework'],
    ['напиши код на python для сортировки списка', 'code'],
    ['напиши скрипт на javascript', 'code'],
    ['write a function in python', 'code'],
  ]
  for (const [q, kind] of cases) assert.equal(offTopicKind(q), kind, q)
})

check('вопросы про поездку и платформу проходят в модель', () => {
  for (const q of [
    'хочу в турцию в ноябре',
    'привет',
    'ты бот?',
    'что обязательно попробовать из еды в Грузии?',
    'где в Стамбуле вкусно поесть',
    'кулинарный мастер-класс в Италии — можно в туре?',
    'нужен ли рецепт на лекарство, чтобы провезти его в ОАЭ?',
    'в отеле хорошая кухня?',
    'какие рестораны а-ля карт в Rixos?',
    'можно ли в Таиланде увидеть питона в зоопарке',
    'как вернуть деньги за тур',
    'где мои билеты',
    'есть ли промокод на первый заказ',
    'как приготовиться к перелёту с ребёнком',
    'хочу поехать с собакой, какие документы',
  ]) assert.equal(offTopicKind(q), null, q)
})

check('отказ — голосом Милы: тепло, без терминальных фраз, с возвратом к поездке', () => {
  for (const kind of ['recipe', 'creative', 'homework', 'code'] as const) {
    for (const seed of [0, 1]) {
      const r = offTopicReply(kind, 'дай рецепт', seed)
      assert.deepEqual(findMachineTalk(r), [], r)
      assert.match(r, /поездк|путешеств|отдых|тур/i, r)
      assert.ok(!/не могу обработать|не входит в мои функции|запрос/i.test(r), r)
      assert.ok(r.length < 400, r)
    }
  }
  assert.match(offTopicReply('recipe', 'give me a recipe'), /travel|trip|holiday/i)
})

check('страховка ответа: рецепт, стих и код в ответе ловятся', () => {
  assert.equal(looksOffTopicAnswer('Ингредиенты: 500 г говядины, 2 свёклы, 300 г капусты. Варите 1,5 часа.', 'чем борщ отличается от щей'), 'recipe')
  assert.equal(looksOffTopicAnswer('Пушистый кот на окне\nГреет лапы в тишине\nСмотрит важно на луну\nИ мурлычет про весну', 'а про собаку?'), 'creative')
  assert.equal(looksOffTopicAnswer('Вот так:\n```python\nsorted(xs)\n```', 'а на js?'), 'code')
})

check('обычные ответы Милы страховка не трогает', () => {
  assert.equal(looksOffTopicAnswer('Подобрала пятёрки в Белеке для вашей семьи. Какой отель ближе?', 'Белек в ноябре, двое взрослых'), null)
  assert.equal(looksOffTopicAnswer('Здравствуйте! Я Мила, турагент «Тотус клуба». Куда хочется поехать?', 'привет'), null)
  assert.equal(looksOffTopicAnswer('В Грузии попробуйте хинкали, хачапури и чурчхелу. Подсказать, когда лучше ехать?', 'что попробовать из еды в Грузии'), null)
  assert.equal(looksOffTopicAnswer('Я Мила — виртуальный турагент «Тотус клуба», работаю на искусственном интеллекте. Куда планируете?', 'ты бот?'), null)
})

check('промпт: только путешествия, без «коротко ответь» на посторонние темы', () => {
  const p = buildTotusSystemPrompt()
  assert.match(p, /## О чём ты говоришь \(правило владельца\)/)
  assert.match(p, /ТОЛЬКО на вопросы о путешествиях/)
  assert.match(p, /рецепты/)
  assert.ok(!/Тема не про путешествия — коротко и вежливо ответь/.test(p), 'старое разрешение отвечать на посторонние темы убрано')
  // Обязательные вопросы владельца (19.10) на месте.
  assert.match(p, /ВСЕГДА уточняет четыре вещи/)
  assert.match(p, /Одним живым сообщением/)
})

console.log(`check-off-topic: ${passed} passed`)
