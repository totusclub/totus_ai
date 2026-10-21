# Автовыкладка Милы (totus_ai_v2)

После слияния PR в `main` Мила сама обновляется на сервере. Разовая настройка — раздел 2.

## 1. Как работает

```
PR слит в main
  → GitHub Actions «Проверки и выкладка»: npm ci → npm run check → сборка
     красное → на сервер ничего не уходит
  → по SSH на сервер: deploy <коммит>  (ключ умеет только deploy / rollback / status)
  → /srv/totus/ai/bin/deploy.sh:
       новая папка релиза /srv/totus/ai/releases/<дата>-<коммит>
       код этого коммита (только из main) · .env → ссылка на shared/.env
       переменные из .env.example есть в shared/.env? нет → стоп, Мила не тронута
       зависимости: lock не менялся → из прошлого релиза, иначе npm ci
       сборка: только если менялось что-то кроме server/, scripts/, docs/, deploy/
       current → новый релиз · PM2 перезапускает totus-ai-api и totus-ai-web из него
       /api/health ответил новым коммитом и сайт Милы отвечает? нет → откат на прошлый релиз
```

| Где | Что |
|---|---|
| `/srv/totus/ai/current` | ссылка на работающий релиз |
| `/srv/totus/ai/releases/` | 3 последних удачных релиза + последний неудачный (`*.failed`) |
| `/srv/totus/ai/shared/.env` | **секреты Милы — теперь здесь**, а не в `/home/totus_ai_v2/.env` |
| `/srv/totus/ai/shared/deploy.env` | Telegram для сообщений о выкладке (по желанию) |
| `/srv/totus/ai/repo.git` | копия репозитория для выкладки (ключ только для чтения) |
| `/srv/totus/ai/deploy.log` | журнал выкладок |
| `/home/totus_ai_v2` | старая папка — остаётся как запасной вариант |

Проверить, что на проде: `curl -s https://apiv2.totus.club/api/health` → `commit` (номер коммита) и `build`.

Что заметят пользователи: перезапуск — пауза в несколько секунд, как и при ручном обновлении. Открытые в этот момент чаты теряют соединение, история диалога не теряется.

## 2. Разовая настройка (владелец)

### Шаг 1. Слить PR

Выкладка ещё выключена: после слияния GitHub только запускает проверки (вкладка Actions → «Проверки и выкладка»).

### Шаг 2. Подготовить сервер (Мила продолжает работать как раньше)

```bash
cd /home/totus_ai_v2
# На сервере изменены сгенерированные файлы (после npm install и сборки), из-за них git pull не пройдёт.
# Откладываем их в stash — не удаляем, можно вернуть: git stash list
git stash push -m "server-local-$(date +%F)" -- package-lock.json packages/ai-assistant/dist
git pull
bash deploy/setup-server.sh --swap      # --swap — файл подкачки 2 ГБ, если его нет
```

Скрипт:
1. Создаёт `/srv/totus/ai` и копирует `.env` в `shared/.env`.
2. Создаёт ключ сервера для чтения репозитория и выводит его.
   - Добавьте ключ в GitHub → totus_ai_v2 → Settings → **Deploy keys** → Add deploy key. Title: `totus-ai server`, галочку «Allow write access» **не ставить**.
   - Запустите скрипт ещё раз.
3. Делает копию репозитория `/srv/totus/ai/repo.git`.
4. Создаёт ключ для GitHub Actions. В `authorized_keys` он прописан так, что умеет только `deploy <коммит>`, `rollback` и `status`. Скрипт выводит, что внести в GitHub → totus_ai_v2 → Settings → **Secrets and variables → Actions**:
   - Secrets: `DEPLOY_SSH_KEY` (закрытый ключ целиком), `DEPLOY_KNOWN_HOSTS`;
   - Variables: `DEPLOY_HOST` = `109.73.206.121`.
   - После копирования закрытый ключ удаляется с сервера.

PM2 и работающую Милу скрипт не трогает.

### Шаг 3. Первая выкладка вручную (вместе с Claude)

