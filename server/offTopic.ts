/**
 * Mila talks only about travel, tours, hotels and the Totus Club platform.
 *
 * Owner, 20.10.2026: «почему ИИ отвечает на вопросы, не связанные с турами???
 * тестировщик спросил у него про рецепт борща, и он дал ему… отвечать только
 * на вопросы, связанные с нашей платформой, отдыхом и турами».
 *
 * Two layers on top of the prompt rule:
 *  1. offTopicKind() — a request that is clearly not travel (a recipe, a poem,
 *     homework, code…) never reaches the model: Mila declines in her own voice
 *     and brings the talk back to the trip.
 *  2. looksOffTopicAnswer() — if the model still wrote a recipe, a poem or
 *     code for a non-travel message, the reply is replaced the same way.
 * Both are high-precision: anything with travel context goes to the model,
 * which follows the prompt rule.
 */

export type OffTopicKind = 'recipe' | 'creative' | 'homework' | 'code'

function norm(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е')
}

/** Travel context: with these words the message goes to the model even if it mentions food. */
const TRAVEL =
  /(^|[^а-яa-z])(тур(ы|а|ов|ом|е)?|туристическ|отел|гостиниц|отдых|отдыха|отпуск|поездк|путешеств|курорт|перел[её]т|рейс|вылет|виза|визы|загран|экскурс|мастер-класс|кулинарн(ый|ые|ого) тур|ресторан|кафе|где (вкусно )?поесть|попробовать|местн(ая|ой|ую|ые) кухн|национальн(ая|ой|ую) кухн|море|пляж|тотус|totus|турци|египт|египет|оаэ|дуба|абу-даби|таиланд|пхукет|вьетнам|мальдив|бали|индонези|грузи|тбилиси|батуми|абхази|сочи|крым|кипр|грец|итали|испани|черногори|шри-ланк|китай|хайнань|тунис|кубе|куба|доминикан|стамбул|анталь|белек|кемер|хургад|шарм|hotel|resort|trip|travel|flight|vacation|holiday)/

const RULES: Array<{ kind: OffTopicKind; re: RegExp; always?: boolean; unless?: RegExp }> = [
  // «рецепт борща», «как сварить борщ», «сколько варить гречку»
  // «рецепт на лекарство» for the trip is a customs question, not cooking.
  { kind: 'recipe', unless: /рецепт\w*\s+(на|от|врача)|лекарств|препарат|таблет|справк/, re: /(^|[^а-яa-z])(рецепт|как (при)?готовить|как сварить|как испечь|как пожарить|как запечь|как замариновать|как потушить|сколько варить|сколько жарить|сколько печь)/ },
  { kind: 'recipe', re: /\b(recipe|how to cook|how to bake)\b/ },
  // «напиши стихотворение про кота», «сочини песню», «придумай сказку», «расскажи анекдот»
  {
    kind: 'creative',
    always: true,
    re: /(^|[^а-яa-z])(напиши|написать|сочини|сочинить|придумай|придумать|составь|сочините|напишите|придумайте)\s+(мне\s+|нам\s+|пожалуйста\s+)?(стих|стишок|стишк|стихотворени|поэм|песн|рассказ|сказк|сочинени|эссе|реферат|доклад|курсов|диплом|анекдот|шутк|рэп|частушк|тост|поздравлени|оду\b|басн|сценари)/,
  },
  { kind: 'creative', always: true, re: /(^|[^а-яa-z])расскажи(те)?\s+(мне\s+)?(анекдот|шутку|сказку)/ },
  { kind: 'creative', always: true, re: /\b(write|compose)\s+(me\s+)?(a\s+)?(poem|song|story|essay|joke|rap|limerick)\b/ },
  // «реши задачу», «домашнее задание», «реши уравнение»
  { kind: 'homework', always: true, re: /(^|[^а-яa-z])(реши(ть|те)?\s+(мне\s+)?(задач|уравнени|пример|контрольн)|домашн(ее|юю|ей|ка|ку)(\s+задани)?|сделай(те)? (мне )?домашк)/ },
  { kind: 'homework', always: true, re: /\b(solve (this|the) (equation|problem)|my homework)\b/ },
  // «напиши код на питоне», «скрипт на js»
  {
    kind: 'code',
    always: true,
    re: /(^|[^а-яa-z])(напиши|написать|напишите)\s+(мне\s+)?(код|скрипт|программ|функци|sql|регулярк)|(^|[^a-z])(python|javascript|typescript)(\s|$)|на\s+питоне/,
  },
  { kind: 'code', always: true, re: /\b(write|fix)\s+(me\s+)?(a\s+|the\s+|this\s+)?(code|script|function|program|sql query)\b/ },
]

