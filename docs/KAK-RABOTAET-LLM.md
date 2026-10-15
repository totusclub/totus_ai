# Как работает LLM (Мила) — серверная часть

Документация по модели, промпту, инструментам и циклу ответа.  
Общая архитектура чата: [KAK-RABOTAET-AI.md](./KAK-RABOTAET-AI.md).  
Обновление UI-пакетов: [KAK-OBNOVIT-AI.md](./KAK-OBNOVIT-AI.md).

---

## 1. Роль LLM в системе

LLM — «мозг» Милы. Она:

1. Читает сообщение клиента.
2. Решает: ответить текстом или вызвать **инструмент** (tool).
3. После tools формирует финальный ответ человеку.

Фактические туры, цены и названия отелей **не выдумываются** — они приходят из Level.Travel через tools в `server/llm.ts` + `server/levelTravel.ts`.

```text
Клиент (web / app)
    │  WS: { type: "chat", content }
    ▼
server/assistant.ts  →  session (история, contextNote, ltRequestId…)
    ▼
server/llm.ts → handleLlmMessage()
    │  OpenAI-compatible API (по умолчанию DeepSeek)
    │  system prompt из totusPrompt.ts
    │  tools: TOUR_TOOLS
    ▼
Level.Travel / кэш  →  карточки в WS (tours, rooms, …)
    ▼
токены ответа → клиент
```

---

## 2. Ключевые файлы

| Файл | Зачем |
|------|--------|
| `server/llm.ts` | Провайдер модели, список tools, `runTool`, `handleLlmMessage` |
| `server/totusPrompt.ts` | Системный промпт Милы (роль, правила поиска, стиль) |
| `server/assistant.ts` | Сессия WS, `seedRestoredSession` (restore после reconnect) |
| `server/levelTravel.ts` | Поиск туров, офферы, ссылки `/hotel-details` |
| `server/chatLog.ts` | Журнал диалогов / tool-вызовов |
| `server/hotelFacts.ts` | Каскад фактов об отеле: справочник Level.Travel → отзывы гостей |
| `server/humanTone.ts` | Страховка тона: ловит «система / сбой / информации нет» и переписывает ответ |
| `server/pii/` | Защита персональных данных: `detect.ts` (обнаружение и маскирование), `guard.ts` (вход, restore, запрос к DeepSeek, предупреждение), `storage.ts` (очистка сохранённого) |

---

## 3. Провайдер модели (env)

Протокол — **OpenAI Chat Completions** (tools). По умолчанию — DeepSeek.

| Переменная | По умолчанию | Смысл |
|------------|--------------|--------|
| `LLM_API_KEY` или `DEEPSEEK_API_KEY` | — | API-ключ (обязателен) |
| `LLM_BASE_URL` | `https://api.deepseek.com` | Base URL |
| `LLM_MODEL` | `deepseek-v4-flash` | Имя модели |
| `LLM_TEMPERATURE` | `0.35` | Температура |
| `LLM_THINKING` | `disabled` | Thinking mode DeepSeek (`enabled` только если нужно) |

Почему thinking **выключен** по умолчанию:

- лишние токены и задержка;
- при thinking API требует возвращать `reasoning_content` в историю — без этого follow-up после tool падал с HTTP 400.

Смена модели = только env (код уже OpenAI-compatible).

Дополнительно для промпта (из `totusPrompt.ts`):

| Переменная | Смысл |
|------------|--------|
| `TOTUS_AGENT_NAME` | Имя агента (по умолчанию «Мила») |
| `TOTUS_DEPARTURE_CITIES` | Города вылета компании |
| `TOTUS_COMPANY_PHONE` | Телефон поддержки |
| `TOTUS_PROMO_INFO` | Акции (пусто = «акций нет») |

Проверка статуса: `llmStatus()` / health API — `enabled`, `model`, `agent`.

---

## 4. Системный промпт

Строится в `buildTotusSystemPrompt()` (`server/totusPrompt.ts`).

Главные идеи:

- Сначала **ответить на вопрос**, не превращать всё в анкету.
- Конкретные отели и цены — **только из tools** текущего диалога.
- Для поиска желательны: откуда / куда / когда / кто — но при известном направлении Мила **сразу ищет**, недостающее подставляет с предупреждением.
- Списки курортов — через `show_destinations`, не текстом.
- Неподдерживаемое направление — честно сказать и предложить альтернативы.
- После `search_tours` — сразу `annotate_hotels` (короткий комментарий на карточку).

