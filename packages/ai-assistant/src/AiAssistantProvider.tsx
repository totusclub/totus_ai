'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { configureAiAssistant, type AiAssistantConfig } from '@/config'
import { cn } from '@/lib/utils'
import { useAssistantStore } from '@/stores/assistantStore'

export type AiAssistantProviderProps = {
  children: ReactNode
  /** e.g. https://apiv2.totus.club/api */
  apiBase?: string
  /** e.g. wss://apiv2.totus.club/ws/assistant */
  wsUrl?: string
  /** e.g. /tours or /ai/tours */
  tourBasePath?: string
  /** e.g. / or /ai */
  homePath?: string
  getAccessToken?: AiAssistantConfig['getAccessToken']
  historyMode?: AiAssistantConfig['historyMode']
  /**
   * `page` — полноценная AI-страница (фон + min-height).
   * `widget` — только плавающий чат на сайте-хосте (без влияния на layout).
   */
  shell?: 'page' | 'widget'
}

function applyConfig(props: Omit<AiAssistantProviderProps, 'children' | 'shell'>) {
  const next: Partial<AiAssistantConfig> = {}
  if (props.apiBase !== undefined) next.apiBase = props.apiBase
  if (props.wsUrl !== undefined) next.wsUrl = props.wsUrl
  if (props.tourBasePath !== undefined) next.tourBasePath = props.tourBasePath
  if (props.homePath !== undefined) next.homePath = props.homePath
  if (props.getAccessToken !== undefined) next.getAccessToken = props.getAccessToken
  if (props.historyMode !== undefined) next.historyMode = props.historyMode
  if (Object.keys(next).length) configureAiAssistant(next)
}

export function AiAssistantProvider({
  children,
  apiBase,
  wsUrl,
  tourBasePath,
  homePath,
  getAccessToken,
  historyMode,
  shell = 'page',
}: AiAssistantProviderProps) {
  applyConfig({ apiBase, wsUrl, tourBasePath, homePath, getAccessToken, historyMode })

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  const hydrateFromRemote = useAssistantStore((s) => s.hydrateFromRemote)

  useEffect(() => {
    applyConfig({ apiBase, wsUrl, tourBasePath, homePath, getAccessToken, historyMode })
  }, [apiBase, wsUrl, tourBasePath, homePath, getAccessToken, historyMode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { isRemoteHistoryEnabled, fetchRemoteChats } = await import('@/lib/historyApi')
        if (!(await isRemoteHistoryEnabled())) {
          hydrateFromRemote(null)
          return
        }
        const remote = await fetchRemoteChats()
        if (cancelled) return
        hydrateFromRemote(remote)
      } catch (e) {
        console.warn('[ai-history] remote hydrate failed', e)
        if (!cancelled) hydrateFromRemote(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hydrateFromRemote, getAccessToken, historyMode])

  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={cn(
          'totus-ai-root',
          shell === 'page' && 'totus-ai-root--app',
          shell === 'widget' && 'totus-ai-root--widget',
        )}
      >
        {children}
      </div>
    </QueryClientProvider>
  )
}
