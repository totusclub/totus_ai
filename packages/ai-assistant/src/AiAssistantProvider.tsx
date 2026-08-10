'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { configureAiAssistant, type AiAssistantConfig } from '@/config'
import { cn } from '@/lib/utils'

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
  /**
   * `page` — полноценная AI-страница (фон + min-height).
   * `widget` — только плавающий чат на сайте-хосте (без влияния на layout).
   */
  shell?: 'page' | 'widget'
}

function applyConfig(props: Omit<AiAssistantProviderProps, 'children'>) {
  const next: Partial<AiAssistantConfig> = {}
  if (props.apiBase !== undefined) next.apiBase = props.apiBase
  if (props.wsUrl !== undefined) next.wsUrl = props.wsUrl
  if (props.tourBasePath !== undefined) next.tourBasePath = props.tourBasePath
  if (props.homePath !== undefined) next.homePath = props.homePath
  if (Object.keys(next).length) configureAiAssistant(next)
}

export function AiAssistantProvider({
  children,
  apiBase,
  wsUrl,
  tourBasePath,
  homePath,
  shell = 'page',
}: AiAssistantProviderProps) {
  applyConfig({ apiBase, wsUrl, tourBasePath, homePath })

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

  useEffect(() => {
    applyConfig({ apiBase, wsUrl, tourBasePath, homePath })
  }, [apiBase, wsUrl, tourBasePath, homePath])

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
