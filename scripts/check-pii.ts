/**
 * Personal data detector (server/pii/detect.ts) on a fixed set of phrases.
 * Every phrase is invented. Rule of the owner (12.10.2026): any personal
 * data blocks the message, no exceptions; travel talk without values passes.
 * Run: npx tsx scripts/check-pii.ts
 */
import assert from 'node:assert/strict'
import { findPii, maskPii, maskDeep, piiTypes, type PiiType } from '../server/pii/detect.ts'
import { scrubLogLine, scrubStoredChat } from '../server/pii/storage.ts'

type Case = [string, PiiType]

/** Must be found (type given). */
const POSITIVE: Case[] = [
  // Names — first name alone, full name, other people, Latin, initials, context
  ['Меня зовут Анна', 'name'],
  ['меня зовут сергей, ищу тур', 'name'],
  ['Я Ольга, летим вдвоём', 'name'],
  ['Привет, это Ашот', 'name'],
  ['Мы с Сергеем хотим в Турцию', 'name'],
  ['Для Натальи и Игоря нужен номер', 'name'],
  ['сын Миша, ему 6 лет', 'name'],
  ['С нами едет бабушка Тамара', 'name'],
  ['Иванов Иван Иванович, двое взрослых', 'name'],
  ['Туристы: Петрова Мария', 'name'],
  ['Оформите на Смирнова', 'name'],
  ['фамилия: Кузнецова', 'name'],
  ['моя фамилия Тосунян', 'name'],
  ['ФИО Сидоров Пётр Алексеевич', 'name'],
  ['паспорт на имя Николаева', 'name'],
  ['IVANOV IVAN — так в загране', 'name'],
  ['Ivan Petrov, 2 adults', 'name'],
  ['My name is John', 'name'],
  ['Иванов И.И. и ребёнок', 'name'],
  ['И. И. Петров летит с нами', 'name'],
  ['Сергеевич сказал, что лучше Египет', 'name'],
  ['Мужа зовут Карен', 'name'],
  ['Вера Павлова поедет с нами', 'name'],
  ['Нас трое: Марина, Лена и я', 'name'],
  ['Билет на Роман Сергеевич', 'name'],
  ['Ивaнов (с латинской a) Иван', 'name'],
  ['Привет! Я Мехмет', 'name'],
  ['Жена Светлана хочет на Мальдивы', 'name'],
  // Phones
  ['мой номер +7 916 123-45-67', 'phone'],
  ['позвоните 8 (925) 765 43 21', 'phone'],
  ['89161234567', 'phone'],
  ['9161234567 — это мой', 'phone'],
  ['телефон +90 532 123 45 67', 'phone'],
  ['+7-9I6? нет, +7 916 1 2 3 4 5 6 7', 'phone'],
  ['восемь девятьсот шестнадцать сто двадцать три сорок пять шестьдесят семь', 'phone'],
  ['плюс семь девятьсот двадцать пять сто двадцать три сорок пять шестьдесят семь', 'phone'],
  ['+7 916 123 45 67 звоните после 18', 'phone'],
  ['номер 8.916.123.45.67', 'phone'],
  // E-mail, profiles
  ['пишите ivan.petrov@mail.ru', 'email'],
  ['почта ivan собака mail точка ru', 'email'],
  ['ivan (at) gmail (dot) com', 'email'],
  ['мой телеграм @ivan_petrov', 'profile'],
  ['инста: travel_masha', 'profile'],
  ['vk.com/id12345678', 'profile'],
  ['https://t.me/ivanpetrov', 'profile'],
  // Address
  ['живу на ул. Ленина 5, кв. 12', 'address'],
  ['адрес: г. Москва, улица Тверская, дом 7', 'address'],
  ['кв 45', 'address'],
  ['индекс 119361, Москва', 'address'],
  ['проживаю по адресу Садовая 10', 'address'],
  ['Доставьте ваучер на Ленинский проспект 32', 'address'],
  ['живу на улице Гагарина', 'address'],
  // Passport and documents
  ['паспорт 45 12 345678', 'passport'],
  ['серия 4512 номер 345678', 'passport'],
  ['загранпаспорт 75 1234567', 'passport'],
  ['45 12 345678', 'passport'],
  ['снилс 112-233-445 95', 'snils'],
  ['11223344595', 'snils'],
  ['инн 7707083893', 'inn'],
  ['мой ИНН 500100732259', 'inn'],
  ['500100732259', 'inn'],
  ['полис омс 1234567890123456', 'document'],
  ['водительские права 77 12 345678', 'document'],
  ['свидетельство о рождении IV-МЮ 123456', 'document'],
  // Cards, accounts, codes
  ['карта 4276 3800 1234 5678', 'card'],
  ['2202 2000 0000 0008', 'card'],
  ['5469 3800 1234 5673 оплачу', 'card'],
  ['счёт 40817810099910004312', 'account'],
  ['iban TR33 0006 1005 1978 6457 8413 26', 'account'],
  ['cvv 123', 'secret'],
  ['код из смс 4821', 'secret'],
  ['пароль: Qwerty123', 'secret'],
  // Birth date
  ['родился 12.03.1985', 'birth_date'],
  ['дата рождения 5 мая 1990', 'birth_date'],
  ['1985 г.р.', 'birth_date'],
  ['у дочки день рождения 15 ноября', 'birth_date'],
  ['ребёнок родился в 2019', 'birth_date'],
  // Orders, vehicles
  ['заказ 12345678 не оплачен', 'order'],
  ['номер брони: 9101855', 'order'],
  ['ваучер № 445566', 'order'],
  ['машина А123ВС77', 'vehicle'],
  // Obfuscation
  ['т е л: 8 9 1 6 1 2 3 4 5 6 7', 'phone'],
  ['8​916​123​45​67', 'phone'],
]

