'use client'

import {
  AiAssistantProvider,
  ChatWidget,
} from '@tosmedia/ai-assistant'

export function AppShell({ children }: { children: React.ReactNode }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL

  return (
    <AiAssistantProvider apiBase={apiBase} wsUrl={wsUrl} tourBasePath="/tours" homePath="/">
      {children}
      <ChatWidget />
    </AiAssistantProvider>
  )
}
