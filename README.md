# Tour Assistant

AI-powered tour discovery using **real Level.Travel package search** + Kimi chat (Russian).

## Stack

- **Frontend:** React + TypeScript + Vite, Tailwind, React Query, Zustand, WebSocket chat
- **Backend:** Express + Level.Travel API (`enqueue` → `status` → `get_grouped_hotels`) + Kimi tools

No mock tour catalog — hotels come only from Level.Travel.

## Quick start

```bash
cp .env.example .env
# set MOONSHOT_API_KEY and LEVEL_TRAVEL_API_KEY
npm install
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:3010  

## Level.Travel

```bash
LEVEL_TRAVEL_API_KEY=your-raw-token   # or Token token="..."
LEVEL_TRAVEL_API_VERSION=3.7
```

Search flow: enqueue → poll status → grouped hotels (RUB prices).

## Kimi

```bash
MOONSHOT_API_KEY=sk-...
```

Tools: `search_tours`, `get_tour_details`, `check_availability`, `create_booking`.
