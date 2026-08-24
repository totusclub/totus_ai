# Как менять AI и пушить (пошагово)

Документация для обновления UI-пакетов и интеграции.

> **Как устроена система целиком** (диалог, WebSocket, поиск, веб vs приложение):  
> см. **[KAK-RABOTAET-AI.md](./KAK-RABOTAET-AI.md)**.

Документация для обновления UI-пакета `@tosmedia/ai-assistant` и интеграции в `kedam-WEB`.

## Два репозитория

| Репозиторий | Зачем |
|---|---|
| `totus_ai_v2` | сам AI (UI + API) |
| `kedam-WEB` | сайт, куда встроен AI на `/ai` |

UI для kedam лежит здесь:

```text
totus_ai_v2/packages/ai-assistant/
```

Установка в kedam:

```text
github:tosmedia/totus_ai_v2#pkg/ai-assistant
```

Домены:

- отдельный AI-сайт: `https://ai.totus.club`
- API: `https://apiv2.totus.club`
- AI внутри сайта kedam: `/ai`

Локальные порты:

- API: `3011`
- Next (ai.totus.club host): `3012`
- kedam-WEB: обычно `3000`

---

## Часть 1. Поменять дизайн / код AI

### 1. Открыть проект AI

```bash
cd /Users/haykmaruqyan/Desktop/TOSMEDIA/TOTUS/totus_ai_v2
```

### 2. Править файлы

Основные места:

- `packages/ai-assistant/src/components/` — чат, кнопки, страницы
- `packages/ai-assistant/src/styles.css` — стили
- `packages/ai-assistant/src/components/ui/button.tsx` — кнопки
- `packages/ai-assistant/src/components/ChatWidget.tsx` — виджет чата
- `server/` — бэкенд API (WebSocket, поиск туров)

### 3. Проверить локально (отдельный AI-сайт)

```bash
npm run build:assistant
npm run dev
```

Открыть:

- фронт: http://localhost:3012
- API: http://localhost:3011

### 4. Поднять версию пакета

```bash
cd packages/ai-assistant
npm version patch --no-git-tag-version
cd ../..
```

Пример: `1.0.4` → `1.0.5`

- `patch` — мелкий фикс (стили, баг)
- `minor` — новая функция без ломающих изменений
- `major` — ломающее изменение API пакета

### 5. Собрать пакет

```bash
npm run build:assistant
```

### 6. Опубликовать ветку для kedam

```bash
npm run publish:assistant:git
```

Что делает скрипт:

1. собирает `packages/ai-assistant`
2. кладёт `package.json` + `dist/` во временную папку
3. force-push в ветку `pkg/ai-assistant`

Именно из этой ветки kedam ставит пакет через npm/git.

### 7. Закоммитить и запушить исходники в `main`

```bash
git status
git add packages/ai-assistant
git commit -m "Описание изменения"
git push origin main
```

Важно: ветка `pkg/ai-assistant` — для install; ветка `main` — исходники всего проекта.

---

## Часть 2. Обновить AI в kedam-WEB

### 1. Открыть kedam

```bash
cd /Users/haykmaruqyan/Desktop/TOSMEDIA/TOTUS/kedam-WEB
```

### 2. Поставить новую версию пакета

```bash
npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant --legacy-peer-deps
```

Или:

```bash
npm install git+https://github.com/tosmedia/totus_ai_v2.git#pkg/ai-assistant --legacy-peer-deps
```

Проверить версию:

```bash
node -e "console.log(require('./node_modules/@tosmedia/ai-assistant/package.json').version)"
```

### 3. Проверить локально

```bash
npm run dev
```

Открыть: http://localhost:3000/ai

Сделать hard refresh: `Cmd+Shift+R` (macOS) или `Ctrl+Shift+R` (Windows/Linux).

### 4. Закоммитить и запушить kedam

```bash
git add package.json package-lock.json
git commit -m "Обновить @tosmedia/ai-assistant"
git push origin main
```

### 5. Если меняли страницы `/ai` в kedam

Файлы интеграции:

