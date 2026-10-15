/**
 * Facts cascade (server/hotelFacts.ts): Level.Travel card → guest reviews,
 * on fakes — no network, no keys. Plus a guard: the only AI provider in the
 * server is DeepSeek (no Yandex AI / search).
 * Run: npx tsx scripts/check-hotel-facts.ts
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  __setFactsDeps,
  confirmFeatures,
  evidenceComment,
  mentions,
  researchHotel,
  topicKeywords,
} from '../server/hotelFacts.ts'
import type { HotelInfo, HotelReview } from '../server/levelTravel.ts'

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
function install() {
  __setFactsDeps({
    fetchHotelInfo: async (id) => HOTELS[id] ?? null,
    getCachedHotel: (id) => HOTELS[id],
    fetchHotelReviews: async (id) => {
      if (id === 5) throw new Error('Level.Travel 500')
      return { reviews: REVIEWS[id] ?? [] }
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

await check('факт из описания отеля', async () => {
  install()
  const r = await researchHotel(1, 'анимация')
  assert.equal(r.found, true)
  assert.equal(r.facts[0].source, 'hotel')
  assert.match(r.facts[0].text, /анимационная команда/)
})

await check('нет в описании → берём из отзывов гостей, с тоном', async () => {
  install()
  const r = await researchHotel(2, 'анимация')
  assert.equal(r.found, true)
  assert.ok(r.facts.every((f) => f.source === 'guests'))
  assert.equal(r.guests.total, 2)
  assert.equal(r.guests.positive, 2)
})

await check('нет ни в описании, ни в отзывах (ошибка отзывов) → found=false без исключения', async () => {
  install()
  const r = await researchHotel(5, 'анимация')
  assert.equal(r.found, false)
  assert.deepEqual(r.facts, [])
})

await check('подбор «с анимацией»: подтверждённые отели, жалобы не считаются', async () => {
  install()
  const m = await confirmFeatures([1, 2, 3, 4, 5], ['анимация'])
  const ok = (id: number) => m.get(id)?.confirmed.includes('анимация') ?? false
  assert.equal(ok(1), true, 'описание отеля')
  assert.equal(ok(2), true, 'отзывы гостей')
  assert.equal(ok(3), false, '«анимации нет, скучно» — не подтверждение')
  assert.equal(ok(4), false, 'ни в описании, ни в отзывах — не подтверждён')
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

await check('AI только DeepSeek: в сервере и .env.example нет Yandex AI / поиска', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const serverDir = path.join(root, 'server')
  const files = [
    ...readdirSync(serverDir).filter((f) => f.endsWith('.ts')).map((f) => path.join(serverDir, f)),
    path.join(root, '.env.example'),
  ]
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    assert.ok(!/yandex|яндекс|searchapi|llm\.api\.cloud/i.test(text), `${path.basename(f)} упоминает Yandex`)
  }
  const llm = readFileSync(path.join(serverDir, 'llm.ts'), 'utf8')
  assert.match(llm, /https:\/\/api\.deepseek\.com/)
  assert.match(llm, /deepseek-v4-flash/)
})

__setFactsDeps(null)
console.log(`check-hotel-facts: ${passed} passed`)
