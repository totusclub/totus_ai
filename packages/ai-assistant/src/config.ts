export type AiAssistantConfig = {
  /** HTTP API prefix, e.g. https://apiv2.totus.club/api or /api */
  apiBase: string
  /** WebSocket URL, e.g. wss://apiv2.totus.club/ws/assistant */
  wsUrl?: string
  /** Base path for tour detail links, default /tours */
  tourBasePath: string
  /** Home link for «Все туры», default / */
  homePath: string
  /**
   * JWT access token (same as site login).
   * When present, chat history is stored in MySQL via API (not localStorage).
   */
  getAccessToken?: () => string | null | Promise<string | null>
  /** auto (default) | remote | local */
  historyMode?: 'auto' | 'remote' | 'local'
}

const envApi =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined
const envWs =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WS_URL : undefined

let config: AiAssistantConfig = {
  apiBase: envApi || '/api',
  wsUrl: envWs,
  tourBasePath: '/tours',
  homePath: '/',
}

export function configureAiAssistant(partial: Partial<AiAssistantConfig>) {
  config = {
    ...config,
    ...partial,
    tourBasePath: partial.tourBasePath ?? config.tourBasePath,
    homePath: partial.homePath ?? config.homePath,
  }
}

export function getAiConfig(): AiAssistantConfig {
  return config
}

export function getApiBase(): string {
  return config.apiBase
}

export function getTourHref(tourId: string, room?: string): string {
  const base = `${config.tourBasePath.replace(/\/$/, '')}/${tourId}`
  if (!room) return base
  return `${base}?room=${encodeURIComponent(room)}`
}

export function getWsUrl(): string {
  if (config.wsUrl) return config.wsUrl
  if (typeof window === 'undefined') {
    return 'ws://localhost:3011/ws/assistant'
  }
  const { protocol, hostname, host } = window.location
  const wsProto = protocol === 'https:' ? 'wss' : 'ws'
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${wsProto}://localhost:3011/ws/assistant`
  }
  // Same-host fallback (nginx can route /ws on the front domain)
  return `${wsProto}://${host}/ws/assistant`
}
