import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import {
  configureAiAssistantNative,
  type AiAssistantNativeConfig,
} from '@/config'
import { loadChatsFromStorage, useAssistantStore } from '@/stores/assistantStore'
import { AiThemeProvider } from '@/theme/AiThemeContext'
import type { AiColorScheme } from '@/theme/colors'
import {
  AiNativeRuntimeProvider,
  type AiNativeRuntime,
  type OpenHotelInfo,
} from '@/runtime'

export type AiAssistantNativeProviderProps = {
  children: ReactNode
  apiBase?: string
  wsUrl?: string
  tourBasePath?: string
  siteOrigin?: string
  openUrl?: AiAssistantNativeConfig['openUrl']
  getAccessToken?: AiAssistantNativeConfig['getAccessToken']
  historyMode?: AiAssistantNativeConfig['historyMode']
  /** In-app hotel navigation — preferred over openUrl/browser. */
  onOpenHotel?: (info: OpenHotelInfo) => boolean | void
  colorScheme?: AiColorScheme
}

function applyConfig(
  props: Omit<
    AiAssistantNativeProviderProps,
    'children' | 'colorScheme' | 'onOpenHotel'
  >,
) {
  const next: Partial<AiAssistantNativeConfig> = {}
  if (props.apiBase !== undefined) next.apiBase = props.apiBase
  if (props.wsUrl !== undefined) next.wsUrl = props.wsUrl
  if (props.tourBasePath !== undefined) next.tourBasePath = props.tourBasePath
  if (props.siteOrigin !== undefined) next.siteOrigin = props.siteOrigin
  if (props.openUrl !== undefined) next.openUrl = props.openUrl
  if (props.getAccessToken !== undefined) next.getAccessToken = props.getAccessToken
  if (props.historyMode !== undefined) next.historyMode = props.historyMode
  if (Object.keys(next).length) configureAiAssistantNative(next)
}

export function AiAssistantNativeProvider({
  children,
  apiBase,
  wsUrl,
  tourBasePath,
  siteOrigin,
  openUrl,
  getAccessToken,
  historyMode,
  onOpenHotel,
  colorScheme = 'light',
}: AiAssistantNativeProviderProps) {
  applyConfig({
    apiBase,
    wsUrl,
    tourBasePath,
    siteOrigin,
    openUrl,
    getAccessToken,
    historyMode,
  })
  const hydrateFromStorage = useAssistantStore((s) => s.hydrateFromStorage)
  const [ready, setReady] = useState(() => useAssistantStore.getState().hydrated)

  useEffect(() => {
    applyConfig({
      apiBase,
      wsUrl,
      tourBasePath,
      siteOrigin,
      openUrl,
      getAccessToken,
      historyMode,
    })
  }, [apiBase, wsUrl, tourBasePath, siteOrigin, openUrl, getAccessToken, historyMode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const payload = await loadChatsFromStorage()
      if (cancelled) return
      hydrateFromStorage(payload)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [hydrateFromStorage, getAccessToken, historyMode])

  const runtime = useMemo<AiNativeRuntime>(
    () => ({ openUrl, onOpenHotel }),
    [openUrl, onOpenHotel],
  )

  return (
    <AiThemeProvider colorScheme={colorScheme}>
      <AiNativeRuntimeProvider value={runtime}>
        {/* Wait for history hydrate (MySQL or AsyncStorage) so WS restore is correct. */}
        <View style={{ flex: 1 }}>{ready ? children : null}</View>
      </AiNativeRuntimeProvider>
    </AiThemeProvider>
  )
}
