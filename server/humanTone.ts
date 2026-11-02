/**
 * Masha must sound like a live travel agent. The prompt says so, but a model
 * still slips («сейчас система не отдаёт варианты — похоже, временный сбой»,
 * «в описании отеля такой информации нет»). This module is the safety net:
 * find such phrases in the final reply and rewrite the reply once.
 */

const PATTERNS: Array<[string, RegExp]> = [
  ['система', /(?<![а-яё])систем[аеуыо][а-яё]*(?!\s+бронирования)/i],
  ['сбой', /(?<![а-яё])сбо[йяеюи](?![а-яё])|(?<![а-яё])сбоем(?![а-яё])/i],
  ['технические проблемы', /техническ[а-яё]*\s+(неполад|проблем|ошибк|работ)/i],
  ['база данных', /(?<![а-яё])баз[аеуыо]й?\s+(данных|отелей)|в\s+(нашей\s+)?базе(?![а-яё])/i],
  ['поставщик', /level[\s.-]?travel|левел[\s-]?тр[еэ]вел/i],
  ['не удалось', /не\s+(удалось|получилось)\s+(найти|получить|загрузить|проверить|подтвердить|узнать)/i],
  ['не нашла информацию', /(не\s+нашл[аи]|не\s+нахожу|не\s+вижу|не\s+нашлось)\s+(никакой\s+|такой\s+|этой\s+|нужной\s+|подробной\s+)?(информаци|данных|сведени|упоминани)/i],
  ['информации нет', /(нет|отсутству[а-яё]*)\s+(никакой\s+|такой\s+|этой\s+|подробной\s+|точной\s+)?(информации|данных|сведений)|(информации|данных|сведений)\s+(об\s+этом\s+|по\s+этому\s+[а-яё]+\s+|на\s+этот\s+сч[её]т\s+)?(нет|не\s+наш|отсутству)/i],
  ['в описании нет', /в\s+(описании|карточке)[^.!?]{0,50}?(нет(?![а-яё])|не\s+указ|не\s+сказан|не\s+упомина|ничего)/i],
  ['источники', /в\s+интернете|поисковик|(?<![а-яё])выдач[аеиу](?![а-яё])|по\s+данным\s+(поиска|системы|базы)|(?<![а-яё])инструмент[а-яё]*\s+(поиска|подбора|бронирования)|через\s+инструмент/i],
  ['перезапуск', /перезапущ|попробу(ем|йте|ю)\s+(ещё\s+раз\s+)?через\s+(минуту|пару\s+минут|несколько\s+минут)/i],
  // Sending the customer to someone else (500-request run, 18.10.2026).
  ['чужие сервисы', /(?<![a-zа-яё])(airbnb|booking(\.com)?|букинг[а-яё]*|островок|ostrovok|авиасейлс|aviasales|trip\.com)(?![a-zа-яё])|бронир(уйте|овать)\s+напрямую|напрямую\s+(в|у)\s+отел|(напиш[а-яё]*|написать|пиш[а-яё]*|писать|обратит[а-яё]*|обратиться|позвонит[а-яё]*|позвонить)\s+(сами\s+)?(в\s+отель|отелю)|отелю\s+напрямую/i],
  // A terminal, not a travel agent (owner, 18.10: «она не терминал»).
  [
    'терминал',
    /не\s+могу\s+(обработать|выполнить|распознать)|(?<![а-яё])запрос(?:а|у)?\s+(не\s+)?(обработан|распознан|выполнен)|не\s+входит\s+в\s+мои\s+(функции|обязанности|возможности)|(?<![а-яё])(введите|выберите\s+один\s+из\s+вариантов)(?![а-яё])/i,
  ],
]

