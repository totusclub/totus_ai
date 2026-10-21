/**
 * Готовые кнопки виджета без устаревших месяцев (владелец, 21.10.2026:
 * «Совет куда ехать» отправлял «…в сентябре…», сентябрь уже прошёл).
 * Run: npx tsx scripts/check-quick-prompts.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeQuickPrompt } from '../server/quickPrompts.ts'
import { buildTotusSystemPrompt } from '../server/totusPrompt.ts'

const MONTHS = /январ|феврал|март|апрел|ма[йея]\b|июн|июл|август|сентябр|октябр|ноябр|декабр/i
for (const f of ['packages/ai-assistant/src/lib/constants.ts', 'packages/ai-assistant-native/src/lib/constants.ts']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('QUICK_ACTIONS'), src.indexOf(']', src.indexOf('QUICK_ACTIONS')) + 1)
  assert.ok(block.length > 20, `${f}: нет QUICK_ACTIONS`)
  assert.ok(!MONTHS.test(block), `${f}: в готовых кнопках не должно быть месяцев`)
}
const NEW = 'Посоветуйте, куда поехать в отпуск'
for (const legacy of ['Не знаю куда поехать в сентябре с ребёнком 5 лет — что посоветуете?', 'Не знаю куда поехать с ребёнком 5 лет — что посоветуете?']) {
  assert.equal(normalizeQuickPrompt(legacy), NEW, legacy)
}
// Кнопка не придумывает данных: ни месяца, ни детей, ни возраста, ни числа людей.
for (const f of ['packages/ai-assistant/src/lib/constants.ts', 'packages/ai-assistant-native/src/lib/constants.ts']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  assert.ok(src.includes(`prompt: '${NEW}'`), `${f}: кнопка «Совет куда ехать» отправляет «${NEW}»`)
  assert.ok(!/ребён|ребен|\d+\s*лет/.test(src.slice(src.indexOf("id: 'ask'"), src.indexOf("id: 'uai'"))), f)
}
// Свой текст клиента не трогаем, даже с «в сентябре».
assert.equal(normalizeQuickPrompt('хотим в Турцию в сентябре'), 'хотим в Турцию в сентябре')
// Промпт: на «посоветуйте, куда поехать» без подробностей — сначала спросить, ничего не додумывать.
const prompt = buildTotusSystemPrompt()
assert.match(prompt, /ничего не додумывай за клиента: ни месяц, ни детей и их возраст, ни число людей, ни бюджет/)
assert.match(prompt, /направления не предлагай и сезон сам не выбирай/)
assert.ok(!/с 2–4 подходящими по сезону/.test(prompt), 'старое «по сезону» убрано')
console.log('check-quick-prompts: 5 passed')
