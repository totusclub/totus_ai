export { AiAssistantNativeProvider } from './AiAssistantNativeProvider'
export type { AiAssistantNativeProviderProps } from './AiAssistantNativeProvider'

export {
  configureAiAssistantNative,
  getAiNativeConfig,
  getApiBase,
  getWsUrl,
  getTourHref,
} from './config'
export type { AiAssistantNativeConfig } from './config'

export { ChatWidget } from './components/ChatWidget'
export type { ChatWidgetProps } from './components/ChatWidget'
export { ChatScreen } from './components/ChatScreen'
export type { ChatScreenProps } from './components/ChatScreen'
export { ChatPanel } from './components/ChatPanel'
export type { ChatPanelProps } from './components/ChatPanel'
export { ChatMessage } from './components/ChatMessage'
export { QuickActions } from './components/QuickActions'

export { useAssistant } from './hooks/useAssistant'
export { useWebSocket } from './hooks/useWebSocket'
export { useAssistantStore, loadChatsFromStorage } from './stores/assistantStore'
export { useAiTheme } from './theme/AiThemeContext'
export type { AiColorScheme, AiColors } from './theme/colors'
export {
  useAiNativeRuntime,
  extractHotelIdFromTourId,
} from './runtime'
export type { AiNativeRuntime, OpenHotelInfo } from './runtime'

export type * from './types'