```bash
/srv/totus/ai/bin/deploy.sh deploy <коммит из вывода setup-server.sh>
```

- Соберёт первый релиз и переведёт оба процесса PM2 на `/srv/totus/ai/current`.
- Если Мила не поднимется, скрипт сам вернёт её работу из `/home/totus_ai_v2`.
- Если после шага 2 меняли `/home/totus_ai_v2/.env`, перед выкладкой скопируйте его ещё раз: `install -m 600 /home/totus_ai_v2/.env /srv/totus/ai/shared/.env`.
- Проверка: `/srv/totus/ai/bin/deploy.sh status` и `curl -s https://apiv2.totus.club/api/health` — `commit` равен этому коммиту.

### Шаг 4. Включить автовыкладку

GitHub → Settings → Secrets and variables → Actions → Variables → `DEPLOY_ENABLED` = `true`.

Проверка связи: Actions → «Проверки и выкладка» → **Run workflow** → `status`. В логе должно быть «Сейчас на проде: …». Если GitHub не может зайти на сервер, будет ошибка соединения — тогда переходим на запасной вариант, когда сервер сам проверяет GitHub.

### Шаг 5 (по желанию). Сообщения в Telegram

В `/srv/totus/ai/shared/deploy.env` указать `TG_BOT_TOKEN` (бот от @BotFather) и `TG_CHAT_ID`. Сообщения: «✅ выложен», «↩️ откат», «❌ не удалась» с причиной. Без них результат виден у коммита в GitHub.

### Проверить настройку

В любой момент, только чтение (ничего не меняет, секреты не печатает):

```bash
bash /home/totus_ai_v2/deploy/check-server.sh 2>&1 | tee /root/totus-ai-check.txt
```

Скрипт проверяет:
- папки и `shared/.env`;
- Deploy key и доступ к GitHub, копию репозитория;
- скрипты выкладки;
- ключ Actions: он должен быть ограничен командой и отклонять посторонние команды;
- подкачку, память и диск;
- из какой папки работают процессы PM2 и каким коммитом отвечает `/api/health`;
- журнал.

По каждому ❌ / ⚠️ скрипт пишет, что сделать. Что он не видит — секреты и переменные в GitHub — перечислено в конце вывода.

## 3. Каждый день

- **Слили PR** — через 2–4 минуты Мила обновлена. Статус — у коммита в GitHub (галочка или крестик) и в Actions.
- **Новая переменная.** Добавьте её в `/srv/totus/ai/shared/.env` и в `.env.example` в PR. Если PR с новой переменной слили раньше, выкладка остановится до переключения и напишет, чего не хватает. После добавления: Actions → Run workflow → `deploy`.
- **Откатить вручную:** Actions → Run workflow → `rollback`, или на сервере `/srv/totus/ai/bin/deploy.sh rollback`.
- **Посмотреть, что на проде:** Run workflow → `status`, или `/srv/totus/ai/bin/deploy.sh status`.
- **Ручная правка на сервере больше не нужна и не сохранится.** Каждая выкладка ставит код из GitHub. Все изменения — через PR.

## 4. Вернуть всё как было (без автовыкладки)

```bash
pm2 delete totus-ai-api totus-ai-web
cd /home/totus_ai_v2 && pm2 start npm --name totus-ai-api -- run server && pm2 start npm --name totus-ai-web -- run start:web
pm2 save
```

Затем в GitHub убрать переменную `DEPLOY_ENABLED`. Если `.env` меняли в `/srv/totus/ai/shared/.env`, скопируйте его обратно в `/home/totus_ai_v2/.env`.

## 5. Без GitHub Pro

Решение владельца 21.10.2026: защиты ветки `main` нет. Любой push в `main` уходит на прод, поэтому:
- в `main` попадает только то, что владелец слил через PR;
- Claude пушит только в ветки `claude/*`;
- скрипт выкладки на сервере ставит только коммиты из `main`, даже если ключ выкладки окажется у кого-то ещё.
