/**
 * Personal data detector for Masha's chat (owner's rule, 12.10.2026): NO
 * personal data of any kind may reach DeepSeek or be stored in the open —
 * names, phones, e-mail, home address, passport, cards, ИНН, СНИЛС, date of
 * birth, document / order numbers, profile links, codes and passwords,
 * car plates. Plan: docs/PII_GUARD_PLAN_RU.md.
 *
 * Pure and dependency-free: the same code checks incoming chat messages,
 * restored history, the request to DeepSeek, stored history and the journal.
 * The detector fires on VALUES, not on topics: «нужен ли загранпаспорт?»
 * passes, «паспорт 45 12 345678» does not.
 */
import { AGENT_NAMES, LATIN_NAMES, NAME_FORMS, RELATION_WORDS } from './names.js'

export const PII_RULES_VERSION = 'pii-3 · 2026-10-18'

export type PiiType =
  | 'name'
  | 'phone'
  | 'email'
  | 'address'
  | 'passport'
  | 'card'
  | 'inn'
  | 'snils'
  | 'birth_date'
  | 'document'
  | 'order'
  | 'account'
  | 'profile'
  | 'secret'
  | 'vehicle'

export interface PiiFinding {
  type: PiiType
  /** Offsets in the ORIGINAL text */
  start: number
  end: number
}

export interface PiiContext {
  /** Extra place names (resorts, departure cities) that are not people */
  places?: Iterable<string>
  /** Words of hotel names shown in this chat */
  hotelWords?: Iterable<string>
  /** Previous user message — catches a number split over two messages */
  previousUserText?: string
}

/** For the warning: «уберите … (номер телефона, имя или фамилию)». */
export const PII_WARNING_LABELS: Record<PiiType, string> = {
  name: 'имя или фамилию',
  phone: 'номер телефона',
  email: 'адрес электронной почты',
  address: 'адрес',
  passport: 'паспортные данные',
  card: 'номер банковской карты',
  inn: 'ИНН',
  snils: 'СНИЛС',
  birth_date: 'дату рождения',
  document: 'номер документа',
  order: 'номер заказа или брони',
  account: 'номер банковского счёта',
  profile: 'ссылку на профиль или ник',
  secret: 'код или пароль',
  vehicle: 'номер автомобиля',
}

/** For masked storage: «[скрыто: телефон]». */
export const PII_MASK_LABELS: Record<PiiType, string> = {
  name: 'имя',
  phone: 'телефон',
  email: 'e-mail',
  address: 'адрес',
  passport: 'паспорт',
  card: 'карта',
  inn: 'ИНН',
  snils: 'СНИЛС',
  birth_date: 'дата рождения',
  document: 'документ',
  order: 'номер заказа',
  account: 'счёт',
  profile: 'профиль',
  secret: 'код',
  vehicle: 'номер авто',
}

/* ------------------------------------------------------------------ */
/* Normalization with an offset map back to the original text.        */
/* ------------------------------------------------------------------ */