/** Must NOT be found — ordinary travel talk. */
const NEGATIVE: string[] = [
  'Нужен ли загранпаспорт в Турцию?',
  'Можно ли поменять фамилию в билете?',
  'Какой телефон у поддержки?',
  'Как оплатить картой Мир?',
  'Какие документы нужны ребёнку для поездки?',
  'Сколько стоит виза в Египет?',
  'Нужен ли паспорт для Абхазии?',
  'Хотим в Турцию на 7 ночей с 12.11.2026, двое взрослых и дети 5 и 9 лет',
  'Бюджет до 150 000 ₽',
  'от 89 900 до 120 000 руб',
  'цена 250 тыс. за двоих',
  'Вылет из Москвы 1 марта, обратно 10 марта',
  'на 8 марта хотим в тёплые страны',
  'Даты 12.11–19.11',
  'с 2026-11-01 по 2026-11-10',
  'Рейс SU 2134 в 10:30',
  'Отель Rixos Premium Belek',
  'Ali Bey Club Manavgat подойдёт?',
  'Расскажи про Mardan Palace',
  'Риксос парк белек мне подходит, поможешь выбрать номер?',
  'Хочу в Kaya Palazzo',
  'Санта Мария на Кубе — хороший курорт?',
  'Роза Хутор зимой',
  'Едем в Софию или в Варну',
  'Александрия или Хургада?',
  'Вылет из Владимира есть?',
  'Отдыхали в Ларе в прошлом году',
  'Мила, привет! Подбери тур',
  'Спасибо, Мила',
  'Рада помочь с подбором',
  'Вера в лучшее не помешает',
  'Надежда умирает последней',
  'любовь к морю у нас семейная',
  'Роза ветров в Кемере какая?',
  'Слава богу, нашли тур',
  'Марина в Бодруме красивая?',
  'Детский клуб и анимация есть?',
  'Номер 35 кв.м с балконом',
  'Нужна квартира на 4 человек?',
  'Хотим апартаменты на первой линии',
  'Отель на улице Ататюрк 15 — далеко от моря?',
  'Ребёнку 7 лет, второму 12',
  'Двое взрослых, один ребёнок 3 года',
  'Лучше 5* или 4*?',
  'Всё включено или ультра всё включено?',
  'Пароль от wifi в отеле дают?',
  'Сколько стоит заказ трансфера?',
  'Бронь на 7 ночей',
  'Забронировать 2 номера можно?',
  'Есть ли whatsapp поддержка?',
  'Сколько км от аэропорта до отеля? 15 км',
  'Площадь номера 45 кв. м',
  'Жена беременна, нужен спокойный отель',
  'Сыну нужна безглютеновая еда',
  'Нужен номер для колясочника',
  'Живу в Москве, вылет оттуда',
  'Летим из Казани или Екатеринбурга',
  'Хочу на Пхукет в декабре',
  'Купить тур в Египет за 100000',
  'Сколько ночей лучше, 7 или 10?',
  'В 2026 году хотим отметить день рождения на море',
  'День рождения у мужа в ноябре, хотим в тёплое место',
  'Расскажи про отель с id 9101855',
  'Какой рейтинг у отеля 9.2?',
  'Цена 470 794 ₽ нормальная?',
  'Белек, Сиде или Аланья?',
  'Шарм-эль-Шейх в январе',
  'Майами или Доминикана?',
  'Ультра Всё Включено и Первая Линия',
  'Отель Дельфин Империал хороший?',
  'Что лучше: Кремлин Палас или Титаник?',
  'Почему в Кемере галечный пляж?',
  'Покажи 10 вариантов',
  'Туры на майские праздники',
  'Хочу тур с вылетом 15 мая на 9 ночей',
  'Сколько стоит доплата за вид на море?',
  'Можно с собакой?',
  'Как тебя зовут?',
  'А вас как зовут?',
  'Как правильно указать отчество в анкете?',
  'Анимация для детей до 12 лет',
  'Отели сети Hilton в Египте',
  'Какой номер выбрать для семьи из четырёх?',
  'Номер телефона нужен для бронирования?',
  'Где ввести паспортные данные?',
  'Оплата по СБП возможна?',
  'Цена от 1 500 000 рублей за виллу',
  'Чем отличается Family Room от Deluxe?',
]

