# @tosmedia/ai-assistant-native

React Native чат-виджет «Мила» (Totus AI) — тот же API/WebSocket, что и веб-пакет `@tosmedia/ai-assistant`.

Полное описание работы системы (диалог, restore, отели, отличия от веба):  
**[../../docs/KAK-RABOTAET-AI.md](../../docs/KAK-RABOTAET-AI.md)** (раздел 6 — про этот пакет).

## Установка

```bash
npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant-native
# или
npm install git+https://github.com/tosmedia/totus_ai_v2.git#pkg/ai-assistant-native
```

Рекомендуется AsyncStorage для истории чатов:

```bash
npm install @react-native-async-storage/async-storage
```

Peers: `react`, `react-native` (≥0.73).

## Интеграция (экран в навигации)

```tsx
import { AiAssistantNativeProvider, ChatScreen } from '@tosmedia/ai-assistant-native'

// В корне App:
<AiAssistantNativeProvider apiBase="..." wsUrl="..." siteOrigin="...">
  <Navigation />
</AiAssistantNativeProvider>

// В AI tab / stack screen:
export default function AiTab() {
  return <ChatScreen />
}
```

## Theme (dark / light)

```tsx
<AiAssistantNativeProvider colorScheme={isDark ? 'dark' : 'light'} ...>
```

`ChatScreen` and `ChatWidget` both follow `colorScheme`.


## API

| Export | Описание |
|--------|----------|
| `AiAssistantNativeProvider` | Конфиг API/WS + гидратация чатов |
| `ChatWidget` | FAB + modal чат |
| `useAssistant` | `send`, `isOpen`, `messages`, … |
| `configureAiAssistantNative` | Конфиг без Provider |
| `useAssistantStore` | Zustand store |

## Публикация (maintainers)

```bash
npm run publish:assistant-native:git
```

Пушит ветку `pkg/ai-assistant-native` с собранным `dist`.
