import { useAssistantStore } from '@/stores/assistantStore'
import { useWebSocket } from '@/hooks/useWebSocket'

export function useAssistant() {
  const isOpen = useAssistantStore((s) => s.isOpen)
  const isConnected = useAssistantStore((s) => s.isConnected)
  const isTyping = useAssistantStore((s) => s.isTyping)
  const messages = useAssistantStore((s) => s.messages)
  const hydrated = useAssistantStore((s) => s.hydrated)
  const toggleOpen = useAssistantStore((s) => s.toggleOpen)
  const setOpen = useAssistantStore((s) => s.setOpen)
  // Connect only after storage hydrate — otherwise restore goes empty and Masha loses context.
  const { send, reset, newChat, openChat } = useWebSocket(hydrated)

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
