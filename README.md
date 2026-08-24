# Totus AI v2 (Мила)

AI tour assistant — **frontend + API** in one repo.

Подробно на русском, как всё работает: **[docs/KAK-RABOTAET-AI.md](./docs/KAK-RABOTAET-AI.md)**  
Как работает LLM (модель, промпт, tools): **[docs/KAK-RABOTAET-LLM.md](./docs/KAK-RABOTAET-LLM.md)**  
История чатов в MySQL: **[docs/KAK-ISTORIYA-MYSQL.md](./docs/KAK-ISTORIYA-MYSQL.md)**  
Как обновлять пакеты: **[docs/KAK-OBNOVIT-AI.md](./docs/KAK-OBNOVIT-AI.md)**

| Service | Local port | Production host |
|---------|------------|-----------------|
| API + WebSocket | `3011` | `https://apiv2.totus.club` |
| Next.js UI | `3012` | `https://ai.totus.club` |

## Packages

- `@tosmedia/ai-assistant` — publishable React UI (`packages/ai-assistant`)
- `server/` — Express + LLM + Level.Travel + WebSocket
- `src/app/` — thin Next.js host for `ai.totus.club`

## Quick start (local)

```bash
cp .env.example .env
# fill DEEPSEEK_API_KEY + LEVEL_TRAVEL_API_KEY
npm install
npm run build:assistant
npm run dev
```

- Front: http://localhost:3012  
- API health: http://localhost:3011/api/health  
- WS: `ws://localhost:3011/ws/assistant`

## Production env (on server)

```env
PORT=3011
CORS_ORIGINS=https://ai.totus.club,https://totus.club,https://www.totus.club

NEXT_PUBLIC_API_URL=https://apiv2.totus.club/api
NEXT_PUBLIC_WS_URL=wss://apiv2.totus.club/ws/assistant
```

```bash
npm install
npm run build
npm run start   # API :3011 + Next :3012
```

Nginx: `ai.totus.club` → `127.0.0.1:3012`, `apiv2.totus.club` → `127.0.0.1:3011` (HTTP + WebSocket upgrade for `/ws/assistant`).

## Use in kedam-WEB (later)

Publish / install the UI package:

```bash
# from this repo (GitHub Packages)
npm run publish:assistant

# in kedam-WEB
npm install @tosmedia/ai-assistant@^1.0.0
```

```tsx
import {
  AiAssistantProvider,
  AiHomePage,
  ChatWidget,
} from '@tosmedia/ai-assistant'
import '@tosmedia/ai-assistant/styles.css'

export default function AiPage() {
  return (
    <AiAssistantProvider
      apiBase="https://apiv2.totus.club/api"
      wsUrl="wss://apiv2.totus.club/ws/assistant"
      tourBasePath="/ai/tours"
      homePath="/ai"
    >
      <AiHomePage />
      <ChatWidget />
    </AiAssistantProvider>
  )
}
```

Or install from git (uses built `dist/`):

```bash
npm install "github:tosmedia/totus_ai_v2#main:packages/ai-assistant"
```

See [РАЗВЁРТЫВАНИЕ.md](./РАЗВЁРТЫВАНИЕ.md) for nginx notes.
