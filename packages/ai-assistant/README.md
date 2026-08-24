# `@tosmedia/ai-assistant`

Embeddable Totus AI (Мила) React UI.

Как работает система целиком (на русском): **[../../docs/KAK-RABOTAET-AI.md](../../docs/KAK-RABOTAET-AI.md)**

## Install from GitHub (recommended)

Package is published to branch `pkg/ai-assistant` of this same repo.

```bash
npm install git+https://github.com/tosmedia/totus_ai_v2.git#pkg/ai-assistant
```

`package.json`:

```json
"@tosmedia/ai-assistant": "git+https://github.com/tosmedia/totus_ai_v2.git#pkg/ai-assistant"
```

Private repo: your machine/CI must have GitHub access (same as `git clone`).

### Publish a new UI version

```bash
# in totus_ai_v2 — bump version in packages/ai-assistant/package.json first
npm run publish:assistant:git
```

Then in kedam-WEB:

```bash
npm update @tosmedia/ai-assistant
# or reinstall:
npm install git+https://github.com/tosmedia/totus_ai_v2.git#pkg/ai-assistant
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