После **restore** к промпту может добавиться блок:

```text
## Контекст восстановленного диалога
…уже показывались отели… «этот отель» = последний…
```

Это `session.contextNote` из `seedRestoredSession()`.

---

## 5. Инструменты (TOUR_TOOLS)

Определены в `server/llm.ts`. Модель вызывает их с `tool_choice: 'auto'`.

| Tool | Назначение | Важно |
|------|------------|--------|
| `search_tours` | Основной поиск пакетов | Нужны destination, start_date_from, adults; результат → WS `tours` |
| `annotate_hotels` | Комментарии к уже показанным карточкам | Сразу после поиска; без цен/кодов питания в тексте |
| `get_hotel_info` | Карточка отеля из кэша/справочника | По `hotel_id` |
| `get_hotel_offers` | Номера/цены по отелю | Поиск чата устарел / пуст / нет поиска → новый поиск по одному отелю; `all_rooms=true` — долго |
| `get_hotel_reviews` | Отзывы гостей | Когда клиент спрашивает отзывы |
| `research_hotel` | Любая тема по отелю (анимация, пляж, кухня, номера…) | Каскад: описание и удобства → отзывы гостей; источник клиенту не называется |
| `show_destinations` | Красивые карточки направлений | 2–4 пункта вместо текстового списка |

Исполнение: `runTool(name, args, deps, session, ws, messageId)`.

При `search_tours` сервер обычно:

1. Резолвит город вылета / направление.
2. Ставит поиск в очередь Level.Travel, ждёт операторов.
3. Фильтрует и отбирает выдачу (**Kayak-style**: оптимум / дешевле / рейтинг — `pickKayakStyle`).
4. Шлёт клиенту `{ type: "tours", tours: [...] }`.
5. Пишет JSON-результат обратно в `session.llmMessages` как `role: tool`.

В сессии сохраняются, среди прочего:

- `ltRequestId` / операторы — для офферов;
- `lastPicks` — последние карточки (для annotate);
- `lastSearchSignature` — анти-дубль одинакового поиска в одном ходе.

---

## 5а. Персональные данные — в DeepSeek не уходят (с 12.10.2026)

Правило владельца: никакие персональные данные не передаются в DeepSeek и не хранятся в открытом виде; исключений нет.

| Точка | Где | Что происходит |
|---|---|---|
| Вход (`chat`) | `handleAssistantMessage` → `checkUserText` | Найдены данные → сообщение никуда не идёт; клиенту `pii_blocked` + предупреждение обычным ответом Милы («уберите … и отправьте ещё раз») |
| Восстановление (`restore`) | `seedRestoredSession` | Каждое сообщение и названия отелей маскируются «[скрыто: …]» |
| Запрос к DeepSeek | `callDeepSeek` → `assertNoPiiInRequest` | Единственный путь к модели. Данные в сообщении клиента → запрос не отправляется; в прошлых ответах Милы — маскируются |
| Отзывы и описания отелей | `fetchHotelReviews`, `fetchHotelInfo` | Автор отзыва не передаётся; имена, телефоны в текстах маскируются |
| История (MySQL) | `trimMessages`, `upsertUserChat` | Сообщения и название чата сохраняются маскированными |
| Журнал | `logEvent` | Текст, `summary`, `args` маскируются; при блокировке пишется только тип |

Обнаружение — `server/pii/detect.ts` (без внешних сервисов): имена (словарь имён с падежами, фамилии, отчества, латиница, инициалы, «меня зовут …»), телефоны, e-mail, адрес, паспорта, СНИЛС и ИНН (контрольные суммы), карты (Луна), счета, IBAN, дата рождения, номера документов, заказов, авто, ссылки на профили и ники, коды и пароли; против обходов — невидимые символы, похожие буквы, цифры через пробелы и словами, номер в двух сообщениях. Срабатывает на значения, а не на темы. Версия правил — `pii.rules` в `/api/health`. Уже сохранённые данные: `npm run pii:scrub` (пробный запуск), `npm run pii:scrub -- --apply`. Проверки: `scripts/check-pii.ts`, сценарии в `scripts/check-mila-flow.ts`. План и решения — `docs/PII_GUARD_PLAN_RU.md`.

## 6. Цикл одного сообщения (`handleLlmMessage`)

