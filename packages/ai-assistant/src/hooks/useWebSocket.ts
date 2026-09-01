import { useCallback, useEffect, useRef } from 'react'
import { getAiConfig, getWsUrl } from '@/config'
import { useAssistantStore } from '@/stores/assistantStore'
import type { WsServerMessage } from '@/types'
import { uid } from '@/lib/utils'

export function useWebSocket(enabled = true) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualCloseRef = useRef(false)
  // Номер попытки подключения: пока ждём токен, могла начаться новая попытка.
  const connectSeqRef = useRef(0)

  // Subscribe to actions INDIVIDUALLY. Zustand action identities are stable, so
  // these selectors never change between renders. Destructuring the whole store
  // (`useAssistantStore()`) instead re-rendered this hook on every message chunk,
  // recreated the socket callbacks, and tore down / reopened the WebSocket in a
  // loop — that is the "everything keeps refreshing but no result" bug, because
  // the connection died mid-response before tours could render.
  const setConnected = useAssistantStore((s) => s.setConnected)
  const setTyping = useAssistantStore((s) => s.setTyping)
  const addMessage = useAssistantStore((s) => s.addMessage)
  const appendToMessage = useAssistantStore((s) => s.appendToMessage)
  const updateMessage = useAssistantStore((s) => s.updateMessage)
  const setStreamingId = useAssistantStore((s) => s.setStreamingId)
  const setHighlightedTours = useAssistantStore((s) => s.setHighlightedTours)
  const setTypingStatus = useAssistantStore((s) => s.setTypingStatus)

  // Keep the message handler in a ref so the connect effect never depends on it.
  const handleMessageRef = useRef<(raw: MessageEvent<string>) => void>(() => {})

  handleMessageRef.current = (raw: MessageEvent<string>) => {
    let data: WsServerMessage
    try {
      data = JSON.parse(raw.data) as WsServerMessage
    } catch {
      return
    }

    switch (data.type) {
      case 'typing':
        setTyping(true)
        break
      case 'token': {
        if (!data.content) break
        setTyping(false)
        const store = useAssistantStore.getState()
        let id = store.streamingId
        if (!id) {
          id = data.messageId ?? uid('assistant')
          addMessage({ id, role: 'assistant', content: '' })
          setStreamingId(id)
        }
        appendToMessage(id, data.content)
        break
      }
      case 'tours':
        if (data.tours?.length) {
          setHighlightedTours(data.tours)
          const store = useAssistantStore.getState()
          const id = store.streamingId
          if (!id) {
            const newId = data.messageId ?? uid('assistant')
            addMessage({
              id: newId,
              role: 'assistant',
              content: '',
              metadata: { tour_results: data.tours },
            })
            setStreamingId(newId)
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                tour_results: data.tours,
              },
            })
          }
        }
        break
      case 'rooms':
        if (data.rooms?.length && data.hotel) {
          const store = useAssistantStore.getState()
          const id = store.streamingId
          const payload = { hotel: data.hotel, rooms: data.rooms }
          if (!id) {
            const newId = data.messageId ?? uid('assistant')
            addMessage({
              id: newId,
              role: 'assistant',
              content: '',
              metadata: { room_cards: payload },
            })
            setStreamingId(newId)
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                room_cards: payload,
              },
            })
          }
        }
        break
      case 'destinations':
        if (data.destinations?.length) {
          const store = useAssistantStore.getState()
          const id = store.streamingId
          if (!id) {
            const newId = data.messageId ?? uid('assistant')
            addMessage({
              id: newId,
              role: 'assistant',
              content: '',
              metadata: { destination_cards: data.destinations },
            })
            setStreamingId(newId)
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                destination_cards: data.destinations,
              },
            })
          }
        }
        break
      case 'booking':
        if (data.booking) {
          const store = useAssistantStore.getState()
          const id = store.streamingId
          if (!id) {
            const newId = data.messageId ?? uid('assistant')
            addMessage({
              id: newId,
              role: 'assistant',
              content: '',
              metadata: { booking: data.booking },
            })
            setStreamingId(newId)
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                booking: data.booking,
              },
            })
          }
        }
        break
      case 'tool': {
        // Tool events drive the live status line in the typing indicator.
        // They must NOT create a chat message on their own — that produced an
        // empty bubble once the debug block was removed from the UI.
        if (!data.tool) break
        if (data.tool.status === 'running') {
          setTyping(true)
          setTypingStatus(friendlyStatus(data.tool.name))
        }
        const store = useAssistantStore.getState()
        const id = store.streamingId
        if (id) {
          const msg = store.messages.find((m) => m.id === id)
          const calls = [...(msg?.metadata?.tool_calls ?? [])]
          const idx = calls.findIndex((c) => c.id && c.id === data.tool!.id)
          if (idx >= 0) calls[idx] = { ...calls[idx], ...data.tool }
          else calls.push(data.tool)
          updateMessage(id, { metadata: { ...msg?.metadata, tool_calls: calls } })
        }
        break
      }
      case 'done':
        setTyping(false)
        setStreamingId(null)
        break
      case 'error':
        setTyping(false)
        setStreamingId(null)
        addMessage({
          role: 'assistant',
          content: data.error ?? 'Произошла ошибка. Попробуйте ещё раз.',
        })
        break
    }
  }

  // Single stable connect function — depends on nothing that changes per render.
  const connect = useCallback(() => {
    if (!enabled) return
    const existing = wsRef.current
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    // JWT пользователя (если сайт передал getAccessToken) уходит в handshake как
    // ?token=; гости подключаются без него. Токен берём при каждом подключении —
    // он мог обновиться после refresh.
    const attempt = ++connectSeqRef.current
    Promise.resolve()
      .then(() => getAiConfig().getAccessToken?.() ?? null)
      .catch(() => null)
      .then((token) => {
        if (manualCloseRef.current || attempt !== connectSeqRef.current) return
        const current = wsRef.current
        if (
          current &&
          (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)
        ) {
          return
        }

        const ws = new WebSocket(withToken(getWsUrl(), token))
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
          // The server session died with the old socket. If the customer already
          // has a dialogue on screen, replay it so the assistant keeps context.
          const payload = buildRestorePayload()
          if (payload.messages.length) ws.send(JSON.stringify(payload))
        }
        ws.onclose = () => {
          setConnected(false)
          // Only auto-reconnect if the close wasn't triggered by unmount/cleanup.
          if (!manualCloseRef.current) {
            reconnectRef.current = setTimeout(connect, 2000)
          }
        }
        ws.onerror = () => ws.close()
        ws.onmessage = (event) => handleMessageRef.current(event)
      })
  }, [enabled, setConnected])

  useEffect(() => {
    manualCloseRef.current = false
    connect()
    return () => {
      manualCloseRef.current = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const send = useCallback(
    (content: string) => {
      if (!content.trim()) return
      addMessage({ role: 'user', content: content.trim() })
      setTyping(true)
      const payload = JSON.stringify({ type: 'chat', content: content.trim() })
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(payload)
      } else {
        setTyping(false)
        addMessage({
          role: 'assistant',
          content:
            'Нет соединения с ассистентом. Запустите сервер (`npm run server`) и обновите страницу.',
        })
      }
    },
    [addMessage, setTyping],
  )

  const reset = useCallback(() => {
    useAssistantStore.getState().clearMessages()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reset' }))
    }
  }, [])

  /** Start a brand-new chat (fresh server context too). */
  const newChat = useCallback(() => {
    useAssistantStore.getState().startNewChat()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reset' }))
    }
  }, [])

  /** Reopen an old chat and replay its history so the assistant keeps context. */
  const openChat = useCallback((id: string) => {
    useAssistantStore.getState().switchChat(id)
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify(buildRestorePayload()))
  }, [])

  const streamingId = useAssistantStore((s) => s.streamingId)

  return { send, reset, newChat, openChat, streamingId }
}


