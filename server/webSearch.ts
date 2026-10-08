/**
 * Web search — the last step of the hotel facts cascade (Level.Travel →
 * guest reviews → web). Only snippets are used; pages are not downloaded.
 *
 * Provider: Yandex Search API v2, synchronous mode
 *   POST https://searchapi.api.cloud.yandex.net/v2/web/search
 *   Authorization: Api-Key <key>; body → { rawData: base64(XML) }
 * Env: YANDEX_SEARCH_API_KEY, YANDEX_SEARCH_FOLDER_ID.
 * Without them web search is simply off: the cascade stops after reviews and
 * nothing is shown to the customer about it.
 */

export type WebResult = { title: string; url: string; snippet: string }

const ENDPOINT =
  process.env.YANDEX_SEARCH_URL || 'https://searchapi.api.cloud.yandex.net/v2/web/search'
const TIMEOUT_MS = 8000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const cache = new Map<string, { ts: number; results: WebResult[] }>()

type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
}>

let fetchImpl: FetchLike = (url, init) => fetch(url, init as RequestInit)

/** Tests swap the network for a fake. */
export function __setWebFetch(f: FetchLike | null) {
  fetchImpl = f ?? ((url, init) => fetch(url, init as RequestInit))
  cache.clear()
}

export function isWebSearchEnabled() {
  return Boolean(process.env.YANDEX_SEARCH_API_KEY?.trim() && process.env.YANDEX_SEARCH_FOLDER_ID?.trim())
}

export function webSearchStatus() {
  return { enabled: isWebSearchEnabled(), provider: isWebSearchEnabled() ? 'yandex' : null }
}

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Inner text of an XML fragment: <hlword> and other tags dropped. */
function textOf(xml: string) {
  return decodeEntities(xml.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

/** Parse Yandex XML response into results. Exported for tests. */
export function parseYandexXml(xml: string): WebResult[] {
  const out: WebResult[] = []
  const docs = xml.match(/<doc\b[\s\S]*?<\/doc>/g) ?? []
  for (const doc of docs) {
    const url = textOf(doc.match(/<url>([\s\S]*?)<\/url>/)?.[1] ?? '')
    const title = textOf(doc.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')
    if (!url || !title) continue
    const headline = textOf(doc.match(/<headline>([\s\S]*?)<\/headline>/)?.[1] ?? '')
    const passages = (doc.match(/<passage>([\s\S]*?)<\/passage>/g) ?? []).map(textOf).filter(Boolean)
    const snippet = (passages.length ? passages.join(' … ') : headline).slice(0, 600)
    out.push({ title, url, snippet })
  }
  return out
}

/**
 * Search the web. Never throws: any problem (no key, timeout, quota, bad
 * answer) returns an empty list, so the caller just has less to say.
 */
export async function webSearch(query: string, opts: { limit?: number } = {}): Promise<WebResult[]> {
  const q = query.trim()
  if (!q || !isWebSearchEnabled()) return []
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10)
  const key = `${limit}:${q.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.results

  const body = {
    query: { searchType: 'SEARCH_TYPE_RU', queryText: q, familyMode: 'FAMILY_MODE_MODERATE', page: '0' },
    groupSpec: { groupMode: 'GROUP_MODE_FLAT', groupsOnPage: String(limit), docsInGroup: '1' },
    maxPassages: '3',
    l10n: 'LOCALIZATION_RU',
    folderId: process.env.YANDEX_SEARCH_FOLDER_ID?.trim(),
    responseFormat: 'FORMAT_XML',
  }
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${process.env.YANDEX_SEARCH_API_KEY?.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) {
      console.warn(`[web-search] HTTP ${res.status}: ${text.slice(0, 200)}`)
      return []
    }
    const raw = (JSON.parse(text) as { rawData?: string }).rawData
    if (!raw) return []
    const xml = Buffer.from(raw, 'base64').toString('utf8')
    const err = xml.match(/<error\b[^>]*code="(\d+)"[^>]*>([\s\S]*?)<\/error>/)
    if (err && err[1] !== '15') console.warn(`[web-search] error ${err[1]}: ${textOf(err[2])}`)
    const results = parseYandexXml(xml).slice(0, limit)
    cache.set(key, { ts: Date.now(), results })
    console.log(`[web-search] "${q.slice(0, 80)}" → ${results.length}`)
    return results
  } catch (e) {
    console.warn(`[web-search] failed: ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}
