/**
 * Mila talks only about travel, tours, hotels and the Totus Club platform —
 * and never with a dry «это не ко мне».
 *
 * Owner, 20.10.2026: «почему ИИ отвечает на вопросы, не связанные с турами???
 * тестировщик спросил у него про рецепт борща, и он дал ему… отвечать только
 * на вопросы, связанные с нашей платформой, отдыхом и турами».
 * Then: «нет такого сухого отказа… как хороший продавец, который креативно
 * направит, и человек скажет: вау, какой крутой искусственный интеллект».
 *
 * So an off-topic request gets a creative bridge to a trip, not a refusal:
 * «Свой фирменный рецепт я храню в секрете 😉 А вот где подают настоящий
 * борщ…». The request itself (recipe, poem, homework, code) is not done.
 *
 *  1. offTopicKind() — the message is clearly not about travel. The model
 *     gets bridgeInstruction() for this turn and writes the bridge itself,
 *     picking up the customer's own topic.
 *  2. looksOffTopicAnswer() / isDryRefusal() — if the model still wrote the
 *     recipe, poem or code, or answered with a dry refusal, the reply is
 *     replaced with a ready creative bridge (bridgeReply()).
 * Both are high-precision: a message with travel context is a normal travel
 * question («что попробовать в Грузии», «где поесть в Стамбуле»).
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

const WHAT: Record<OffTopicKind, string> = {
  recipe: 'рецепт или совет по готовке',
  creative: 'стихи, песню, рассказ, поздравление или шутку',
  homework: 'решить задачу или домашнее задание',
  code: 'код или программу',
}

const IDEAS: Record<OffTopicKind, string> = {
  recipe:
    'где это блюдо или похожее лучше всего попробовать по-настоящему; страна, куда едут ради кухни; отель, которым гости хвалят кухню (название — только после поиска); «готовить в отпуске не придётся — всё включено»',
  creative:
    'место, которое само вдохновляет (закаты, море, старые улочки); для поздравления — подарить поездку вместо открытки; для истории про кота — страна, где кошки хозяева улиц',
  homework: 'каникулы и семейный отдых — «после контрольной заслужили море»; страна, где историю или природу можно увидеть вживую',
  code: 'отпуск от экрана и дедлайнов; тихое место у моря, где хорошо перезагрузиться',
}

/**
 * The prompt section for this turn when the message is not about travel:
 * do not fulfil it, do not refuse dryly — bridge to a trip creatively.
 */
export function bridgeInstruction(kind: OffTopicKind): string {
  return [
    '## Это сообщение не про путешествия',
    `Клиент просит ${WHAT[kind]}. Это не твоя работа, поэтому сам ответ по сути не давай: ни целиком, ни кусочком, ни «вкратце». Но и не отказывай сухо — никаких «это не ко мне», «я не помогаю с этим», «я только про туры», «не могу помочь».`,
    'Ответь как обаятельный, остроумный турагент и хороший продавец: подхвати тему клиента и сделай из неё креативный мостик к поездке, чтобы человек улыбнулся и подумал «вау, какой классный помощник». 2–3 живые фразы, в конце — лёгкий вопрос про поездку.',
    `Идеи для мостика: ${IDEAS[kind]}.`,
    'Пример на «дай рецепт борща»: «Свой фирменный рецепт я храню в секрете 😉 А вот где после дня у моря вас накормят так, что захочется добавки, подскажу с радостью. Куда бы махнули — поближе или к тёплому морю?»',
    'Направления — только из списка стран, где у нас есть туры. Названия отелей не называй без поиска. Если уместно, покажи 2–3 направления по теме через `show_destinations`. Стихов, рецептов и кода не пиши даже в шутку.',
  ].join('\n')
}

const BRIDGES: Record<OffTopicKind, string[]> = {
  recipe: [
    'Свой фирменный рецепт я храню в секрете 😉 А вот где вас накормят так, что захочется добавки, подскажу с радостью: в Турции мезе и кебабы, в Италии — паста, ради которой стоит лететь. Куда бы махнули?',
    'Лучший рецепт отпуска у меня точно есть: тёплое море, «всё включено» и никакой готовки целую неделю. Хотите, подберу отель, где гостей особенно хвалят за кухню? Откуда полетите и когда?',
    'Готовить я оставлю вам, а сама предложу то, что вкуснее любого рецепта: том ям на берегу в Таиланде или свежий фо во Вьетнаме. Махнём за вкусными впечатлениями — какая кухня вам ближе?',
  ],
  creative: [
    'Самые красивые строчки пишутся у моря на закате — я бы отправила вас за вдохновением, а не сочиняла за вас 😉 Куда тянет: к тёплому морю или в старинные города?',
    'Вместо стихов могу подарить настоящую историю, которую потом захочется рассказывать: например, закат над Средиземным морем или белый песок Мальдив. Кого берём с собой в поездку?',
    'Поздравление, которое точно запомнят, — это поездка, а не открытка. Подобрать тур в подарок — кто едет и примерно когда?',
  ],
  homework: [
    'Задачки оставлю учителям, а сама решу задачу поинтереснее — куда поехать на каникулы, чтобы всем понравилось 🙂 Сколько вас будет и когда каникулы?',
    'После уроков лучшая награда — море! Могу подобрать семейный отдых на каникулы: с аквапарком, детским клубом и тёплой водой. Откуда полетите и сколько лет детям?',
  ],
  code: [
    'Код подождёт, а вот отпуск от экрана, похоже, нужен уже сейчас 😉 Могу найти тихий отель у моря, где лучше всего перезагрузиться. Куда хочется и когда сможете вырваться?',
    'Лучший апдейт для разработчика — неделя у моря без дедлайнов. Подобрать вариант — откуда полетите и на какие даты?',
  ],
}

const BRIDGE_EN =
  "I'll keep that one for the experts — but I know a great recipe for a holiday: warm sea, great food and zero cooking for a week 😉 Where would you like to go?"

/** A ready creative bridge to a trip (when the model's own reply can't be used). */
export function bridgeReply(kind: OffTopicKind, userText = '', seed = Date.now()): string {
  if (isEnglish(userText)) return BRIDGE_EN
  const list = BRIDGES[kind]
  return list[Math.abs(seed) % list.length]
}

/** «это не ко мне», «я только про туры» — a dry refusal the owner does not want. */
const DRY =
  /не (мо[её]|ко мне|мой профиль|моя (тема|история))(?![а-яё])|не помогаю|не могу (с этим |вам )?помочь|не смогу помочь|не берусь|я пас|не помощница|только (с|про|о) (поездк|путешеств|тур)|это не входит|не в моей компетенц|i can.?t help|not something i can/i

export function isDryRefusal(text: string): boolean {
  return DRY.test(text)
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