/**
 * Restore payload for the server: visible texts PLUS hotels from card
 * metadata. Texts alone are not enough — hotel names live in
 * metadata.tour_results, so after a reconnect the model could not resolve
 * "этот отель" and asked the customer to repeat the hotel name.
 */
function buildRestorePayload() {
  const messages = useAssistantStore.getState().messages
  const history = messages
    .filter((m) => m.content.trim() && m.id !== 'welcome' && !m.id.startsWith('welcome'))
    .map((m) => ({ role: m.role, content: m.content }))
  const hotels: Array<{ id?: string; name: string }> = []
  for (const m of messages) {
    for (const t of m.metadata?.tour_results ?? []) {
      if (!t?.name) continue
      const idx = hotels.findIndex((h) => h.name === t.name)
      if (idx !== -1) hotels.splice(idx, 1) // переносим в конец: свежие последними
      hotels.push({ id: t.id, name: t.name })
    }
  }
  return { type: 'restore', messages: history.slice(-40), hotels: hotels.slice(-8) }
}

/**
 * JWT в handshake WebSocket: сервер Милы читает `?token=` (SECURITY_JWT_PLAN_RU.md,
 * волна 4). Без токена подключение гостевое — как и раньше.
 */
function withToken(url: string, token: string | null | undefined): string {
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

/** Friendly, user-facing wording for the current step. */
function friendlyStatus(toolName?: string): string {
  switch (toolName) {
    case 'search_tours':
      return 'Подбираю туры'
    case 'get_hotel_info':
      return 'Изучаю отель'
    case 'get_hotel_offers':
      return 'Ищу варианты размещения'
    case 'annotate_hotels':
      return 'Добавляю комментарии'
    case 'show_destinations':
      return 'Собираю направления'
    default:
      return 'Думаю'
  }
}