let failures = 0
console.log('check-pii')

for (const [text, type] of POSITIVE) {
  const found = findPii(text)
  if (!found.some((f) => f.type === type)) {
    failures++
    console.log(`  ✗ не найдено (${type}): «${text}» → [${found.map((f) => f.type).join(', ')}]`)
  }
}
for (const text of NEGATIVE) {
  const found = findPii(text)
  if (found.length) {
    failures++
    console.log(`  ✗ ложное срабатывание: «${text}» → ${found.map((f) => `${f.type}:«${text.slice(f.start, f.end)}»`).join(', ')}`)
  }
}

// Masking keeps the rest of the message and is idempotent.
const masked = maskPii('Меня зовут Анна, мой номер +7 916 123-45-67, хотим в Белек')
assert.equal(masked, 'Меня зовут [скрыто: имя], мой номер [скрыто: телефон], хотим в Белек')
assert.equal(maskPii(masked), masked)
assert.deepEqual(piiTypes(findPii('Анна, +79161234567')), ['name', 'phone'])
assert.deepEqual(maskDeep({ a: ['пишите ivan@mail.ru'], n: 5 }), { a: ['пишите [скрыто: e-mail]'], n: 5 })

// A number split over two messages.
assert.ok(findPii('123 45 67', { previousUserText: 'мой номер +7 916' }).some((f) => f.type === 'phone'))
// Places from the booking system are not names.
assert.equal(findPii('Летим в Кемер, потом в Анталью', { places: ['кемер', 'анталья'] }).length, 0)

// Clean-up of data stored before the guard (scripts/pii-scrub-storage.ts).
const chat = scrubStoredChat({ id: 'c1', title: 'Анна, +79161234567', messages_json: JSON.stringify([{ role: 'user', content: 'паспорт 45 12 345678' }, { role: 'assistant', content: 'Подобрала Белек' }]) })
assert.equal(chat.changed, true)
assert.equal(chat.title, '[скрыто: имя], [скрыто: телефон]')
assert.deepEqual(JSON.parse(chat.messagesJson).map((m: { content: string }) => m.content), ['паспорт [скрыто: паспорт]', 'Подобрала Белек'])
assert.equal(scrubStoredChat({ id: 'c2', title: 'Белек в ноябре', messages_json: '[]' }).changed, false)
const line = scrubLogLine(JSON.stringify({ ts: '2026-10-01T10:00:00.000Z', session: 'ab12cd34', kind: 'user', text: 'мой email anna@mail.ru' }))
assert.equal(line.changed, true)
assert.equal(JSON.parse(line.line).text, 'мой email [скрыто: e-mail]')
assert.equal(JSON.parse(line.line).ts, '2026-10-01T10:00:00.000Z')

const total = POSITIVE.length + NEGATIVE.length
console.log(`check-pii: ${total - failures}/${total} фраз (${POSITIVE.length} с данными, ${NEGATIVE.length} без), маскирование — ok`)
if (failures) process.exit(1)