```text
1. Собрать system prompt (+ contextNote если restore)
2. Добавить user message в session.llmMessages
3. send(ws, { type: "typing" })
4. Цикл (макс. 8 итераций):
     a. chat.completions.create(messages, tools)
     b. если finish_reason == tool_calls:
          - положить assistant tool_calls в историю
          - для каждого tool: tool(running) → runTool → tool(done/error)
          - положить role:tool в историю
          - continue (снова вызвать модель)
     c. иначе:
          - нарезать content на token-чанки → WS
          - send(ws, { type: "done" })
          - return
5. Если > 8 шагов tools → error
```

Клиент видит:

- `typing` / `tool` (статус «Подбираю туры»…)
- `tours` / `rooms` / `destinations` (карточки)
- `token` (текст)
- `done` или `error`

---

## 7. Сессия и restore

WS-сессия живёт, пока открыт сокет. После reconnect сервер «пустой», пока клиент не пришлёт:

```json
{ "type": "restore", "messages": [...], "hotels": [...] }
```

`seedRestoredSession`:

- заполняет `llmMessages` текстом истории (до 40 сообщений);
- из `hotels` строит `contextNote` (имена + id), чтобы «этот отель» резолвился.

**Ограничение:** restore **не** восстанавливает `ltRequestId` / сырой результат поиска.  
`get_hotel_offers` после долгого reconnect может сказать, что активного поиска нет — нужен новый `search_tours`.

Новый чат на клиенте → `{ type: "reset" }` → свежая session.

---

## 8. Что видит модель vs что видит пользователь

| | Пользователь в чате | Модель (`llmMessages`) |
|--|---------------------|-------------------------|
| Текст | да | да |
| Карточки отелей | UI metadata | кратко в tool result + contextNote после restore |
| Цены на карточке | да | в tool JSON / ссылках |
| Thinking / CoT | нет (выключен) | нет |

Поэтому нельзя полагаться только на «видимый» UI: без restore модель не знает показанные отели.

---

## 9. Типичный happy-path

```text
Клиент: «Египет в ноябре, двое, всё включено»
  → search_tours(destination=Египет, dates…, adults=2, meal_types=[AI,UAI])
  → WS tours (5 карточек с pick_label)
  → annotate_hotels(...)
  → текст Милы + done

Клиент: «покажи номера у второго»
  → get_hotel_offers(hotel_id=…)
  → WS rooms / текст
```

---

## 10. Типичные сбои LLM-слоя

| Симптом | Причина / куда смотреть |
|---------|-------------------------|
| Health: LLM disabled | Нет `LLM_API_KEY` / `DEEPSEEK_API_KEY` |
| HTTP 400 после tool | Включён thinking без echo `reasoning_content` → держать `LLM_THINKING=disabled` |
| «О каком отеле речь?» после F5 | Не пришёл / пустой restore; contextNote пуст |
| «Нет активного поиска» на офферах | Restore без `ltRequestId` — нужен новый search |
| Пустая выдача | Level.Travel / фильтры / `destination_not_supported` |
| Слишком долго | `get_hotel_offers` с `all_rooms=true` (30–45 с) |
| «Слишком много шагов» | guard ≥ 8 tool-раундов в одном сообщении |

Логи: `server/chatLog.ts` (user / assistant / tool / error по session).

---

## 11. Как безопасно менять поведение Милы

| Цель | Где менять |
|------|------------|
| Тон, правила поиска, когда спрашивать | `server/totusPrompt.ts` |
| Параметры tools / описания для модели | `TOUR_TOOLS` в `server/llm.ts` |
| Логика поиска / отбор карточек | `runTool` + `levelTravel.ts` / `pickKayakStyle` |
| Модель / temperature | env `LLM_*` |
| Имя, города вылета, акции | env `TOTUS_*` |

После смены промпта/tools — перезапуск API-процесса (`npm run dev` / prod start). UI-пакеты пересобирать не нужно, если менялся только server.

---

## 12. Связь с клиентами

Веб и React Native **не содержат** своей LLM: они только шлют `chat` / `restore` / `reset` и рисуют события.  
Любое улучшение «ума» Милы делается на сервере (`llm.ts` + `totusPrompt.ts` + Level.Travel).

---

*Документ отражает текущую схему Totus AI v2 (промпт v3-assistant, DeepSeek по умолчанию).*
