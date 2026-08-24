import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ChatMessage, Tour } from '@/types'
import { uid } from '@/lib/utils'

export interface ChatSession {
  id: string
  title: string
  updatedAt: number
  messages: ChatMessage[]
}

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
  hydrated: boolean
  toggleOpen: () => void
  setOpen: (open: boolean) => void
  setConnected: (connected: boolean) => void
  setTyping: (typing: boolean) => void
  setTypingStatus: (status: string | null) => void
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
  hydrateFromStorage: (payload: { chats: ChatSession[]; activeId: string } | null) => void
}

const welcome: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Здравствуйте! Я Мила, помощник «Тотус клуба» ☀️ Могу ответить на вопросы про отдых и подобрать тур со ссылкой. Спросите что угодно — или скажите, куда хотите поехать.',
  timestamp: new Date(),
}

const STORAGE_KEY = 'totus-chats-v1'

function reviveMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp ?? Date.now()) }))
}

function newChat(): ChatSession {
  return {
    id: uid('chat'),
    title: 'Новый чат',
    updatedAt: Date.now(),
    messages: [{ ...welcome, id: uid('welcome'), timestamp: new Date() }],
  }
}

function titleFrom(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'Новый чат'
  const t = firstUser.content.trim().replace(/\s+/g, ' ')
  return t.length > 42 ? `${t.slice(0, 42)}…` : t
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

async function persistNow(chats: ChatSession[], activeId: string) {
  const { isRemoteHistoryEnabled, upsertRemoteChat, setRemoteActiveChat } = await import(
    '@/lib/historyApi'
  )
  if (await isRemoteHistoryEnabled()) {
    const active = chats.find((c) => c.id === activeId) ?? chats[chats.length - 1]
    if (active) {
      await upsertRemoteChat(active)
      await setRemoteActiveChat(active.id)
    }
    return
  }
  try {
    const trimmed = chats
      .slice(-30)
      .map((c) => ({ ...c, messages: c.messages.slice(-60) }))
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ chats: trimmed, activeId }))
  } catch {
    // never break chat because of storage
  }
}

function persist(chats: ChatSession[], activeId: string) {
  if (persistTimer) clearTimeout(persistTimer)
  // Debounce so streaming tokens don't spam MySQL.
  persistTimer = setTimeout(() => {
    void persistNow(chats, activeId)
  }, 700)
}

export async function loadChatsFromStorage(): Promise<{
  chats: ChatSession[]
  activeId: string
} | null> {
  try {
    const { isRemoteHistoryEnabled, fetchRemoteChats } = await import('@/lib/historyApi')
    if (await isRemoteHistoryEnabled()) {
      const remote = await fetchRemoteChats()
      if (remote && remote.chats.length) return remote
      // Logged-in but empty server history — start fresh (no device cache).
      return null
    }
  } catch (e) {
    console.warn('[ai-history] remote load failed, falling back to local', e)
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { chats: ChatSession[]; activeId: string }
    if (!Array.isArray(parsed?.chats) || !parsed.chats.length) return null
    const chats = parsed.chats
      .slice(-30)
      .map((c) => ({ ...c, messages: reviveMessages(c.messages ?? []) }))
    const activeId = chats.some((c) => c.id === parsed.activeId)
      ? parsed.activeId
      : chats[chats.length - 1].id
    return { chats, activeId }
  } catch {
    return null
  }
}

const fresh = newChat()

export const useAssistantStore = create<AssistantState>((set, get) => ({
  isOpen: false,
  isConnected: false,
  isTyping: false,
  typingStatus: null,
  messages: fresh.messages,
  chats: [fresh],
  activeChatId: fresh.id,
  showChatList: false,
  streamingId: null,
  highlightedTours: [],
  hydrated: false,
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setConnected: (connected) => set({ isConnected: connected }),
  setTyping: (typing) => set({ isTyping: typing, ...(typing ? {} : { typingStatus: null }) }),
  setTypingStatus: (status) => set({ typingStatus: status }),
  hydrateFromStorage: (payload) => {
    if (!payload) {
      set({
        hydrated: true,
        streamingId: null,
        isTyping: false,
        typingStatus: null,
      })
      return
    }
    const active = payload.chats.find((c) => c.id === payload.activeId) ?? payload.chats[0]
    set({
      chats: payload.chats,
      activeChatId: active.id,
      messages: active.messages,
      hydrated: true,
      // Never keep mid-stream ids across a storage replace.
      streamingId: null,
      isTyping: false,
      typingStatus: null,
    })
  },
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
      const next = [{ ...welcome, id: uid('welcome'), timestamp: new Date() }]
      const chats = s.chats.map((c) =>
        c.id === s.activeChatId
          ? { ...c, messages: next, title: 'Новый чат', updatedAt: Date.now() }
          : c,
      )
      return { messages: next, chats, streamingId: null, isTyping: false, typingStatus: null }
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
        streamingId: null,
        isTyping: false,
        typingStatus: null,
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
      isTyping: false,
      typingStatus: null,
    })
    return chat.messages
  },
  deleteChat: (id) => {
    void import('@/lib/historyApi').then(({ deleteRemoteChat }) => deleteRemoteChat(id))
    set((s) => {
      const rest = s.chats.filter((c) => c.id !== id)
      if (!rest.length) {
        const chat = newChat()
        return { chats: [chat], activeChatId: chat.id, messages: chat.messages }
      }
      if (s.activeChatId !== id) return { chats: rest }
      const last = rest[rest.length - 1]
      return { chats: rest, activeChatId: last.id, messages: last.messages }
    })
  },
}))

useAssistantStore.subscribe((state, prev) => {
  if (!state.hydrated) return
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
    void persist(chats, state.activeChatId)
    return
  }
  void persist(state.chats, state.activeChatId)
})
