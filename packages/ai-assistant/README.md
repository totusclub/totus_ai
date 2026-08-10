# `@tosmedia/ai-assistant`

Embeddable Totus AI (Мила) React UI.

## Install

```bash
npm install @tosmedia/ai-assistant
# or
npm install "github:tosmedia/totus_ai_v2#main:packages/ai-assistant"
```

## Usage

```tsx
import {
  AiAssistantProvider,
  AiHomePage,
  AiTourDetailPage,
  ChatWidget,
} from '@tosmedia/ai-assistant'
import '@tosmedia/ai-assistant/styles.css'

export function AiPage() {
  return (
    <AiAssistantProvider
      apiBase="https://apiv2.totus.club/api"
      wsUrl="wss://apiv2.totus.club/ws/assistant"
      homePath="/ai"
      tourBasePath="/ai/tours"
    >
      <AiHomePage />
      <ChatWidget />
    </AiAssistantProvider>
  )
}
```

Peer deps: `react`, `react-dom`, `@tanstack/react-query`.
