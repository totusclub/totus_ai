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

/** How strongly a topic matches: number of distinct triggers found. */
function score(topic: Playbook, text: string): number {
  let n = 0
  for (const t of topic.triggers) {
    const trig = norm(t).trim()
    if (trig.length >= 3 && text.includes(trig)) n++
  }
  return n
}

/**
 * Topics for this message. The latest message weighs most; the previous one
 * keeps the topic alive in a follow-up («а для неё нужна справка?»).
 */
export function selectPlaybooks(latest: string, previous = '', limit = 3): Playbook[] {
  const now = norm(latest)
  const before = norm(previous)
  const scored = PLAYBOOKS.map((p) => ({ p, s: score(p, now) * 2 + score(p, before) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s)
  return scored.slice(0, limit).map((x) => x.p)
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
