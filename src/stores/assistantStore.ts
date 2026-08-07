import { create } from 'zustand'
import type { ChatMessage, Tour } from '@/types'
import { uid } from '@/lib/utils'

interface AssistantState {
  isOpen: boolean
  isConnected: boolean
  isTyping: boolean
  typingStatus: string | null
  messages: ChatMessage[]
  chats: ChatSession[]
  activeChatId: string
  showChatList: boolean
  streamingId: string | null
  highlightedTours: Tour[]
  showSchema: boolean
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  setConnected: (connected: boolean) => void
  setTyping: (typing: boolean) => void
  setTypingStatus: (status: string | null) => void
  setShowSchema: (show: boolean) => void
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'> & { id?: string }) => string
  appendToMessage: (id: string, chunk: string) => void
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void
  setStreamingId: (id: string | null) => void
  setHighlightedTours: (tours: Tour[]) => void
  clearMessages: () => void
  setShowChatList: (show: boolean) => void
  startNewChat: () => void
  switchChat: (id: string) => ChatMessage[]
  deleteChat: (id: string) => void
}

const welcome: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Здравствуйте! Я Мила, помощник «Тотус клуба» ☀️ Могу ответить на вопросы про отдых и подобрать тур со ссылкой. Спросите что угодно — или скажите, куда хотите поехать.',
  timestamp: new Date(),
}

/**
 * Multi-chat history, like a messenger: every session is a separate chat that
 * the customer can reopen. Stored locally in the browser — no personal data
 * leaves the device. When an old chat is reopened, its history is replayed to
 * the server so the assistant keeps the context.
 */
const STORAGE_KEY = 'totus-chats-v1'

export interface ChatSession {
  id: string
  title: string
  updatedAt: number
  messages: ChatMessage[]
}

function reviveMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp ?? Date.now()) }))
}

function loadChats(): { chats: ChatSession[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { chats: ChatSession[]; activeId: string }
      if (Array.isArray(parsed?.chats) && parsed.chats.length) {
        const chats = parsed.chats
          .slice(-30)
          .map((c) => ({ ...c, messages: reviveMessages(c.messages ?? []) }))
        const activeId = chats.some((c) => c.id === parsed.activeId)
          ? parsed.activeId
          : chats[chats.length - 1].id
        return { chats, activeId }
      }
    }
  } catch {
    // fall through to a fresh chat
  }
  const fresh = newChat()
  return { chats: [fresh], activeId: fresh.id }
}

function newChat(): ChatSession {
  return {
    id: uid('chat'),
    title: 'Новый чат',
    updatedAt: Date.now(),
    messages: [{ ...welcome, id: uid('welcome'), timestamp: new Date() }],
  }
}

function saveChats(chats: ChatSession[], activeId: string) {
  try {
    const trimmed = chats
      .slice(-30)
      .map((c) => ({ ...c, messages: c.messages.slice(-60) }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chats: trimmed, activeId }))
  } catch {
    // storage may be unavailable — never break the chat because of it
  }
}

/** Chat title = first customer question, trimmed. */
function titleFrom(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'Новый чат'
  const t = firstUser.content.trim().replace(/\s+/g, ' ')
  return t.length > 42 ? `${t.slice(0, 42)}…` : t
}

const initial = loadChats()

export const useAssistantStore = create<AssistantState>((set, get) => ({
  isOpen: false,
  isConnected: false,
  isTyping: false,
  typingStatus: null,
  messages: initial.chats.find((c) => c.id === initial.activeId)?.messages ?? [],
  chats: initial.chats,
  activeChatId: initial.activeId,
  showChatList: false,
  streamingId: null,
  highlightedTours: [],
  showSchema: false,
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setConnected: (connected) => set({ isConnected: connected }),
  setTyping: (typing) => set({ isTyping: typing, ...(typing ? {} : { typingStatus: null }) }),
  setTypingStatus: (status) => set({ typingStatus: status }),
  setShowSchema: (show) => set({ showSchema: show }),
  addMessage: (message) => {
    const id = message.id ?? uid('msg')
    set((s) => ({
      messages: [
        ...s.messages,
        {
          ...message,
          id,
          timestamp: new Date(),
        },
      ],
    }))
    return id
  },
  appendToMessage: (id, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m,
      ),
    })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  setStreamingId: (id) => set({ streamingId: id }),
  setHighlightedTours: (tours) => set({ highlightedTours: tours }),
  clearMessages: () =>
    set((s) => {
      const fresh = [{ ...welcome, id: uid('welcome'), timestamp: new Date() }]
      const chats = s.chats.map((c) =>
        c.id === s.activeChatId
          ? { ...c, messages: fresh, title: 'Новый чат', updatedAt: Date.now() }
          : c,
      )
      return { messages: fresh, chats }
    }),
  setShowChatList: (show) => set({ showChatList: show }),
  startNewChat: () =>
    set((s) => {
      const chat = newChat()
      return {
        chats: [...s.chats, chat],
        activeChatId: chat.id,
        messages: chat.messages,
        highlightedTours: [],
        showChatList: false,
      }
    }),
  switchChat: (id) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return []
    set({
      activeChatId: id,
      messages: chat.messages,
      highlightedTours: [],
      showChatList: false,
      streamingId: null,
    })
    return chat.messages
  },
  deleteChat: (id) =>
    set((s) => {
      const rest = s.chats.filter((c) => c.id !== id)
      if (!rest.length) {
        const chat = newChat()
        return { chats: [chat], activeChatId: chat.id, messages: chat.messages }
      }
      if (s.activeChatId !== id) return { chats: rest }
      const last = rest[rest.length - 1]
      return { chats: rest, activeChatId: last.id, messages: last.messages }
    }),
}))

// Keep the active chat in sync with its messages and persist everything.
useAssistantStore.subscribe((state, prev) => {
  if (state.messages === prev.messages && state.chats === prev.chats) return
  if (state.messages !== prev.messages) {
    const chats = state.chats.map((c) =>
      c.id === state.activeChatId
        ? {
            ...c,
            messages: state.messages,
            title: c.title === 'Новый чат' ? titleFrom(state.messages) : c.title,
            updatedAt: Date.now(),
          }
        : c,
    )
    useAssistantStore.setState({ chats }, false)
    saveChats(chats, state.activeChatId)
    return
  }
  saveChats(state.chats, state.activeChatId)
})