// Soft hyphen, zero-width chars, bidi marks, BOM (built from code points so the
// file itself stays plain ASCII here).
const INVISIBLE = new RegExp('[' + [[0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join('') + ']', 'u')

interface Norm {
  /** lower-case analysis text, ё → е, homoglyphs fixed */
  a: string
  /** a[i] came from original index map[i] */
  map: number[]
  /** original char at a[i] was upper-case */
  upper: boolean[]
}

const LAT_TO_CYR: Record<string, string> = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к' }
const LAT_TO_CYR_UPPER: Record<string, string> = { b: 'в', h: 'н', m: 'м', t: 'т' }
const CYR_TO_LAT: Record<string, string> = { а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', в: 'b', н: 'h', м: 'm', т: 't' }

export function normalize(text: string): Norm {
  const chars: string[] = []
  const map: number[] = []
  const upper: boolean[] = []
  let i = 0
  for (const ch of text) {
    const idx = i
    i += ch.length
    if (INVISIBLE.test(ch)) continue
    const nf = ch.normalize('NFKC')
    for (const c of nf) {
      const low = c.toLowerCase()
      const isUp = low !== c
      for (const l of low) {
        chars.push(l === 'ё' ? 'е' : l === '\u{a0}' ? ' ' : l)
        map.push(idx)
        upper.push(isUp)
      }
    }
  }
  // Mixed-script words: «Ивaнов» with a Latin «a», «ivаn» with a Cyrillic «а».
  const word = /[a-zа-я]+/g
  let m: RegExpExecArray | null
  const joined = chars.join('')
  while ((m = word.exec(joined))) {
    const w = m[0]
    const lat = (w.match(/[a-z]/g) ?? []).length
    const cyr = w.length - lat
    if (!lat || !cyr) continue
    for (let k = 0; k < w.length; k++) {
      const pos = m.index + k
      const c = chars[pos]
      if (cyr >= lat && /[a-z]/.test(c)) chars[pos] = LAT_TO_CYR[c] ?? (upper[pos] ? LAT_TO_CYR_UPPER[c] : undefined) ?? c
      else if (lat > cyr && /[а-я]/.test(c)) chars[pos] = CYR_TO_LAT[c] ?? c
    }
  }
  // Our own placeholders «[скрыто: …]» are not data. They become «§§§» — a
  // barrier: «меня зовут [скрыто: имя], телефон …» must not read «телефон»
  // as the name (that blocked every next message after a restore).
  const a = chars.join('').replace(/\[скрыто: [^\]]{1,20}\]/g, (m) => '§'.repeat(m.length))
  return { a, map, upper }
}

function toOriginal(n: Norm, text: string, start: number, end: number): [number, number] {
  const s = n.map[start] ?? 0
  const lastIdx = n.map[Math.max(start, end - 1)] ?? s
  const cp = text.codePointAt(lastIdx) ?? 0
  return [s, lastIdx + (cp > 0xffff ? 2 : 1)]
}

/* ------------------------------------------------------------------ */
/* Validators.                                                          */
/* ------------------------------------------------------------------ */

export function luhnValid(d: string): boolean {
  let sum = 0
  let alt = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export function snilsValid(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false
  const body = d.slice(0, 9)
  if (/^(\d)\1{8}$/.test(body)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * (9 - i)
  let check = sum < 100 ? sum : sum === 100 || sum === 101 ? 0 : sum % 101
  if (check === 100) check = 0
  return check === Number(d.slice(9))
}

export function innValid(d: string): boolean {
  const n = (s: string, w: number[]) => (w.reduce((acc, k, i) => acc + k * Number(s[i]), 0) % 11) % 10
  if (/^\d{10}$/.test(d)) return n(d, [2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[9])
  if (/^\d{12}$/.test(d)) {
    return (
      n(d, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[10]) &&
      n(d, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[11])
    )
  }
  return false
}

/* ------------------------------------------------------------------ */
/* Numbers: phones, documents, cards, accounts.                          */
/* ------------------------------------------------------------------ */

const CURRENCY_AFTER = /^\s*(?:₽|р\.|р(?![а-я])|руб|rub|тыс|т\.р|k(?![a-z])|к(?![а-я])|\$|€|usd|eur|долл|евро|млн)/
const CURRENCY_BEFORE = /(?:₽|\$|€)\s*$/
const PASSPORT_CTX = /(паспорт|серия|выдан|код подразделения|загран|passport)/
const LICENSE_CTX = /(водительск|права(?![а-я])|прав(?![а-я])|\bву\b|снилс|полис|омс|свидетельств|виз[аыу] (?:номер|№)|номер виз)/
const INN_CTX = /инн/
const CARD_CTX = /(карт[аыуеой]|card|visa|виза карт|mastercard|мир(?![а-я])|maestro|кредитк|дебетов)/

/** Blank out dates so «12.11.2026–19.11.2026» is not read as a 16-digit number. */
function blankDates(a: string): string {
  return a
    .replace(/(?<!\d)(\d{1,2})([./])(\d{1,2})(?:\2(\d{2}|\d{4}))?(?!\d)/g, (m, d, _s, mo) =>
      Number(d) >= 1 && Number(d) <= 31 && Number(mo) >= 1 && Number(mo) <= 12 ? ' '.repeat(m.length) : m,
    )
    .replace(/(?<!\d)(?:19|20)\d{2}-\d{2}-\d{2}(?!\d)/g, (m) => ' '.repeat(m.length))
    .replace(/(?<!\d)\d{1,2}:\d{2}(?!\d)/g, (m) => ' '.repeat(m.length))
}

function classifyNumber(
  raw: string,
  digits: string,
  before: string,
  after: string,
): PiiType | null {
  const n = digits.length
  const plus = raw.trimStart().startsWith('+')
  const money = (CURRENCY_AFTER.test(after) || CURRENCY_BEFORE.test(before)) && !plus
  const near = `${before.slice(-40)} ${after.slice(0, 20)}`
  if (n >= 20 && n <= 34 && !money) return 'account'
  if ((n === 9 || n === 10) && PASSPORT_CTX.test(near)) return 'passport'
  if (n === 11 && snilsValid(digits) && !money && !/^[78][3489]/.test(digits)) return 'snils'
  if (n === 11 && /снилс/.test(near)) return 'snils'
  if (n >= 13 && n <= 19 && !money && (luhnValid(digits) || CARD_CTX.test(near)) && !LICENSE_CTX.test(near)) return 'card'
  if (n >= 6 && LICENSE_CTX.test(near) && !money) return 'document'
  if (n >= 13 && n <= 19 && !money) return 'document'
  if (plus && n >= 10 && n <= 15) return 'phone'
  if (n === 11 && /^[78][3489]/.test(digits) && !money) return 'phone'
  if (n === 10 && /^9/.test(digits) && !money) return 'phone'
  if (n === 11 && snilsValid(digits) && !money) return 'snils'
  if ((n === 10 || n === 12) && innValid(digits) && !money) {
    if (INN_CTX.test(near) || !/[\s\-.]/.test(raw.trim())) return 'inn'
  }
  if (n === 10 && /^\d{2} \d{2} \d{6}$/.test(raw.trim())) return 'passport'
  if (INN_CTX.test(near) && (n === 10 || n === 12) && !money) return 'inn'
  return null
}

const NUMBER_GROUP = /\+?\(?\d[\d \t\-.()/]*\d/g

function detectNumbers(a: string, out: Array<{ type: PiiType; s: number; e: number }>) {
  const d = blankDates(a).replace(/(?<=\d[ \-]?)[oо](?=[ \-]?\d)/g, '0')
  let m: RegExpExecArray | null
  NUMBER_GROUP.lastIndex = 0
  while ((m = NUMBER_GROUP.exec(d))) {
    // Split «100 000 – 200 000», «8 916 … , 8 925 …» into separate groups.
    const parts = m[0].split(/(?<=\d)\s+[-–—]\s+(?=\d)/)
    let offset = m.index
    for (const part of parts) {
      const at = d.indexOf(part, offset)
      offset = at + part.length
      const digits = part.replace(/\D/g, '')
      if (digits.length < 6) continue
      const type = classifyNumber(part, digits, a.slice(Math.max(0, at - 60), at), a.slice(at + part.length, at + part.length + 40))
      if (type) out.push({ type, s: at, e: at + part.length })
    }
  }
}

/** Numbers written in words: «восемь девятьсот шестнадцать сто двадцать три…». */
const UNITS: Record<string, number> = { ноль: 0, нуль: 0, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9 }
const TEENS: Record<string, number> = { десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19 }
const TENS: Record<string, number> = { двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90 }
const HUNDREDS: Record<string, number> = { сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900 }

function detectSpelledNumbers(a: string, out: Array<{ type: PiiType; s: number; e: number }>) {
  const tokens = [...a.matchAll(/[а-я]+/g)].map((t) => ({ w: t[0], s: t.index!, e: t.index! + t[0].length }))
  const isNum = (w: string) => w in UNITS || w in TEENS || w in TENS || w in HUNDREDS
  const joinedTo = (j: number) => j > 0 && /^[\s,\-]*$/.test(a.slice(tokens[j - 1].e, tokens[j].s))
  let i = 0
  while (i < tokens.length) {
    const plus = tokens[i].w === 'плюс'
    if (!plus && !isNum(tokens[i].w)) {
      i++
      continue
    }
    let j = plus ? i + 1 : i
    if (plus && !(j < tokens.length && isNum(tokens[j].w) && joinedTo(j))) {
      i++
      continue
    }
    let digits = ''
    let words = 0
    while (j < tokens.length && isNum(tokens[j].w) && (j === i || joinedTo(j))) {
      let value = 0
      let used = 0
      if (tokens[j].w in HUNDREDS) {
        value += HUNDREDS[tokens[j].w]
        j++
        used++
      }
      if (j < tokens.length && (used === 0 || joinedTo(j)) && tokens[j].w in TEENS) {
        value += TEENS[tokens[j].w]
        j++
        used++
      } else {
        if (j < tokens.length && (used === 0 || joinedTo(j)) && tokens[j].w in TENS) {
          value += TENS[tokens[j].w]
          j++
          used++
        }
        if (j < tokens.length && (used === 0 || joinedTo(j)) && tokens[j].w in UNITS) {
          value += UNITS[tokens[j].w]
          j++
          used++
        }
      }
      if (!used) break
      digits += String(value)
      words += used
    }
    if (words >= 4 && digits.length >= 7) {
      const s = tokens[i].s
      const e = tokens[j - 1].e
      const type = classifyNumber(plus ? `+${digits}` : digits, digits, a.slice(Math.max(0, s - 60), s), a.slice(e, e + 40))
      out.push({ type: type ?? 'phone', s, e })
    }
    i = Math.max(i + 1, j)
  }
}

/* ------------------------------------------------------------------ */
/* Pattern detectors.                                                   */
/* ------------------------------------------------------------------ */

const STREET =
  '(?:ул\\.?|улиц[аеуы]|улицей|пр-т|просп\\.?|проспект[аеу]?|пер\\.|переул(?:ок|ка|ке)|ш\\.|шоссе|б-р|бульвар[аеу]?|наб\\.|набережн(?:ая|ой|ую)|пл\\.|тупик[аеу]?|алле[яиюе]|мкр\\.?|микрорайон[аеу]?)'
const STREET_RE = new RegExp(`(?<![а-я])${STREET}`)
const ADDRESS_STREET = new RegExp(
  `(?<![а-я])${STREET}\\s+(?:[а-яa-z0-9\\-]+[\\s,]+){0,3}?(?:д\\.?\\s*|дом\\s*)?\\d{1,4}[а-я]?(?:\\/\\d{1,4})?(?:\\s*(?:к|корп|корпус|стр|строение)\\.?\\s*\\d{1,3})?(?![\\d])`,
  'g',
)
const ADDRESS_FLAT = /(?<![а-я])(?:кв\.?|квартир[аеуы])\s*№?\s*\d{1,4}(?!\d)/g
const POSTCODE = /(?<!\d)[1-6]\d{5}(?!\d)/g
const POSTCODE_CTX = /(индекс|г\.|город|ул\.|улиц|обл\.|област|край|респ|россия|рф)/
const HOME_CTX =
  /(?<![а-я])(?:живу|живем|живём|проживаю|проживаем|прописан[аы]?|прописк[аеиу]|зарегистрирован[аы]?|мой адрес|наш адрес|домашний адрес|адрес проживания|адрес регистрации|адрес доставки|доставьте)(?![а-я])/g
const UNITS_AFTER = /^\s*(?:мин|км|м(?![а-я])|метр|час|звезд|\*|ноч|дн|человек|чел|взросл|дет|кв\.?\s*м)/
const HOTEL_CTX = /(отел|гостиниц|hotel|resort|вилл|апартамент)/

function detectAddresses(a: string, out: Array<{ type: PiiType; s: number; e: number }>) {
  let m: RegExpExecArray | null
  ADDRESS_STREET.lastIndex = 0
  while ((m = ADDRESS_STREET.exec(a))) {
    const before = a.slice(Math.max(0, m.index - 50), m.index)
    HOME_CTX.lastIndex = 0
    if (HOTEL_CTX.test(before) && !HOME_CTX.test(before)) continue
    // «шоссе, 5 минут», «улица 300 м от моря» — distances, not a house number.
    if (UNITS_AFTER.test(a.slice(m.index + m[0].length, m.index + m[0].length + 12))) continue
    out.push({ type: 'address', s: m.index, e: m.index + m[0].length })
  }
  ADDRESS_FLAT.lastIndex = 0
  while ((m = ADDRESS_FLAT.exec(a))) out.push({ type: 'address', s: m.index, e: m.index + m[0].length })
  POSTCODE.lastIndex = 0
  while ((m = POSTCODE.exec(a))) {
    const near = a.slice(Math.max(0, m.index - 30), m.index + 36)
    if (POSTCODE_CTX.test(near) && !CURRENCY_AFTER.test(a.slice(m.index + 6))) {
      out.push({ type: 'address', s: m.index, e: m.index + 6 })
    }
  }
  HOME_CTX.lastIndex = 0
  while ((m = HOME_CTX.exec(a))) {
    const tailStart = m.index + m[0].length
    const clause = a.slice(tailStart, tailStart + 80).split(/[.!?\n;]/)[0]
    if (STREET_RE.test(clause) || /\d/.test(clause)) {
      out.push({ type: 'address', s: tailStart, e: tailStart + clause.length })
    }
  }
}

const EMAIL = /[a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)+/g
const EMAIL_OBFUSCATED =
  /[a-z0-9._%+\-]{2,}\s*(?:\(at\)|\[at\]|\s+at\s+|\(?собака\)?)\s*[a-z0-9\-]{2,}\s*(?:\.|\(dot\)|\[dot\]|\s+dot\s+|\(?точка\)?)\s*[a-zа-я]{2,10}(?![a-zа-я])/g
const PROFILE_LINK =
  /(?:https?:\/\/)?(?:www\.)?(?:vk\.com|vkontakte\.ru|t\.me|telegram\.me|instagram\.com|instagr\.am|facebook\.com|fb\.com|ok\.ru|wa\.me|tiktok\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com)\/[a-z0-9_.\-@/]+/g
const HANDLE = /(?<![a-z0-9._%+\-])@[a-z0-9_][a-z0-9_.]{2,31}/g
const HANDLE_CTX =
  /(?<![а-я])(?:ник|никнейм|логин|юзернейм|username|телеграм[а-я]*|telegram|инстаграм[а-я]*|инст[аеу]?|instagram|вотсап[а-я]*|ватсап[а-я]*|whatsapp|скайп[а-я]*|skype|вконтакте|вк)\s*[:\-—]?\s*(?:это\s+)?([a-z0-9_.@]{3,32})(?![a-z0-9_.])/g
const SECRET =
  /(?<![а-я])(?:код(?:\s+из)?\s+смс|смс[\s-]?код|код\s+подтверждения|пароль|пин[\s-]?код|pin|cvv2?|cvc2?|cvn)\s*[:\-—]?\s*(?:это\s+|такой\s+)?([^\s,;?!]{3,})/g
const ORDER =
  /(?<![а-я])(?:заказ[а-я]*|брон[а-я]*|ваучер[а-я]*|pnr|booking|reservation|билет[а-я]*)\s*(?:№|#|номер|no\.?)?\s*[:\-—]?\s*([a-zа-я0-9][a-z0-9\-]{4,})(?![a-z0-9])/g
const PASSPORT_SPLIT = /серия\s*№?\s*\d{2}\s?\d{2}[\s,]*(?:номер|№|н\.)?\s*\d{6}(?!\d)/g
const VEHICLE =
  /(?<![a-zа-я0-9])[авекмнорстухabekmhopctyx]\s?\d{3}\s?[авекмнорстухabekmhopctyx]{2}\s?\d{2,3}(?![a-zа-я0-9])/g
const BIRTH_CERT = /(?<![a-z0-9])[ivxlc]{1,4}\s?-\s?[а-я]{2}\s?№?\s?\d{6}(?!\d)/g
const IBAN = /(?<![a-z0-9])[a-z]{2}\d{2}(?:\s?[a-z0-9]{4}){3,7}(?:\s?[a-z0-9]{1,3})?(?![a-z0-9])/g

const MONTHS = '(?:январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*'
const DATE_ANY = new RegExp(
  `(?<!\\d)(?:\\d{1,2}[./]\\d{1,2}[./](?:19|20)?\\d{2}|\\d{1,2}\\s+${MONTHS}(?:\\s+(?:19|20)\\d{2})?|(?:19|20)\\d{2})(?!\\d)`,
  'g',
)
const BIRTH_CTX =
  /(родил(?:ся|ась|ись)?|рожден[аы]?|рождени[еяю]|д\.\s?р\.|(?<![а-я])др(?![а-я])|г\.\s?р\.|(?<![а-я])гр(?![а-я])|birth|born|dob)/

function detectPatterns(a: string, out: Array<{ type: PiiType; s: number; e: number }>) {
  const push = (type: PiiType, re: RegExp, group?: number, accept?: (v: string) => boolean) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(a))) {
      if (group !== undefined) {
        const v = m[group]
        if (!v || (accept && !accept(v))) continue
        const s = m.index + m[0].lastIndexOf(v)
        out.push({ type, s, e: s + v.length })
      } else {
        out.push({ type, s: m.index, e: m.index + m[0].length })
      }
    }
  }
  push('email', EMAIL)
  push('email', EMAIL_OBFUSCATED)
  push('profile', PROFILE_LINK)
  push('profile', HANDLE)
  push('profile', HANDLE_CTX, 1)
  push('secret', SECRET, 1, (v) => /\d/.test(v) || /^[a-z0-9_!#$%&*+\-=]{4,}$/.test(v))
  push('order', ORDER, 1, (v) => (v.match(/\d/g) ?? []).length >= 4)
  push('passport', PASSPORT_SPLIT)
  push('vehicle', VEHICLE)
  push('document', BIRTH_CERT)
  push('account', IBAN, undefined)
  const year = new Date().getFullYear()
  DATE_ANY.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DATE_ANY.exec(a))) {
    const v = m[0]
    if (/^(?:19|20)\d{2}$/.test(v) && Number(v) >= year) continue
    const before = a.slice(Math.max(0, m.index - 40), m.index).split(/[.!?\n]/).pop() ?? ''
    const after = a.slice(m.index + v.length, m.index + v.length + 25).split(/[!?\n]/)[0]
    if (BIRTH_CTX.test(before) || BIRTH_CTX.test(after)) out.push({ type: 'birth_date', s: m.index, e: m.index + v.length })
  }
}

/* ------------------------------------------------------------------ */
/* Names.                                                              */
/* ------------------------------------------------------------------ */

/** Places that are also first names or look like surnames. */
const PLACES = new Set(
  `виктория софия александрия доминика мадина марсель лара мира владимир пушкин ростов саратов киров
   псков тамбов азов королев чехов ржев тутаев берлин турин пекин харбин мессина аргентина украина
   палестина герцеговина каролина кортина майя роза поляна лион милан`
    .split(/\s+/)
    .filter(Boolean),
)
const PLACE_PREPS = new Set(['в', 'во', 'на', 'из', 'до', 'к', 'ко', 'от', 'город', 'города', 'г', 'около', 'возле', 'под', 'курорт', 'курорте'])
/** Words around hotel / brand names: «Али Бей», «Роза Хутор», «Санта Мария». */
const HOTEL_WORDS = new Set(
  `отель отеля отелю отелем отеле отели отелей гостиница гостиницы гостинице гостиницу hotel hotels resort
   resorts резорт клуб club palace палас пэлас beach бич spa спа suite suites сьют villa villas вилла виллы
   apart апарт apartments inn lodge deluxe делюкс collection коллекшн бей бэй bay garden гарден park парк
   plaza плаза royal роял grand гранд хутор санта сан сант сент святой святого святая св santa san saint
   st mare маре boutique бутик residence резиденс village premium премиум дольче dolce вита vita lux люкс
   карт карте карта carte`
    .split(/\s+/)
    .filter(Boolean),
)
/** Hotel / brand words that look like surnames. */
const BRANDS = new Set(['кремлин', 'дельфин', 'delphin', 'риксос', 'rixos', 'титаник', 'titanic', 'сони', 'sony'])

const PATRONYMIC = /^[а-я]{3,}(?:ович|евич|ьич|овна|евна|ична|инична)(?:а|у|ем|ом|е|ы|ой|ою|ей)?$/
const SURNAME =
  /^[а-я]{2,}(?:ова|ева|ина|ына|ов|ев|ин|ын|ской|ский|ская|цкий|цкая|ских|енко|ук|юк|чук|ян|янц|дзе|швили|иани)(?:а|у|ым|ом|е|ой|ых|ую|ого|ому|им)?$/
const LATIN_SURNAME =
  /^[a-z]{2,}(?:ova|eva|ina|yna|ov|ev|in|yn|sky|skiy|skii|skaya|skaia|enko|uk|yuk|chuk|yan|ian|dze|shvili|ovich|evich|ovna|evna)$/

const STOP = new Set(
  `в во на по у к ко с со из от до для и а но или как что это то тот та те такой такая был была были будет
   нужно нужна надо можно ли же бы не ни уже тоже также просто вот там тут здесь мне меня тебя вас нас его
   ее её их него нее неё них себя кто кого кому чем мой моя мое моё мои наш наша наше наши ваш ваша твой
   мужа жены жену сына сыну дочь дочки дочери дочку ребенка детей маму мамы папу папы друга друзей подругу
   подруги брата сестры сестру бабушку дедушку тещу свекровь коллегу the a an my is are
   фио имя имени фамилия фамилию отчество турист туристы гость гости пассажир пассажиры зовут звать инн снилс`
    .split(/\s+/)
    .filter(Boolean),
)

interface Tok {
  w: string
  s: number
  e: number
  cap: boolean
  allCaps: boolean
  latin: boolean
  initial: boolean
}

function tokenize(n: Norm): Tok[] {
  const out: Tok[] = []
  for (const m of n.a.matchAll(/[a-zа-я]+/g)) {
    const s = m.index!
    const e = s + m[0].length
    let k = s - 1
    while (k >= 0 && /[\s"«»„“”'(\[\-—–*•]/.test(n.a[k])) k--
    const initial = k < 0 || /[.!?…\n]/.test(n.a[k]) || /\p{Extended_Pictographic}/u.test(n.a[k])
    let allCaps = true
    for (let q = s; q < e; q++) if (!n.upper[q]) allCaps = false
    out.push({ w: m[0], s, e, cap: n.upper[s], allCaps: allCaps && m[0].length > 1, latin: /^[a-z]+$/.test(m[0]), initial })
  }
  return out
}

function stems(w: string): string[] {
  const out = [w]
  for (const end of ['ами', 'ями', 'ой', 'ей', 'ом', 'ем', 'ию', 'ии', 'ью', 'е', 'у', 'а', 'ы', 'и', 'ю', 'я']) {
    if (w.length > end.length + 2 && w.endsWith(end)) out.push(w.slice(0, -end.length), w.slice(0, -end.length) + 'а', w.slice(0, -end.length) + 'я', w.slice(0, -end.length) + 'ия')
  }
  return out
}

function detectNames(n: Norm, ctx: PiiContext, out: Array<{ type: PiiType; s: number; e: number }>) {
  const toks = tokenize(n)
  const places = new Set([...PLACES, ...[...(ctx.places ?? [])].map((p) => p.toLowerCase().replace(/ё/g, 'е'))])
  const hotelWords = new Set([...(ctx.hotelWords ?? [])].map((p) => p.toLowerCase().replace(/ё/g, 'е')))
  const isPlace = (w: string) => stems(w).some((s) => places.has(s))
  const nearHotel = (i: number) =>
    [toks[i - 1], toks[i + 1]].some(
      (t) => t && (HOTEL_WORDS.has(t.w) || hotelWords.has(t.w) || BRANDS.has(t.w)) && /^[\s\-]*$/.test(n.a.slice(Math.min(t.e, toks[i].e), Math.max(t.s, toks[i].s))),
    ) || hotelWords.has(toks[i].w) || BRANDS.has(toks[i].w)
  const adjacent = (i: number, j: number) => {
    const a = toks[Math.min(i, j)]
    const b = toks[Math.max(i, j)]
    return Boolean(a && b) && /^[\s,]*$/.test(n.a.slice(a.e, b.s))
  }
  const isSurnameShape = (t: Tok) => (t.latin ? LATIN_SURNAME.test(t.w) : SURNAME.test(t.w) || PATRONYMIC.test(t.w))
  const flagged = new Set<number>()

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.w.length < 2) continue
    if (AGENT_NAMES.has(t.w)) {
      // Обращение к ассистенту — не личные данные. Но рядом с фамилией или словом
      // «дочка / жена / подруга…» это уже человек: проверяем как обычное имя.
      const person =
        (toks[i - 1] && RELATION_WORDS.has(toks[i - 1].w)) ||
        [i - 1, i + 1].some((j) => toks[j] && adjacent(i, j) && isSurnameShape(toks[j]) && toks[j].cap && !AGENT_NAMES.has(toks[j].w))
      if (!person) continue
    }
    const entry = NAME_FORMS.get(t.w)
    if (entry) {
      if (nearHotel(i)) continue
      if (isPlace(t.w) && toks[i - 1] && PLACE_PREPS.has(toks[i - 1].w)) continue
      if (entry.ambiguous) {
        const nextIsSurname = toks[i + 1] && adjacent(i, i + 1) && isSurnameShape(toks[i + 1]) && toks[i + 1].cap
        const prevIsSurname = toks[i - 1] && adjacent(i - 1, i) && isSurnameShape(toks[i - 1]) && toks[i - 1].cap
        if (!((t.cap && !t.initial) || nextIsSurname || prevIsSurname)) continue
      }
      flagged.add(i)
      continue
    }
    if (!t.latin && PATRONYMIC.test(t.w) && t.w.length >= 7 && !isPlace(t.w)) {
      flagged.add(i)
      continue
    }
    if (t.latin) {
      if (!LATIN_NAMES.has(t.w) && !LATIN_SURNAME.test(t.w)) continue
      const pair = [i - 1, i + 1].some((j) => {
        const o = toks[j]
        if (!o || !o.latin || !adjacent(i, j)) return false
        const names = LATIN_NAMES.has(t.w) ? LATIN_SURNAME.test(o.w) : LATIN_NAMES.has(o.w)
        return names && (t.cap || o.cap)
      })
      if (pair && !nearHotel(i)) flagged.add(i)
      continue
    }
    if (SURNAME.test(t.w) && t.cap && t.w.length >= 5 && !t.initial && !isPlace(t.w) && !nearHotel(i)) {
      flagged.add(i)
    }
  }

  // Context: «меня зовут …», «ФИО: …», «на имя …».
  const strong = /(?<![а-я])(?:(?:(\S+)\s+)?(?:зовут|звать)|(?:мо[её]|наше)\s+имя|имя\s*:|фио|ф\.\s?и\.\s?о\.?|моя\s+фамилия|фамилия\s*:|отчество\s*:|my name is|name\s*:)\s*[:\-—]?\s*/g
  const weak = /(?<![а-я])(?:фамили[яюей]|отчество|на\s+имя|оформ[а-я]*(?:\s+(?:бронь|билет[ыа]?|тур|путевку|путёвку|заказ))?\s+на|турист[ыа]?\s*:|гост[ьи]\s*:|пассажир[ыа]?\s*:)\s*/g
  const capture = (re: RegExp, strict: boolean) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(n.a))) {
      if (m[1] && ['тебя', 'вас', 'тебе', 'как'].includes(m[1])) continue
      const from = m.index + m[0].length
      let taken = 0
      for (let i = 0; i < toks.length && taken < 3; i++) {
        const t = toks[i]
        if (t.s < from) continue
        // Stop at a sentence end, a comma or a masked placeholder.
        if (/[.!?;\n§,]/.test(n.a.slice(taken > 0 ? toks[i - 1].e : from, t.s))) break
        if (STOP.has(t.w)) {
          if (taken === 0) break
          break
        }
        if (strict || t.cap || NAME_FORMS.has(t.w) || isSurnameShape(t)) {
          flagged.add(i)
          taken++
        } else break
      }
    }
  }
  capture(strong, true)
  capture(weak, false)

  // Full name: words right next to a found name (surname, patronymic, initials).
  let grew = true
  while (grew) {
    grew = false
    for (const i of [...flagged]) {
      for (const j of [i - 1, i + 1]) {
        const o = toks[j]
        if (!o || flagged.has(j) || !adjacent(i, j) || STOP.has(o.w) || HOTEL_WORDS.has(o.w) || isPlace(o.w)) continue
        const abbreviation = o.allCaps && o.w.length <= 5 && !NAME_FORMS.has(o.w) && !isSurnameShape(o)
        if (isSurnameShape(o) || NAME_FORMS.has(o.w) || (o.cap && !o.initial && o.w.length >= 3 && !abbreviation)) {
          flagged.add(j)
          grew = true
        }
      }
    }
  }
  for (const i of flagged) out.push({ type: 'name', s: toks[i].s, e: toks[i].e })

  // Initials: «Иванов И.И.», «И. И. Иванов».
  for (const m of n.a.matchAll(/(?<![а-я])([а-я]{3,})\s+([а-я])\.\s?([а-я])\.?(?![а-я])/g)) {
    const surname = m[1]
    if (SURNAME.test(surname) && n.upper[m.index!] && n.upper[m.index! + m[0].indexOf(m[2], surname.length)]) {
      out.push({ type: 'name', s: m.index!, e: m.index! + m[0].length })
    }
  }
  for (const m of n.a.matchAll(/(?<![а-я])([а-я])\.\s?([а-я])\.\s?([а-я]{3,})(?![а-я])/g)) {
    if (n.upper[m.index!] && n.upper[m.index! + m[0].lastIndexOf(m[3])] && !isPlace(m[3])) {
      out.push({ type: 'name', s: m.index!, e: m.index! + m[0].length })
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API.                                                          */
/* ------------------------------------------------------------------ */

function merge(raw: Array<{ type: PiiType; s: number; e: number }>) {
  const sorted = [...raw].sort((x, y) => x.s - y.s || y.e - x.e)
  const out: Array<{ type: PiiType; s: number; e: number }> = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.s < last.e) {
      if (r.e > last.e) last.e = r.e
      continue
    }
    out.push({ ...r })
  }
  return out
}

/** Every piece of personal data in `text` (original offsets). */
export function findPii(text: string, ctx: PiiContext = {}): PiiFinding[] {
  if (!text || !text.trim()) return []
  const n = normalize(text)
  const raw: Array<{ type: PiiType; s: number; e: number }> = []
  detectNumbers(n.a, raw)
  detectSpelledNumbers(n.a, raw)
  detectPatterns(n.a, raw)
  detectAddresses(n.a, raw)
  detectNames(n, ctx, raw)

  // A number split over two messages: «+7 916» … «123 45 67».
  if (ctx.previousUserText) {
    const tail = normalize(ctx.previousUserText).a.match(/(\+?[\d \-()]*\d)\s*$/)
    const head = n.a.match(/^\s*(\d[\d \-()]*\d)/)
    if (tail && head && tail[1].replace(/\D/g, '').length >= 3) {
      const joined = `${tail[1]} ${head[1]}`
      const type = classifyNumber(joined, joined.replace(/\D/g, ''), '', n.a.slice(head[0].length, head[0].length + 40))
      if (type) raw.push({ type, s: head.index! + head[0].indexOf(head[1]), e: head[0].length })
    }
  }

  return merge(raw).map((r) => {
    const [start, end] = toOriginal(n, text, r.s, r.e)
    return { type: r.type, start, end }
  })
}

export function hasPii(text: string, ctx?: PiiContext): boolean {
  return findPii(text, ctx).length > 0
}

/** Types found, in a stable order, without duplicates. */
export function piiTypes(findings: PiiFinding[]): PiiType[] {
  const order = Object.keys(PII_WARNING_LABELS) as PiiType[]
  const set = new Set(findings.map((f) => f.type))
  return order.filter((t) => set.has(t))
}

/** Replace every piece of personal data with «[скрыто: …]». */
export function maskPii(text: string, ctx?: PiiContext): string {
  if (!text) return text
  const findings = findPii(text, ctx)
  if (!findings.length) return text
  let out = text
  for (const f of [...findings].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, f.start)}[скрыто: ${PII_MASK_LABELS[f.type]}]${out.slice(f.end)}`
  }
  return out
}

/** Mask every string inside a JSON-like value (journal entries). */
export function maskDeep<T>(value: T, depth = 0): T {
  if (depth > 6 || value == null) return value
  if (typeof value === 'string') return maskPii(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, depth + 1)) as unknown as T
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskDeep(v, depth + 1)
    return out as T
  }
  return value
}
