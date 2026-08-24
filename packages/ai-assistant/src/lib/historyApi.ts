import { getApiBase, getAiConfig } from '@/config'
import type { ChatSession } from '@/stores/assistantStore'

async function authHeaders(): Promise<HeadersInit> {
  const token = await Promise.resolve(getAiConfig().getAccessToken?.() ?? null)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export async function isRemoteHistoryEnabled(): Promise<boolean> {
  const cfg = getAiConfig()
  if (cfg.historyMode === 'local') return false
  if (cfg.historyMode === 'remote') return true
  const token = await Promise.resolve(cfg.getAccessToken?.() ?? null)
  return Boolean(token)
}

export async function fetchRemoteChats(): Promise<{
  chats: ChatSession[]
  activeId: string
} | null> {
  if (!(await isRemoteHistoryEnabled())) return null
  const res = await fetch(`${getApiBase().replace(/\/$/, '')}/ai-chats`, {
    headers: {
      Accept: 'application/json',
      ...(await authHeaders()),
    },
  })
  if (res.status === 401 || res.status === 503) return null
  if (!res.ok) throw new Error(`ai-chats list failed: ${res.status}`)
  const data = (await res.json()) as { chats?: ChatSession[]; activeId?: string }
  const chats = (data.chats || []).map((c) => ({
    ...c,
    messages: (c.messages || []).map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp ?? Date.now()),
    })),
  }))
  return { chats, activeId: data.activeId || chats[0]?.id || '' }
}

export async function upsertRemoteChat(chat: ChatSession): Promise<void> {
  if (!(await isRemoteHistoryEnabled())) return
  const payload = {
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt,
    messages: chat.messages.slice(-80).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      metadata: m.metadata,
    })),
  }
  const res = await fetch(
    `${getApiBase().replace(/\/$/, '')}/ai-chats/${encodeURIComponent(chat.id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) console.warn('[ai-history] upsert failed', res.status)
}

export async function deleteRemoteChat(chatId: string): Promise<void> {
  if (!(await isRemoteHistoryEnabled())) return
  await fetch(`${getApiBase().replace(/\/$/, '')}/ai-chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  }).catch(() => undefined)
}

export async function setRemoteActiveChat(activeId: string): Promise<void> {
  if (!(await isRemoteHistoryEnabled())) return
  await fetch(`${getApiBase().replace(/\/$/, '')}/ai-chats/active`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({ activeId }),
  }).catch(() => undefined)
}
