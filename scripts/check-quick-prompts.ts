/**
 * Готовые кнопки виджета без устаревших месяцев (владелец, 21.10.2026:
 * «Совет куда ехать» отправлял «…в сентябре…», сентябрь уже прошёл).
 * Run: npx tsx scripts/check-quick-prompts.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeQuickPrompt } from '../server/quickPrompts.ts'

const MONTHS = /январ|феврал|март|апрел|ма[йея]\b|июн|июл|август|сентябр|октябр|ноябр|декабр/i
for (const f of ['packages/ai-assistant/src/lib/constants.ts', 'packages/ai-assistant-native/src/lib/constants.ts']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('QUICK_ACTIONS'), src.indexOf(']', src.indexOf('QUICK_ACTIONS')) + 1)
  assert.ok(block.length > 20, `${f}: нет QUICK_ACTIONS`)
  assert.ok(!MONTHS.test(block), `${f}: в готовых кнопках не должно быть месяцев`)
}
assert.equal(
  normalizeQuickPrompt('Не знаю куда поехать в сентябре с ребёнком 5 лет — что посоветуете?'),
  'Не знаю куда поехать с ребёнком 5 лет — что посоветуете?',
)
// Свой текст клиента не трогаем, даже с «в сентябре».
assert.equal(normalizeQuickPrompt('хотим в Турцию в сентябре'), 'хотим в Турцию в сентябре')
console.log('check-quick-prompts: 3 passed')
