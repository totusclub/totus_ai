# Развёртывание Totus AI v2

> **Автовыкладка (с 21.10.2026):** после настройки по `docs/AVTODEPLOY.md` Маша выкладывается сама после слияния в `main`. Секреты на сервере тогда — в `/srv/totus/ai/shared/.env`. Ниже — первоначальная установка и устройство.

## Архитектура

```
https://ai.totus.club          → Next.js UI (:3012)
https://apiv2.totus.club   → Express API + WS (:3011)
```

Браузер на `ai.totus.club` ходит в API по абсолютным URL (`NEXT_PUBLIC_*`).

## 1. Установка на сервере

```bash
git clone https://github.com/tosmedia/totus_ai_v2.git
cd totus_ai_v2
cp .env.example .env
# заполнить ключи + production NEXT_PUBLIC_* (см. ниже)
npm install
npm run build
```

## 2. `.env` для продакшена

```env
PORT=3011
CORS_ORIGINS=https://ai.totus.club,https://totus.club,https://www.totus.club

DEEPSEEK_API_KEY=...
LEVEL_TRAVEL_API_KEY=...

NEXT_PUBLIC_API_URL=https://apiv2.totus.club/api
NEXT_PUBLIC_WS_URL=wss://apiv2.totus.club/ws/assistant
```

## 3. Запуск

```bash
npm run start
# или pm2:
# pm2 start npm --name totus-ai -- start
```

Проверка:

- http://127.0.0.1:3011/api/health
- http://127.0.0.1:3012

## 4. Nginx (пример)

```nginx
# AI front
server {
  server_name ai.totus.club;
  location / {
    proxy_pass http://127.0.0.1:3012;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}

# AI API + WebSocket
server {
  server_name apiv2.totus.club;

  location / {
    proxy_pass http://127.0.0.1:3011;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /ws/assistant {
    proxy_pass http://127.0.0.1:3011;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
  }
}
```

## 5. Пакет для kedam-WEB

UI живёт в `packages/ai-assistant` (`@tosmedia/ai-assistant`).

После изменений UI:

```bash
# bump version in packages/ai-assistant/package.json
npm run build:assistant
npm run publish:assistant   # GitHub Packages (@tosmedia)
```

В kedam-WEB:

```bash
npm update @tosmedia/ai-assistant
```

Пока Packages не настроен — можно ставить из git:

```bash
npm install "github:tosmedia/totus_ai_v2#main:packages/ai-assistant"
```

## Локальная разработка

```bash
npm run dev
# front http://localhost:3012  (rewrites /api → :3011)
# api   http://localhost:3011
```
