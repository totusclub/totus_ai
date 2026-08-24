export type AiAssistantNativeConfig = {
  /** HTTP API prefix, e.g. https://apiv2.totus.club/api */
  apiBase: string
  /** WebSocket URL, e.g. wss://apiv2.totus.club/ws/assistant */
  wsUrl: string
  /** Base path for hotel/tour detail links, default /hotel-details */
  tourBasePath: string
  /**
   * Open hotel/booking links.
   * Default: Linking.openURL with siteOrigin for relative paths.
   */
  openUrl?: (url: string) => void | Promise<void>
  /**
   * Origin for absolute booking links from relative paths.
   * Example: https://totus.club
   */
  siteOrigin?: string
  /**
   * JWT access token (same as kedam/totusapp login).
   * When present, chat history is stored in MySQL via API (not AsyncStorage).
   */
  getAccessToken?: () => string | null | Promise<string | null>
  /**
   * `remote` — always use API (requires token)
   * `local` — AsyncStorage only
   * `auto` (default) — remote when token exists, else local
   */
  historyMode?: 'auto' | 'remote' | 'local'
}

let config: AiAssistantNativeConfig = {
  apiBase: 'https://apiv2.totus.club/api',
  wsUrl: 'wss://apiv2.totus.club/ws/assistant',
  tourBasePath: '/hotel-details',
  siteOrigin: 'https://totus.club',
}

export function configureAiAssistantNative(partial: Partial<AiAssistantNativeConfig>) {
  config = {
    ...config,
    ...partial,
    tourBasePath: partial.tourBasePath ?? config.tourBasePath,
  }
}

export function getAiNativeConfig(): AiAssistantNativeConfig {
  return config
}

export function getApiBase(): string {
  return config.apiBase.replace(/\/$/, '')
}

export function getWsUrl(): string {
  return config.wsUrl
}

export function getTourHref(tourId: string, room?: string): string {
  const base = `${config.tourBasePath.replace(/\/$/, '')}/${tourId}`
  if (!room) return base
  return `${base}?room_type=${encodeURIComponent(room)}`
}
