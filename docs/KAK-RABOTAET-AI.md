# Как работает Totus AI (Маша)

Подробная документация по архитектуре и потоку работы ассистента.  
**LLM / модель / tools / промпт:** [KAK-RABOTAET-LLM.md](./KAK-RABOTAET-LLM.md).  
Инструкция по обновлению UI-пакетов: см. [KAK-OBNOVIT-AI.md](./KAK-OBNOVIT-AI.md).

---

## 1. Что это такое

**Маша** — AI-помощник Totus Club: отвечает на вопросы об отдыхе и подбирает туры/отели через Level.Travel.

Один бэкенд обслуживает:

| Клиент | Пакет / место | Где видно |
|--------|---------------|-----------|
| Веб (сайт /ai, ai.totus.club) | `@tosmedia/ai-assistant` | браузер |
| Мобильное приложение | `@tosmedia/ai-assistant-native` | tab «Totus AI» в totusapp |

Оба клиента говорят с **одним и тем же** API и WebSocket:

- API: `https://apiv2.totus.club/api`
- WS: `wss://apiv2.totus.club/ws/assistant`

---

## 2. Архитектура (высокоуровнево)

```text
┌─────────────────────┐     ┌─────────────────────┐
│  Веб-чат            │     │  RN-чат (totusapp)  │
│  @tosmedia/         │     │  @tosmedia/         │
│  ai-assistant       │     │  ai-assistant-native│
└─────────┬───────────┘     └─────────┬───────────┘
          │  WebSocket + REST         │
          └────────────┬──────────────┘
                       ▼
          ┌────────────────────────┐
          │  server/ (Express)     │
          │  • /ws/assistant       │
          │  • /api/*              │
          │  • LLM (DeepSeek)      │
          │  • Level.Travel        │
          └────────────────────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │  totus.club            │
          │  /hotel-details?...    │
          │  (бронирование)        │
          └────────────────────────┘
```

**Репозиторий `totus_ai_v2`:**

| Путь | Назначение |
|------|------------|
| `server/` | API, WebSocket, промпт Маши, поиск туров |
| `packages/ai-assistant/` | веб UI-пакет |
| `packages/ai-assistant-native/` | React Native UI-пакет |
| `src/app/` | тонкий Next.js-хост для `ai.totus.club` |

**Потребители:**

| Репозиторий | Роль |
|-------------|------|
| `kedam-WEB` | сайт, страница `/ai` |
| `totusapp` | мобильное приложение |

---

## 3. Как работает диалог (шаг за шагом)

### 3.1. Подключение

1. Клиент открывает чат.
2. Создаётся WebSocket на `/ws/assistant`.
3. После `onopen` клиент может отправить **`restore`** — историю прошлого чата (текст + список отелей из карточек), чтобы сервер «вспомнил» контекст.
4. Пользователь пишет сообщение → клиент шлёт `{ type: "chat", content: "..." }`.

### 3.2. Ответ Маши

На сервере для каждого WS-соединения:

1. Сообщение добавляется в историю диалога (`llmMessages`).
2. Вызывается LLM с системным промптом (`server/totusPrompt.ts`) и набором **инструментов** (tools).
3. Пока модель думает / вызывает tools, клиенту уходят события:
   - `typing` — «печатает»
   - `tool` — статус инструмента («Подбираю туры» и т.д.)
   - `token` — куски текста ответа (стриминг)
   - `tours` / `rooms` / `destinations` / `booking` — карточки в чат
   - `done` — ответ закончен
   - `error` — ошибка

### 3.3. Инструменты (tools)

Маша **не выдумывает** отели из головы: названия и цены приходят только из tools.

| Tool | Зачем |
|------|--------|
| `search_tours` | Основной поиск туров (направление, даты, гости, питание, пляж…) |
| `annotate_hotels` | Короткие комментарии к карточкам под запрос клиента |
| `get_hotel_info` | Детали по отелю |
| `hotel_rooms_page` | Вопрос про номера: карточка отеля с кнопкой на страницу отеля на totus.club; номера Маша не подбирает (с 18.10.2026), детали номера — оператор |
| `show_destinations` | Карточки направлений/курортов |

Поток типичного подбора:

```text
Клиент: «Египет в ноябре, двое, всё включено»
    → search_tours(...)
    → annotate_hotels(...)
    → клиенту: текст + карточки отелей со ссылками
```

Поиск идёт через **Level.Travel** (`server/levelTravel.ts`): enqueue → status → hotels → ссылки `buildTotusHotelUrl`.

