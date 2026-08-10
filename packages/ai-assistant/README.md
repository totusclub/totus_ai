# `@tosmedia/ai-assistant`

Embeddable Totus AI (Мила) React UI.

## Install into kedam-WEB (from this GitHub repo)

npm cannot install a monorepo *subdirectory* from git directly, so we publish a packed tarball in the same repo:

```bash
npm install https://github.com/tosmedia/totus_ai_v2/raw/main/packages/ai-assistant/release/tosmedia-ai-assistant-1.0.0.tgz
```

Or in `package.json`:

```json
"@tosmedia/ai-assistant": "https://github.com/tosmedia/totus_ai_v2/raw/main/packages/ai-assistant/release/tosmedia-ai-assistant-1.0.0.tgz"
```

After UI changes in this package:

```bash
# bump "version" in package.json first
npm run pack:release
git add release && git commit -m "release ai-assistant x.y.z" && git push
# then in kedam-WEB bump the tarball URL / version and npm install
```

Local development (optional):

```bash
npm install file:../totus_ai_v2/packages/ai-assistant
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
