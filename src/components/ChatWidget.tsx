import { useEffect, useRef, useState } from 'react'
import { MessageCircle, MessagesSquare, Plus, Send, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import { useAssistant } from '@/hooks/useAssistant'
import { useAssistantStore } from '@/stores/assistantStore'
import { ChatMessage } from '@/components/ChatMessage'
import { QuickActions } from '@/components/QuickActions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { API_BASE } from '@/lib/constants'

export function ChatWidget() {
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
    fetch(`${API_BASE}/health`)
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

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="flex h-[min(640px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border border-slate-700/80 bg-slate-900/95 shadow-[0_20px_60px_rgb(0_0_0_/_0.45),0_0_40px_rgb(6_182_212_/_0.12)] backdrop-blur-xl animate-fade-in-up">
          <header className="flex items-center justify-between border-b border-slate-700/80 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 px-4 py-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-white">
                Мила · Тотус клуб
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                {isConnected ? (
                  <>
                    <Wifi className="h-3 w-3 text-green-400" />
                    {kimiOn ? 'Онлайн · подбор туров' : 'Локальный режим'}
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3 text-amber-400" /> Переподключение…
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
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
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {showChatList && (
            <div className="max-h-64 overflow-y-auto border-b border-slate-700/80 bg-slate-900/60">
              <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Мои чаты
              </p>
              {[...chats].reverse().map((chat) => (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-800/70 ${
                    chat.id === activeChatId ? 'bg-slate-800/50 text-cyan-300' : 'text-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openChat(chat.id)}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {chat.title}
                    <span className="ml-2 text-[10px] text-slate-500">
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
                    className="shrink-0 text-slate-600 opacity-0 transition-opacity hover:text-amber-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-700/80 bg-slate-800/80 px-3 py-2.5">
                  <span className="flex items-center gap-1">
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  </span>
                  <span className="text-xs text-slate-400">{typingStatus ?? 'Думаю'}…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="space-y-2 border-t border-slate-700/80 p-3">
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
                onClick={submit}
                disabled={!draft.trim() || isTyping}
                aria-label="Отправить"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-center text-[10px] leading-snug text-slate-500">
              Агент может ошибаться — пожалуйста, перепроверяйте результат вручную.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleOpen}
        className="group flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-slate-950 shadow-[0_0_30px_rgb(6_182_212_/_0.45)] transition hover:scale-105 hover:bg-cyan-400"
        aria-label={isOpen ? 'Закрыть чат' : 'Открыть чат'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  )
}
