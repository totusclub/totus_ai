/**
 * Mila talks only about travel, tours, hotels and Totus Club (owner, 20.10.2026:
 * «отвечать только на вопросы, связанные с нашей платформой, отдыхом и турами»).
 * Run: npx tsx scripts/check-off-topic.ts
 */
import assert from 'node:assert/strict'
import { bridgeInstruction, bridgeReply, isDryRefusal, looksOffTopicAnswer, offTopicKind } from '../server/offTopic.ts'
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

check('готовый мостик: креативно, без сухого отказа, с вопросом про поездку', () => {
  for (const kind of ['recipe', 'creative', 'homework', 'code'] as const) {
    for (const seed of [0, 1, 2]) {
      const r = bridgeReply(kind, 'дай рецепт', seed)
      assert.deepEqual(findMachineTalk(r), [], r)
      assert.ok(!isDryRefusal(r), `сухой отказ: ${r}`)
      assert.match(r, /поездк|отдых|тур|отел|море|махн|полетите|куда/i, r)
      assert.match(r, /\?\s*$/, `в конце вопрос: ${r}`)
      assert.ok(r.length < 400, r)
      assert.equal(looksOffTopicAnswer(r, ''), null, `мостик не похож на рецепт или стих: ${r}`)
    }
  }
  assert.match(bridgeReply('recipe', 'give me a recipe'), /holiday|where would you like/i)
})

check('сухой отказ распознаётся — такой ответ заменяется', () => {
  for (const t of [
    'С рецептами я вам не помощница: я Мила, турагент.',
    'Это не ко мне, я помогаю только с поездками.',
    'Я не помогаю с программированием.',
    'К сожалению, не могу с этим помочь.',
    'Стихи — не моё.',
  ]) assert.ok(isDryRefusal(t), t)
  for (const t of [
    'Свой фирменный рецепт я храню в секрете 😉 А вот где вас накормят так, что захочется добавки, подскажу. Куда бы махнули?',
    'Подобрала пятёрки в Белеке. Какой ближе?',
    'Возвратом занимаются мои коллеги из поддержки — напишите им в личном кабинете.',
  ]) assert.ok(!isDryRefusal(t), t)
})

check('указание модели на этот шаг: мостик, без самого рецепта и без сухого отказа', () => {
  const t = bridgeInstruction('recipe')
  assert.match(t, /## Это сообщение не про путешествия/)
  assert.match(t, /креативный мостик/)
  assert.match(t, /не отказывай сухо/)
  assert.match(t, /ответ по сути не давай/)
  assert.match(t, /только из списка стран/)
  for (const k of ['creative', 'homework', 'code'] as const) assert.ok(bridgeInstruction(k).length > 300, k)
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

check('промпт: только путешествия, креативный мостик вместо отказа', () => {
  const p = buildTotusSystemPrompt()
  assert.match(p, /## О чём ты говоришь \(правило владельца\)/)
  assert.match(p, /ТОЛЬКО на вопросы о путешествиях/)
  assert.match(p, /рецепты/)
  assert.ok(!/Тема не про путешествия — коротко и вежливо ответь/.test(p), 'старое разрешение отвечать на посторонние темы убрано')
  assert.match(p, /Не отказывай сухо/)
  assert.match(p, /креативный мостик к поездке/)
  assert.ok(!/не помощница/.test(p), 'в примере нет сухого отказа')
  // Обязательные вопросы владельца (19.10) на месте.
  assert.match(p, /ВСЕГДА уточняет четыре вещи/)
  assert.match(p, /Одним живым сообщением/)
})

console.log(`check-off-topic: ${passed} passed`)
