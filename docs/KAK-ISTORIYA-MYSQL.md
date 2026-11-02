# История чатов Маши в MySQL (web + app)

По умолчанию история хранилась только на устройстве (`localStorage` / AsyncStorage).  
Теперь для **залогиненного** пользователя история сохраняется в **MySQL** через API `apiv2`.

## Что сделано

| Слой | Изменение |
|------|-----------|
| API `totus_ai_v2/server` | `GET/PUT/DELETE /api/ai-chats`, JWT auth, таблицы `ai_chats` / `ai_chat_meta` |
| RN пакет | `getAccessToken` → remote history вместо AsyncStorage |
| Web пакет | то же через `AiAssistantProvider` |
| totusapp | передаёт `accessToken` из Redux |

Гости (без токена) по-прежнему могут использовать **local** историю (`historyMode: 'auto'`).

## Env на AI API (apiv2)

В `.env` сервера `totus_ai_v2`:

```env
DB_HOST=127.0.0.1
DB_USER=...
DB_PASSWORD=...
DB_NAME=kedam   # или отдельная БД
JWT_SECRET=...  # ТОТ ЖЕ секрет, что в kedam-API (user JWT)
```

SQL вручную (если нужно): `docs/sql/ai_chats.sql`  
При старте API таблицы создаются сами (`ensureChatSchema`).

Проверка: `GET /api/health` → `db.configured: true`.

## API

Все методы требуют `Authorization: Bearer <accessToken>`.

| Method | Path | Body / ответ |
|--------|------|----------------|
| GET | `/api/ai-chats` | `{ chats, activeId }` |
| PUT | `/api/ai-chats/:id` | chat session JSON |
| PUT | `/api/ai-chats/active` | `{ activeId }` |
| DELETE | `/api/ai-chats/:id` | `{ ok: true }` |

## App (totusapp)

Уже подключено в `App.tsx`:

```tsx
getAccessToken={() => accessToken}
historyMode="auto"
```

После логина история грузится с сервера; после каждого ответа чат upsert в MySQL.

Обновите пакет:

```bash
# в totus_ai_v2
npm run publish:assistant-native:git

# в totusapp
npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant-native --legacy-peer-deps
```

## Web (kedam /ai)

```tsx
<AiAssistantProvider
  apiBase="https://apiv2.totus.club/api"
  wsUrl="wss://apiv2.totus.club/ws/assistant"
  getAccessToken={() => localStorage.getItem('accessToken') /* ваш ключ */}
  historyMode="auto"
>
```

Пересоберите/обновите `@tosmedia/ai-assistant` (`publish:assistant:git`).

## Важно

1. Без `DB_*` + `JWT_SECRET` на apiv2 remote history вернёт 503/401 — клиент уйдёт в local fallback (native) или останется на localStorage (web до успешного hydrate).
2. Один и тот же JWT user `id` → одна история на web и app.
3. WS `restore` по-прежнему из клиентского store (после hydrate из MySQL).
