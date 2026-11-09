export { AiAssistantProvider } from './AiAssistantProvider'
export type { AiAssistantProviderProps } from './AiAssistantProvider'

export { configureAiAssistant, getAiConfig, getApiBase, getWsUrl, getTourHref } from './config'
export type { AiAssistantConfig } from './config'

export { AiHomePage } from './components/AiHomePage'
export { AiTourDetailPage } from './components/AiTourDetailPage'
export { ChatWidget } from './components/ChatWidget'
export type { ChatWidgetProps } from './components/ChatWidget'
export { MashaFabIcon, MASHA_FAB_FRAMES, MASHA_FAB_STEP_S } from './components/MashaFabIcon'
export { ChatMessage } from './components/ChatMessage'
export { TourGrid } from './components/TourGrid'
export { TourCard } from './components/TourCard'
export { QuickActions } from './components/QuickActions'
export { SchemaVisualizer } from './components/SchemaVisualizer'

export { useAssistant } from './hooks/useAssistant'
export { useWebSocket } from './hooks/useWebSocket'
export { useAssistantStore } from './stores/assistantStore'

export type * from './types'
