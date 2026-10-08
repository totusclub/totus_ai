/**
 * Facts cascade (server/hotelFacts.ts): Level.Travel card → guest reviews →
 * web, on fakes — no network, no keys.
 * Run: npx tsx scripts/check-hotel-facts.ts
 */
import assert from 'node:assert/strict'
import {
  __setFactsDeps,
  confirmFeatures,
  evidenceComment,
  mentions,
  researchHotel,
  topicKeywords,
} from '../server/hotelFacts.ts'
import type { HotelInfo, HotelReview } from '../server/levelTravel.ts'
import { parseYandexXml } from '../server/webSearch.ts'

let passed = 0
async function check(name: string, fn: () => Promise<void> | void) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

function hotel(id: number, name: string, extra: Partial<HotelInfo> = {}): HotelInfo {
  return {
    hotel_id: id, name, stars: 5, rating: 9, review_count: 100, city: 'Белек', region: 'Белек',
    country: 'Турция', features: {}, description: '', images: [], ...extra,
  }
}

const HOTELS: Record<number, HotelInfo> = {
  1: hotel(1, 'Alpha Resort', { description: 'Большая территория. Профессиональная анимационная команда, вечерние шоу каждый день.' }),
  2: hotel(2, 'Beta Hotel', { description: 'Песчаный пляж, 1-я линия.' }),
  3: hotel(3, 'Gamma Club', { description: 'Тихий отель для отдыха.' }),
  4: hotel(4, 'Delta Palace', { description: 'Отель у моря.' }),
  5: hotel(5, 'Epsilon Inn', { description: '' }),
}
const REVIEWS: Record<number, HotelReview[]> = {
  2: [
    { text: 'Отдыхали семьёй. Анимация супер, аниматоры весёлые, дети в восторге!', rating: 10 },
    { text: 'Еда вкусная.', pros: 'Отличная анимация и мини-диско', rating: 9 },
  ],
  3: [{ text: 'Анимации нет совсем, вечером скучно.', rating: 6 }],
  4: [{ text: 'Номер чистый, спасибо горничной.', rating: 8 }],
}
let webCalls: string[] = []

function install(web = true) {
  webCalls = []
  __setFactsDeps({
    fetchHotelInfo: async (id) => HOTELS[id] ?? null,
    getCachedHotel: (id) => HOTELS[id],
    fetchHotelReviews: async (id) => {
      if (id === 5) throw new Error('Level.Travel 500')
      return { reviews: REVIEWS[id] ?? [] }
    },
    isWebSearchEnabled: () => web,
    webSearch: async (q) => {
      webCalls.push(q)
      if (q.includes('Delta Palace')) {
        return [
          { title: 'Delta Palace — отзывы туристов', url: 'https://example.com/delta', snippet: 'В Delta Palace отличная анимация для детей и взрослых, по вечерам шоу.' },
          { title: 'Другой отель Omega', url: 'https://example.com/omega', snippet: 'В Omega классная анимация.' },
        ]
      }
      return []
    },
  })
}

console.log('check-hotel-facts')

await check('ключевые слова: «классная анимация» → анимац; «спа» не ловит «спасибо»', () => {
  const kw = topicKeywords('классная анимация')
  assert.ok(kw.includes('анимац'))
  assert.ok(mentions('Профессиональные аниматоры', kw))
  const spa = topicKeywords('спа')
  assert.equal(mentions('Спасибо персоналу', spa), false)
  assert.equal(mentions('Хороший спа-центр', spa), true)
})

await check('факт из описания отеля — без отзывов и интернета', async () => {
  install()
  const r = await researchHotel(1, 'анимация')
  assert.equal(r.found, true)
  assert.equal(r.facts[0].source, 'hotel')
  assert.match(r.facts[0].text, /анимационная команда/)
  assert.equal(webCalls.length, 0, 'интернет не нужен, когда отель сам это пишет')
})

await check('нет в описании → берём из отзывов гостей, с тоном', async () => {
  install()
  const r = await researchHotel(2, 'анимация')
  assert.equal(r.found, true)
  assert.ok(r.facts.every((f) => f.source === 'guests'))
  assert.equal(r.guests.total, 2)
  assert.equal(r.guests.positive, 2)
  assert.equal(webCalls.length, 0)
})

await check('нет ни в описании, ни в отзывах → интернет, только про этот отель', async () => {
  install()
  const r = await researchHotel(4, 'анимация')
  assert.equal(r.found, true)
  assert.equal(webCalls.length, 1)
  assert.ok(r.facts.some((f) => f.source === 'web' && /Delta Palace/.test(f.text)))
  assert.ok(!r.facts.some((f) => /Omega/.test(f.text)), 'страница про другой отель отброшена')
})

await check('ошибка отзывов и пустой интернет → found=false без исключения', async () => {
  install()
  const r = await researchHotel(5, 'анимация')
  assert.equal(r.found, false)
  assert.deepEqual(r.facts, [])
})

await check('интернет выключен (нет ключей) → каскад заканчивается на отзывах', async () => {
  install(false)
  const r = await researchHotel(4, 'анимация')
  assert.equal(webCalls.length, 0)
  assert.equal(r.found, false)
})

await check('подбор «с анимацией»: подтверждённые отели, жалобы не считаются', async () => {
  install()
  const m = await confirmFeatures([1, 2, 3, 4, 5], ['анимация'])
  const ok = (id: number) => m.get(id)?.confirmed.includes('анимация') ?? false
  assert.equal(ok(1), true, 'описание отеля')
  assert.equal(ok(2), true, 'отзывы гостей')
  assert.equal(ok(3), false, '«анимации нет, скучно» — не подтверждение')
  assert.equal(ok(4), true, 'интернет')
  assert.equal(ok(5), false)
  assert.equal(m.get(2)?.praise, 2)
  assert.equal(m.get(3)?.complaints, 1)
})

await check('комментарий к карточке: из похвалы гостей, без кавычек и цен', async () => {
  install()
  const m = await confirmFeatures([2], ['анимация'])
  const c = evidenceComment(m.get(2))
  assert.ok(c && c.startsWith('Гости: '), c)
  assert.ok(c!.length <= 110)
})

await check('разбор ответа Яндекса: заголовок, адрес, фрагменты без <hlword>', () => {
  const xml = '<yandexsearch><response><results><grouping><group><doc><url>https://a.ru/x</url><title>Rixos <hlword>Park</hlword> Belek</title><passages><passage>Анимация &amp; шоу</passage><passage>Дети довольны</passage></passages></doc></group></grouping></results></response></yandexsearch>'
  const r = parseYandexXml(xml)
  assert.equal(r.length, 1)
  assert.equal(r[0].title, 'Rixos Park Belek')
  assert.equal(r[0].snippet, 'Анимация & шоу … Дети довольны')
})

__setFactsDeps(null)
console.log(`check-hotel-facts: ${passed} passed`)