- `src/pages/ai/index.tsx` — главная AI
- `src/pages/ai/tours/[id].tsx` — карточка тура
- `src/lib/aiConfig.ts` — URL API / WebSocket
- `src/pages/_app.tsx` — скрытие Header/Footer/MobileBar на `/ai`
- `next.config.ts` — `transpilePackages: ['@tosmedia/ai-assistant']`
- `.env.local` — переменные `NEXT_PUBLIC_AI_*` (не коммитить секреты)

Пример коммита:

```bash
git add src/pages/ai src/lib/aiConfig.ts src/pages/_app.tsx next.config.ts package.json package-lock.json .npmrc
git commit -m "Обновить интеграцию AI на /ai"
git push origin main
```

### 6. Деплой kedam на сервер

После push на сервере:

```bash
git pull
npm install --legacy-peer-deps
npm run build
# перезапуск PM2 / вашего процесса
```

Точные команды зависят от вашего деплоя kedam.

---

## Часть 3. Короткий чеклист (каждый раз)

1. Правки в `totus_ai_v2/packages/ai-assistant`
2. `npm version patch --no-git-tag-version` (в папке пакета)
3. `npm run publish:assistant:git`
4. `git commit` + `git push` в `totus_ai_v2` (`main`)
5. В kedam: `npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant --legacy-peer-deps`
6. Проверка http://localhost:3000/ai + hard refresh
7. `git commit` + `git push` в `kedam-WEB`
8. Деплой kedam на сервер

---

## Часть 4. Настройка URL в kedam

Файл: `src/lib/aiConfig.ts`

Переменные в `.env.local` (опционально):

```env
NEXT_PUBLIC_AI_API_URL=https://apiv2.totus.club/api
NEXT_PUBLIC_AI_WS_URL=wss://apiv2.totus.club/ws/assistant
```

Или одной переменной:

```env
NEXT_PUBLIC_AI_SERVER_URL=https://apiv2.totus.club
```

Если переменных нет — используются дефолты `apiv2.totus.club`.

---

## Важно / частые ошибки

1. **Нельзя** ставить пакет только из `main` как npm-package root — для install нужна ветка `pkg/ai-assistant`.
2. В kedam всегда используйте `--legacy-peer-deps` (из‑за peer dependency конфликтов React).
3. После обновления пакета делайте hard refresh — иначе браузер/Next может держать старый CSS.
4. На `/ai` Header/Footer/MobileBottomBar должны быть скрыты в `_app.tsx` (`isAiRoute`).
5. Стили пакета специально без полного Tailwind preflight, чтобы не ломать сайт kedam. Не добавляйте глобальный `@import "tailwindcss"` с preflight в пакет без необходимости.
6. `npm run publish:assistant:git` делает **force-push** только в ветку `pkg/ai-assistant`, не в `main`.

---

## Быстрые команды (копипаст)

### Из totus_ai_v2

```bash
cd /Users/haykmaruqyan/Desktop/TOSMEDIA/TOTUS/totus_ai_v2
cd packages/ai-assistant && npm version patch --no-git-tag-version && cd ../..
npm run publish:assistant:git
git add packages/ai-assistant
git commit -m "Update ai-assistant"
git push origin main
```

### Из kedam-WEB

```bash
cd /Users/haykmaruqyan/Desktop/TOSMEDIA/TOTUS/kedam-WEB
npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant --legacy-peer-deps
git add package.json package-lock.json
git commit -m "Bump @tosmedia/ai-assistant"
git push origin main
```

---

## React Native пакет

Пакет: `@tosmedia/ai-assistant-native`  
Код: `packages/ai-assistant-native/`  
Ветка установки: `pkg/ai-assistant-native`  
Тот же API/WS (`apiv2.totus.club`).

### Публикация

```bash
cd packages/ai-assistant-native && npm version patch --no-git-tag-version && cd ../..
npm run publish:assistant-native:git
```

### Установка в RN-проекте

```bash
npm install github:tosmedia/totus_ai_v2#pkg/ai-assistant-native
npm install @react-native-async-storage/async-storage
```

```tsx
import { AiAssistantNativeProvider, ChatWidget } from '@tosmedia/ai-assistant-native'

<AiAssistantNativeProvider
  apiBase="https://apiv2.totus.club/api"
  wsUrl="wss://apiv2.totus.club/ws/assistant"
  siteOrigin="https://totus.club"
>
  <ChatWidget />
</AiAssistantNativeProvider>
```
