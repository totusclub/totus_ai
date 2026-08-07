import { useAssistantStore } from '@/stores/assistantStore'
import { useWebSocket } from '@/hooks/useWebSocket'

export function useAssistant() {
  const isOpen = useAssistantStore((s) => s.isOpen)
  const isConnected = useAssistantStore((s) => s.isConnected)
  const isTyping = useAssistantStore((s) => s.isTyping)
  const messages = useAssistantStore((s) => s.messages)
  const toggleOpen = useAssistantStore((s) => s.toggleOpen)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const { send, reset, newChat, openChat } = useWebSocket(true)

  return {
    isOpen,
    isConnected,
    isTyping,
    messages,
    toggleOpen,
    setOpen,
    send,
    reset,
    newChat,
    openChat,
  }
}
