import type { Request, Response } from 'express'
import { ensureChatSchema, getPool, isDbConfigured } from './db.js'

export type StoredChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string | number
  metadata?: Record<string, unknown>
}

export type StoredChatSession = {
  id: string
  title: string
  updatedAt: number
  messages: StoredChatMessage[]
}

function trimMessages(messages: StoredChatMessage[]): StoredChatMessage[] {
  return (Array.isArray(messages) ? messages : []).slice(-80).map((m) => ({
    id: String(m.id || ''),
    role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
    content: typeof m.content === 'string' ? m.content : '',
    timestamp: m.timestamp,
    metadata: m.metadata && typeof m.metadata === 'object' ? m.metadata : undefined,
  }))
}

function rowToSession(row: {
  id: string
  title: string
  updated_at: number | string
  messages_json: string | StoredChatMessage[]
}): StoredChatSession {
  let messages: StoredChatMessage[] = []
  try {
    const raw =
      typeof row.messages_json === 'string'
        ? JSON.parse(row.messages_json)
        : row.messages_json
    messages = Array.isArray(raw) ? raw : []
  } catch {
    messages = []
  }
  return {
    id: row.id,
    title: row.title || 'Новый чат',
    updatedAt: Number(row.updated_at) || Date.now(),
    messages: trimMessages(messages),
  }
}

export async function listUserChats(userId: number): Promise<{
  chats: StoredChatSession[]
  activeId: string
}> {
  await ensureChatSchema()
  const db = getPool()
  if (!db) throw new Error('DB not configured')

  const [rows] = await db.query(
    `SELECT id, title, updated_at, messages_json
     FROM ai_chats
     WHERE user_id = :userId
     ORDER BY updated_at DESC
     LIMIT 40`,
    { userId },
  )
  const chats = ((rows as any[]) || []).map(rowToSession)
  const [metaRows] = await db.query(
    `SELECT active_chat_id FROM ai_chat_meta WHERE user_id = :userId LIMIT 1`,
    { userId },
  )
  const activeFromMeta = (metaRows as any[])?.[0]?.active_chat_id as string | undefined
  const activeId =
    (activeFromMeta && chats.some((c) => c.id === activeFromMeta) && activeFromMeta) ||
    chats[0]?.id ||
    ''
  return { chats, activeId }
}

export async function upsertUserChat(
  userId: number,
  chat: StoredChatSession,
): Promise<StoredChatSession> {
  await ensureChatSchema()
  const db = getPool()
  if (!db) throw new Error('DB not configured')

  const id = String(chat.id || '').trim()
  if (!id) throw new Error('chat id required')

  const title = (chat.title || 'Новый чат').slice(0, 255)
  const updatedAt = Number(chat.updatedAt) || Date.now()
  const messages = trimMessages(chat.messages || [])

  // Refuse to steal another user's chat id
  const [existing] = await db.query(
    `SELECT user_id FROM ai_chats WHERE id = :id LIMIT 1`,
    { id },
  )
  if ((existing as any[])?.length && Number((existing as any[])[0].user_id) !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  await db.query(
    `INSERT INTO ai_chats (id, user_id, title, messages_json, updated_at)
     VALUES (:id, :userId, :title, CAST(:messages AS JSON), :updatedAt)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       messages_json = VALUES(messages_json),
       updated_at = VALUES(updated_at)`,
    {
      id,
      userId,
      title,
      messages: JSON.stringify(messages),
      updatedAt,
    },
  )

  await db.query(
    `INSERT INTO ai_chat_meta (user_id, active_chat_id)
     VALUES (:userId, :id)
     ON DUPLICATE KEY UPDATE active_chat_id = VALUES(active_chat_id)`,
    { userId, id },
  )

  return { id, title, updatedAt, messages }
}

export async function deleteUserChat(userId: number, chatId: string): Promise<void> {
  await ensureChatSchema()
  const db = getPool()
  if (!db) throw new Error('DB not configured')
  await db.query(`DELETE FROM ai_chats WHERE id = :id AND user_id = :userId`, {
    id: chatId,
    userId,
  })
  await db.query(
    `UPDATE ai_chat_meta SET active_chat_id = NULL
     WHERE user_id = :userId AND active_chat_id = :id`,
    { userId, id: chatId },
  )
}

export async function setActiveChat(userId: number, activeId: string): Promise<void> {
  await ensureChatSchema()
  const db = getPool()
  if (!db) throw new Error('DB not configured')
  await db.query(
    `INSERT INTO ai_chat_meta (user_id, active_chat_id)
     VALUES (:userId, :activeId)
     ON DUPLICATE KEY UPDATE active_chat_id = VALUES(active_chat_id)`,
    { userId, activeId },
  )
}

export function registerChatHistoryRoutes(
  app: import('express').Express,
  requireAuth: import('express').RequestHandler,
) {
  app.get('/api/ai-chats', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isDbConfigured()) {
        res.status(503).json({ error: 'MySQL is not configured (DB_HOST/DB_USER/DB_NAME)' })
        return
      }
      const data = await listUserChats(req.authUser!.id)
      res.json(data)
    } catch (e: any) {
      console.error('[ai-chats] list', e)
      res.status(500).json({ error: e?.message || 'Failed to list chats' })
    }
  })

  app.put('/api/ai-chats/active', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isDbConfigured()) {
        res.status(503).json({ error: 'MySQL is not configured' })
        return
      }
      const activeId = String(req.body?.activeId || '').trim()
      if (!activeId) {
        res.status(400).json({ error: 'activeId required' })
        return
      }
      await setActiveChat(req.authUser!.id, activeId)
      res.json({ ok: true, activeId })
    } catch (e: any) {
      console.error('[ai-chats] active', e)
      res.status(500).json({ error: e?.message || 'Failed to set active chat' })
    }
  })

  app.put('/api/ai-chats/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isDbConfigured()) {
        res.status(503).json({ error: 'MySQL is not configured' })
        return
      }
      const id = String(req.params.id || '').trim()
      const body = req.body || {}
      const chat: StoredChatSession = {
        id,
        title: body.title || 'Новый чат',
        updatedAt: body.updatedAt || Date.now(),
        messages: Array.isArray(body.messages) ? body.messages : [],
      }
      const saved = await upsertUserChat(req.authUser!.id, chat)
      res.json(saved)
    } catch (e: any) {
      const status = e?.status === 403 ? 403 : 500
      console.error('[ai-chats] upsert', e)
      res.status(status).json({ error: e?.message || 'Failed to save chat' })
    }
  })

  app.delete('/api/ai-chats/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isDbConfigured()) {
        res.status(503).json({ error: 'MySQL is not configured' })
        return
      }
      await deleteUserChat(req.authUser!.id, String(req.params.id || ''))
      res.json({ ok: true })
    } catch (e: any) {
      console.error('[ai-chats] delete', e)
      res.status(500).json({ error: e?.message || 'Failed to delete chat' })
    }
  })
}