/** What kind of clearly-not-travel request this is, or null. */
export function offTopicKind(text: string): OffTopicKind | null {
  const t = norm(text)
  if (!t.trim()) return null
  const travel = TRAVEL.test(t)
  for (const r of RULES) {
    if (!r.re.test(t) || r.unless?.test(t)) continue
    // A cooking class in Italy or «где поесть» is a travel question.
    if (!r.always && travel) continue
    return r.kind
  }
  return null
}

const isEnglish = (text: string) => /[a-z]/i.test(text) && !/[а-яё]/i.test(text)

const REPLIES: Record<OffTopicKind, string[]> = {
  recipe: [
    'С рецептами я вам не помощница: я Мила, турагент «Тотус клуба», и всё моё — это поездки. Зато могу найти отель, где вкусно кормят, или тур туда, где хочется попробовать местную кухню. Куда бы вам хотелось?',
    'Тут я пас, на кухне от меня толку мало 🙂 Я помогаю с путешествиями: подобрать тур или отель, подсказать, куда и когда лучше поехать. Планируете отдых?',
  ],
  creative: [
    'Стихи и тексты — не моё: я Мила, турагент «Тотус клуба», и помогаю только с поездками. А вот подобрать тур, отель или подсказать, куда лучше поехать в нужный месяц, могу с удовольствием. Куда думаете?',
    'Писать стихи и рассказы я не берусь — я турагент и занимаюсь путешествиями. Если планируете отдых, расскажите, куда и когда хочется, и я подберу варианты.',
  ],
  homework: [
    'С учёбой помочь не смогу: я Мила, турагент «Тотус клуба», и моё дело — путешествия. Зато на каникулы могу подобрать отличный тур. Куда хотелось бы поехать?',
    'Задачи и домашние задания — это не ко мне, я занимаюсь поездками. Если думаете об отдыхе, подскажу направление и подберу тур.',
  ],
  code: [
    'С программированием я не помогаю — я Мила, турагент «Тотус клуба», и занимаюсь только путешествиями. Если планируете поездку, расскажите, куда и когда хочется, и я подберу варианты.',
    'Код — не моя история, я турагент. А вот с отдыхом помогу: подберу тур или отель, подскажу, куда лучше поехать. Что планируете?',
  ],
}

const REPLY_EN =
  "That's not something I can help with — I'm Mila, the travel agent at Totus Club, and I only help with trips: tours, hotels, where and when to go. Are you planning a holiday?"

/** Mila's polite decline, in her voice, with a way back to the trip. */
export function offTopicReply(kind: OffTopicKind, userText = '', seed = Date.now()): string {
  if (isEnglish(userText)) return REPLY_EN
  const list = REPLIES[kind]
  return list[Math.abs(seed) % list.length]
}

/**
 * Safety net for the model's answer to a non-travel message: a recipe
 * (ingredients and amounts), a poem (short lines) or code.
 */
export function looksOffTopicAnswer(answer: string, userText: string): OffTopicKind | null {
  if (TRAVEL.test(norm(userText))) return null
  const a = norm(answer)
  if (/```|(^|\n)\s*(def |function |const |import |select .* from )/.test(answer)) return 'code'
  const amounts = a.match(/\d+\s*(г|гр|кг|мл|л|ст\.?\s?л|ч\.?\s?л|стакан\w*|зубчик\w*|штук\w*|шт)\.?(\s|,|$)/g) ?? []
  if (/ингредиент|приготовлени[ея]:|для бульона|для зажарки/.test(a) || amounts.length >= 3) return 'recipe'
  const lines = answer.split('\n').map((l) => l.trim()).filter(Boolean)
  const short = lines.filter((l) => l.length >= 8 && l.length <= 55 && !/\d/.test(l))
  if (lines.length >= 4 && short.length >= 4 && short.length / lines.length >= 0.7) return 'creative'
  return null
}
