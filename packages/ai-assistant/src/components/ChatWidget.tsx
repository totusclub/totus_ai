'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, MessagesSquare, Plus, Send, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import { useAssistant } from '@/hooks/useAssistant'
import { useAssistantStore } from '@/stores/assistantStore'
import { ChatMessage } from '@/components/ChatMessage'
import { QuickActions } from '@/components/QuickActions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getApiBase } from '@/config'
import { cn } from '@/lib/utils'

export type ChatWidgetProps = {
  /**
   * Если true — кнопка справа внизу открывает чат на весь экран (модалка).
   * По умолчанию false — маленький виджет (как на ai.totus.club).
   */
  fullscreenOnOpen?: boolean
}

export function ChatWidget({ fullscreenOnOpen = false }: ChatWidgetProps) {
  const { isOpen, isConnected, isTyping, messages, toggleOpen, send, newChat, openChat } =
    useAssistant()
  const chats = useAssistantStore((s) => s.chats)
  const activeChatId = useAssistantStore((s) => s.activeChatId)
  const showChatList = useAssistantStore((s) => s.showChatList)
  const setShowChatList = useAssistantStore((s) => s.setShowChatList)
  const deleteChat = useAssistantStore((s) => s.deleteChat)
  const typingStatus = useAssistantStore((s) => s.typingStatus)
  const [draft, setDraft] = useState('')
  const [kimiOn, setKimiOn] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, isOpen])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    fetch(`${getApiBase()}/health`)
      .then((r) => r.json())
      .then((data: { kimi?: { enabled?: boolean } }) => setKimiOn(Boolean(data.kimi?.enabled)))
      .catch(() => setKimiOn(false))
  }, [isConnected])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail) send(detail)
    }
    window.addEventListener('assistant:send', handler)
    return () => window.removeEventListener('assistant:send', handler)
  }, [send])

  const submit = () => {
    if (!draft.trim() || isTyping) return
    send(draft)
    setDraft('')
  }

  const panel = isOpen ? (
    <div
      className={cn(
        'flex flex-col overflow-hidden bg-paper animate-fade-in-up',
        fullscreenOnOpen
          ? 'fixed inset-0 z-50 h-full w-full rounded-none border-0'
          : 'h-[min(640px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2rem))] rounded-[20px] border border-line shadow-pop',
      )}
    >
      <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-coral to-[#ffb35c] text-base shadow-[0_4px_12px_rgb(255_90_60_/_0.35)]"
          >
            ☀️
          </span>
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-tight text-ink">
              Мила · Тотус клуб
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-ok" />
                  {kimiOn ? 'Онлайн · подбор туров' : 'Локальный режим'}
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-gold" /> Переподключение…
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowChatList(!showChatList)}
            title="Мои чаты"
          >
            <MessagesSquare className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={newChat}
            title="Новый чат"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleOpen}
            aria-label="Закрыть чат"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {showChatList && (
        <div className="max-h-64 overflow-y-auto border-b border-line bg-paper">
          <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-faint">
            Мои чаты
          </p>
          {[...chats].reverse().map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-sand ${
                chat.id === activeChatId ? 'bg-sand/80 text-coral' : 'text-ink/80'
              }`}
            >
              <button
                type="button"
                onClick={() => openChat(chat.id)}
                className="min-w-0 flex-1 truncate text-left"
              >
                {chat.title}
                <span className="ml-2 text-[10px] text-faint">
                  {new Date(chat.updatedAt).toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => deleteChat(chat.id)}
                title="Удалить чат"
                className="shrink-0 text-faint opacity-0 transition-opacity hover:text-gold group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex-1 space-y-3 overflow-y-auto px-3 py-4',
          fullscreenOnOpen && 'mx-auto w-full max-w-3xl px-4 sm:px-6',
        )}
      >
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-sand px-3 py-2.5">
              <span className="flex items-center gap-1">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-coral" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-coral" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-coral" />
              </span>
              <span className="text-xs text-subtle">{typingStatus ?? 'Думаю'}…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className={cn(
          'space-y-2 border-t border-line p-3',
          fullscreenOnOpen && 'mx-auto w-full max-w-3xl px-4 sm:px-6 sm:pb-5',
        )}
      >
        <QuickActions
          onSelect={(prompt) => {
            send(prompt)
          }}
        />
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder="Спросите совет или опишите тур…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={submit}
            disabled={!draft.trim() || isTyping}
            aria-label="Отправить"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-[10px] leading-snug text-faint">
          Агент может ошибаться — пожалуйста, перепроверяйте результат вручную.
        </p>
      </div>
    </div>
  ) : null

  const fab = (
    <button
      type="button"
      onClick={toggleOpen}
      className="group flex h-14 w-14 items-center justify-center rounded-full border-0 bg-coral text-white shadow-[0_10px_28px_rgb(255_90_60_/_0.4)] transition hover:scale-105 hover:bg-coral-deep"
      aria-label={isOpen ? 'Закрыть чат' : 'Открыть чат'}
    >
      {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
    </button>
  )

  if (fullscreenOnOpen) {
    return (
      <>
        {panel}
        <div className="fixed bottom-5 right-5 z-[60]">{fab}</div>
      </>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {panel}
      {fab}
    </div>
  )
}