### 3.4. Ссылки на отель

Сервер кладёт в карточку поле `tour.link`, например:

```text
https://totus.club/hotel-details?hotel_id=...&from_city=Moscow&to_country=EG
  &start_date=2026-11-01&nights=7&adults=2&request_id=...
```

- **Веб:** клик по карточке → обычная навигация по `href` (страница hotel-details сайта).
- **Приложение:** клик → `onOpenHotel` → экран `hotelFromAi` внутри totusapp (без браузера).

В приложении listing `request_id` **не переиспользуется** для номеров: экран отеля делает **новый hotel-scoped startSearch** с теми же датами/гостями из ссылки. Иначе `/hotels-rooms` может быть пустым.

---

## 4. Протокол WebSocket (кратко)

### Клиент → сервер

| type | Смысл |
|------|--------|
| `chat` | Новое сообщение пользователя |
| `restore` | Восстановить историю после reconnect (`messages`, `hotels`) |
| `reset` | Новый чат — очистить серверную сессию |

### Сервер → клиент

| type | Смысл |
|------|--------|
| `typing` | Индикатор печати |
| `token` | Кусок текста |
| `tool` | Статус tool (`running` / готово) |
| `tours` | Карточки туров/отелей |
| `rooms` | Карточки номеров |
| `destinations` | Карточки направлений |
| `booking` | Данные бронирования (если есть) |
| `done` | Конец ответа |
| `error` | Ошибка |

Сессия LLM привязана к **WS-соединению**. После обрыва без `restore` Маша «забывает» контекст.

---

## 5. Веб-пакет `@tosmedia/ai-assistant`

### Возможности

- Чат-виджет (`ChatWidget`) и/или полноэкранные страницы (`AiHomePage`, сетка туров, деталь тура).
- История чатов в **`localStorage`** (синхронно при старте).
- Стили: CSS пакета (`styles.css`).

### Интеграция (kedam / ai.totus.club)

```tsx
import {
  AiAssistantProvider,
  AiHomePage,
  ChatWidget,
} from '@tosmedia/ai-assistant'
import '@tosmedia/ai-assistant/styles.css'

<AiAssistantProvider
  apiBase="https://apiv2.totus.club/api"
  wsUrl="wss://apiv2.totus.club/ws/assistant"
  tourBasePath="/hotel-details"   // или /ai/tours — как настроено на сайте
  homePath="/ai"
>
  <AiHomePage />
  <ChatWidget />
</AiAssistantProvider>
```

Установка из git-ветки пакета:

```bash
npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant
```

---

## 6. React Native пакет `@tosmedia/ai-assistant-native`

### Возможности

- `ChatScreen` / `ChatPanel` / `ChatWidget` (FAB).
- Тема `colorScheme: 'light' | 'dark'`.
- История в **AsyncStorage** (нужен peer `@react-native-async-storage/async-storage`).
- Колбэки `onOpenHotel` / `openUrl` для навигации внутри приложения.

### Важные детали работы (с v1.1.6)

1. **Сначала hydrate, потом чат и WS**  
   Пока история не загружена из AsyncStorage, дети Provider не рендерятся. Иначе WS успевал сделать пустой `restore`, и Маша «не находила» уже показанные отели.

2. **WS только после `hydrated`**  
   `useAssistant` включает сокет только когда store гидратирован → `restore` уходит с реальной историей.

3. **При disconnect** сбрасываются `isTyping` / `streamingId` — чат не «зависает».

### Интеграция в totusapp

```tsx
<AiAssistantNativeProvider
  apiBase="https://apiv2.totus.club/api"
  wsUrl="wss://apiv2.totus.club/ws/assistant"
  siteOrigin="https://totus.club"
  tourBasePath="/hotel-details"
  colorScheme={isDark ? 'dark' : 'light'}
  onOpenHotel={openHotelFromAiAssistantInfo}
  openUrl={openHotelFromAiAssistantUrl}
>
  {/* всё приложение */}
</AiAssistantNativeProvider>
```

Экран чата: `TotusAiChatScreen` → `<ChatScreen showBackButton onBack={...} />`.  
Отель: `aiAssistantOpenHotel.ts` → `navigation.navigate('hotelFromAi', params)`.

Установка:

```bash
npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant-native
```

Публикация maintainers:

```bash
npm run publish:assistant-native:git
```

---

## 7. Чем веб и приложение похожи и чем отличаются

