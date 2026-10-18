/**
 * «Опыт турагента» — how an experienced travel agent handles a kind of
 * request: what else to ask, what to advise, facts that matter, what our
 * operator confirms with the hotel, and the mistakes Mila made before.
 *
 * Owner, 19.10.2026: «я дал тебе вопросы, чтобы ты сделала поиск по
 * интернету и ещё больше набралась опыта именно как турагент». Built from
 * research on the owner's 500 requests (scripts/fixtures/mila-500-requests.json);
 * sources are kept in agentPlaybookData.ts for review.
 *
 * Only the 1–3 topics that match the customer's message go into the prompt —
 * the whole base would make every request slow and blur the instructions.
 */
import { PLAYBOOKS, type Playbook } from './agentPlaybookData.js'

export type { Playbook }

function norm(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е')
}

/** Trigger at the start of a word: «поезд» must not fire on «поездка» via «…поезд…» inside a word. */
function hasTrigger(text: string, trig: string): boolean {
  let i = text.indexOf(trig)
  while (i !== -1) {
    const prev = i === 0 ? '' : text[i - 1]
    if (!/[а-яa-z0-9]/.test(prev)) return true
    i = text.indexOf(trig, i + 1)
  }
  return false
}

/** How strongly a topic matches: distinct triggers found, common ones count half. */
function score(topic: Playbook, text: string): number {
  let n = 0
  for (const t of topic.triggers) {
    if (t.length >= 3 && hasTrigger(text, t)) n += topic.weak.includes(t) ? 0.5 : 1
  }
  return n
}

/**
 * Topics for this message (at most two). The latest message decides; the
 * previous one only helps a follow-up («а для неё нужна справка?»).
 */
export function selectPlaybooks(latest: string, previous = '', limit = 2): Playbook[] {
  const now = norm(latest)
  const before = norm(previous)
  const scored = PLAYBOOKS.map((p) => ({ p, now: score(p, now), s: score(p, now) + score(p, before) * 0.5 }))
    .filter((x) => x.now >= 0.5 && x.s >= 1)
    .sort((a, b) => b.s - a.s)
  if (scored.length) return scored.slice(0, limit).map((x) => x.p)
  // A short follow-up with no topic of its own («а справка нужна?») stays on
  // the topic of the previous message.
  if (now.length > 80 || !before) return []
  return PLAYBOOKS.map((p) => ({ p, s: score(p, before) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, 1)
    .map((x) => x.p)
}

/** Prompt section with the selected topics (no source links — they are for review). */
export function formatPlaybooks(list: Playbook[]): string {
  if (!list.length) return ''
  const blocks = list.map((p) => {
    const lines = [`### ${p.title}`]
    if (p.ask.length) lines.push(`Что ещё уточнить (кроме города вылета, дат и состава): ${p.ask.join('; ')}.`)
    if (p.advise.length) lines.push('Как советует опытный турагент:', ...p.advise.map((x) => `- ${x}`))
    if (p.facts.length) lines.push('Факты (говори осторожно, правила меняются):', ...p.facts.map((f) => `- ${f.text}`))
    if (p.operator.length) lines.push(`Что подтверждает наш оператор у отеля или авиакомпании: ${p.operator.join('; ')}.`)
    if (p.avoid.length) lines.push(`Чего не делать: ${p.avoid.join('; ')}.`)
    return lines.join('\n')
  })
  return [
    '## Опыт турагента по теме этого сообщения',
    'Используй как свой опыт: своими словами, коротко, только то, что относится к вопросу клиента. Не пересказывай всё подряд.',
    ...blocks,
  ].join('\n\n')
}