/** Phone-like numbers: Masha must never invent one. */
const PHONE = /(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g

/**
 * Labels of machine-talk patterns found in the reply (empty = fine).
 * `allowedPhone` — the company phone from the config; any other number in a
 * reply is made up («+7 (800) 000-00-00» was sent to customers).
 */
export function findMachineTalk(text: string, opts: { allowedPhone?: string } = {}): string[] {
  const found: string[] = []
  for (const [label, re] of PATTERNS) if (re.test(text)) found.push(label)
  const allowed = String(opts.allowedPhone ?? '').replace(/\D/g, '').slice(-10)
  const phones = (text.match(PHONE) ?? []).map((p) => p.replace(/\D/g, '').slice(-10))
  if (phones.some((p) => !allowed || p !== allowed)) found.push('выдуманный телефон')
  // A lecture instead of a chat reply: markdown, lists, or more than ~7
  // sentences (500-request run: «15 пунктов советов и ни одного варианта»).
  const sentences = (text.match(/[.!?…](?=\s|$)/g) ?? []).length
  if (/\*\*|^\s*#{1,3}\s|^\s*[-•*–]\s+\S|^\s*\d+[.)]\s+\S/m.test(text) || sentences > 9 || text.length > 1300) {
    found.push('простыня')
  }
  return found
}

/** Last resort: drop a made-up phone together with «или по телефону». */
export function removeMadeUpPhones(text: string, allowedPhone = ''): string {
  const allowed = allowedPhone.replace(/\D/g, '').slice(-10)
  const re = new RegExp(`[,;]?\\s*(?:либо|или)?\\s*(?:по\\s+телефону|по\\s+номеру|телефон:?)?\\s*(${PHONE.source})`, 'gi')
  return text
    .replace(re, (m, phone: string) => (allowed && phone.replace(/\D/g, '').slice(-10) === allowed ? m : ''))
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}

/**
 * «Отличный выбор! …», «Отличный вопрос! …» at the very start reads like a
 * script. Remove such an opener when something meaningful follows it.
 */
export function stripTemplateOpener(text: string): string {
  const m = text.match(
    /^\s*(?:(?:(?:(?:Отличн|Прекрасн|Замечательн|Чудесн)(?:ый|ая|ое))\s+(?:выбор|вопрос|задача|план|идея|запрос|подход|цель|мысль)(?:[^.!?\n—–:]{0,40}[!.]|\s*[—–:,-]+))|Конечно[!,]|Конечно\s*[—–])\s*/u,
  )
  if (!m) return text
  const rest = text.slice(m[0].length)
  if (rest.trim().length < 20) return text
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/**
 * What Masha says when something on our side went wrong. Never a technical
 * error in the chat: old and new clients alike show these as her message.
 */
const FALLBACKS: Record<'error' | 'stuck', string[]> = {
  error: [
    'Ой, ваше сообщение у меня не открылось 🙈 Отправьте его, пожалуйста, ещё раз — я сразу продолжу.',
    'Кажется, сообщение до меня не дошло целиком. Напишите его ещё раз, пожалуйста — и я продолжу подбор.',
    'Секунду — сообщение потерялось по дороге. Отправьте его, пожалуйста, ещё раз, и я сразу отвечу.',
  ],
  stuck: [
    'Я ещё сверяю варианты, чтобы не советовать наугад. Напишите, пожалуйста, что для вас главное — направление, даты или бюджет, — и я покажу лучшее.',
    'Хочу показать вам действительно подходящие варианты, а не первые попавшиеся. Подскажите, что важнее всего — и я сразу соберу подборку.',
  ],
}

export function fallbackReply(kind: 'error' | 'stuck', seed = Date.now()): string {
  const list = FALLBACKS[kind]
  return list[Math.abs(seed) % list.length]
}

export const HUMANIZE_SYSTEM = `Ты — редактор ответов Маши, живого турагента «Тотус клуба». Перепиши ответ так, как его сказал бы опытный, тёплый турагент в переписке с клиентом.

Правила:
- Сохрани все факты, названия отелей, цифры, вопрос клиенту и смысл совета. Ничего не выдумывай.
- Убери любые упоминания «кухни»: систему, базу, поиск, выдачу, сбои, технические проблемы, инструменты, интернет, описание или карточку отеля, названия поставщиков, «перезапущу», «попробуем через минуту».
- Убери фразы терминала: «не могу обработать запрос», «запрос не распознан», «не входит в мои функции», «введите», «выберите один из вариантов». Маша — турагент, а не справочная.
- Не отправляй клиента в другие сервисы (Airbnb, Booking и т.п.) и «бронировать напрямую в отеле» — вместо этого «мои коллеги из поддержки помогут» (личный кабинет: «Чат с поддержкой» или «Звонок в поддержку»).
- Убери любые номера телефонов, кроме номера компании, если он был в исходном тексте и разрешён. Вместо телефона — «коллеги из поддержки на связи в личном кабинете: «Чат с поддержкой» или «Звонок в поддержку»».
- Никогда не говори «информации нет», «не нашла», «не удалось проверить». Если в ответе было такое — замени на то, что известно, или на полезное предложение (подобрать похожие отели, где это точно есть, сдвинуть даты, рассказать о другом).
- Если в ответе говорилось, что номеров/вариантов сейчас не видно из-за сбоя, — скажи по-человечески, что на эти даты по отелю мест не видно, и предложи сдвинуть даты или посмотреть похожие отели.
- Тон: на «вы», дружелюбно, коротко, без канцелярита и без markdown (никаких **, #, таблиц, списков с дефисами или цифрами).
- Если ответ длинный — сократи до 3–5 предложений: главное, совет и один вопрос. Лишние советы убери, факты и названия отелей сохрани.
Верни только новый текст ответа.`

/**
 * Rewrite once with the given model call. Falls back to the original text if
 * the call fails or returns nothing.
 */
export async function humanizeReply(
  text: string,
  complete: (system: string, user: string) => Promise<string>,
  opts: { allowedPhone?: string } = {},
): Promise<string> {
  try {
    const out = (await complete(HUMANIZE_SYSTEM, text)).trim()
    if (!out) return text
    // Prefer the rewrite unless it made things worse.
    return findMachineTalk(out, opts).length <= findMachineTalk(text, opts).length ? out : text
  } catch {
    return text
  }
}