| | Веб | Приложение |
|--|-----|------------|
| API / WS | один и тот же prod | один и тот же prod |
| Логика чата / tools | одинаковая на сервере | одинаковая на сервере |
| История | `localStorage` (sync) | AsyncStorage (async + hydrate gate) |
| Клик по отелю | `<a href={tour.link}>` | `onOpenHotel` → нативный Hotel |
| Доп. UI | home grid, schema, tour page | в основном только чат |
| Тема | CSS сайта / пакета | `colorScheme` light/dark |

**Почему раньше «на сайте находит, в приложении нет»:**  
часто это был не другой поиск, а **потерянный контекст** после открытия чата до загрузки истории (пустой restore). С 1.1.6 этот сценарий закрыт.

**Отдельная тема:** экран отеля в приложении vs страница hotel-details на сайте — разные клиенты поиска номеров; даты должны совпадать через query из `tour.link`.

---

## 8. Состояние на клиенте (Zustand)

Общий смысл store (web и RN почти одинаковы):

| Поле | Смысл |
|------|--------|
| `messages` | Сообщения активного чата |
| `chats` / `activeChatId` | Список диалогов |
| `isTyping` / `typingStatus` | Индикатор «Думаю / Подбираю туры» |
| `streamingId` | ID сообщения, в которое пишутся `token` |
| `hydrated` (RN) | История уже загружена из storage |
| `isConnected` | WS открыт |

Действия пользователя: `send`, `newChat` (плюс `reset` на сервере), `openChat` (switch + `restore`).

---

## 9. Локальная разработка

```bash
cd totus_ai_v2
cp .env.example .env
# DEEPSEEK_API_KEY, LEVEL_TRAVEL_API_KEY, …

npm install
npm run build:assistant          # веб-пакет
npm run build:assistant-native   # RN-пакет (если нужно)
npm run dev                      # API :3011 + Next :3012
```

| Сервис | Локально | Прод |
|--------|----------|------|
| API | `http://localhost:3011` | `https://apiv2.totus.club` |
| WS | `ws://localhost:3011/ws/assistant` | `wss://apiv2.totus.club/ws/assistant` |
| UI host | `http://localhost:3012` | `https://ai.totus.club` |

Health: `GET /api/health`.

---

## 10. Типичные проблемы и куда смотреть

| Симптом | Куда смотреть |
|---------|----------------|
| Нет ответа / «нет соединения» | WS URL, сеть, nginx upgrade для `/ws/assistant` |
| Маша «забыла» прошлый чат | RN: hydrate/restore; обрыв WS без restore |
| Карточки без цен/ссылок | Level.Travel ключ, логи `server/levelTravel.ts` |
| В app отель без номеров | `aiAssistantOpenHotel.ts` — даты/`searchParams`, не listing `request_id` |
| История не сохраняется в app | AsyncStorage установлен? версия native ≥ 1.1.6 |
| Пустой поиск при хорошем запросе | Логи LLM/tools, фильтры `search_tours`, даты |

---

## 11. Карта ключевых файлов

### Сервер

- `server/index.ts` (или entry) — Express + WS
- `server/totusPrompt.ts` — поведение Маши
- `server/llm.ts` — tools schema + вызов модели
- `server/levelTravel.ts` — поиск, URL отеля

### Веб UI

- `packages/ai-assistant/src/AiAssistantProvider.tsx`
- `packages/ai-assistant/src/hooks/useWebSocket.ts`
- `packages/ai-assistant/src/components/ChatMessage.tsx`

### RN UI

- `packages/ai-assistant-native/src/AiAssistantNativeProvider.tsx`
- `packages/ai-assistant-native/src/hooks/useWebSocket.ts`
- `packages/ai-assistant-native/src/stores/assistantStore.ts`
- `packages/ai-assistant-native/src/components/ChatScreen.tsx`

### totusapp

- `App.tsx` — `AiAssistantNativeProvider`
- `src/screens/ai/TotusAiChatScreen.tsx`
- `src/utils/aiAssistantOpenHotel.ts`
- `src/navigation/authStack.tsx` — tab AI + `hotelFromAi`

---

## 12. Краткий чеклист «как это работает одной фразой»

Пользователь пишет в чат → WebSocket → LLM с tools → Level.Travel → карточки со ссылками на totus → на вебе открывается hotel-details, в приложении — нативный экран отеля с тем же поисковым контекстом (даты/гости) → пользователь бронирует на сайте/в app-flow.

---

*Документ описывает текущую схему Totus AI v2 (Маша). При смене версий пакетов сверяйте changelog / git-ветки `pkg/ai-assistant` и `pkg/ai-assistant-native`.*
