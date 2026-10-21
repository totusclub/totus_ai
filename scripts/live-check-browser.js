// Живая проверка Милы на проде — запускается после КАЖДОЙ правки / выкладки
// (правило владельца 21.10.2026) через Groover: профиль totus-qa (тестовый аккаунт),
// вкладка https://totus.club, инструмент browse_evaluate с содержимым этого файла.
// Без реальных личных данных: тестовый чат «QA live check» создаётся и сразу удаляется.
//
// Проверяет:
//   1. /api/health — ok, модель, Level.Travel, база; какой коммит на проде
//   2. вход: токен тестового аккаунта принимается (/api/ai-chats → 200, не 401)
//   3. «Мои чаты»: тестовый чат сохраняется, виден в списке, удаляется
//   4. Мила отвечает живым текстом через WebSocket (как виджет), без технической ошибки
//   5. старая кнопка «Совет куда ехать» (с «в сентябре») — ответ без сентября
// Итог: { ok: true|false, checks: [...] } — ok:false = что-то сломано, чинить до всего остального.
(async () => {
  const API = 'https://apiv2.totus.club/api'
  const WS = 'wss://apiv2.totus.club/ws/assistant'
  const token = localStorage.getItem('auth_token') || ''
  const checks = []
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail })
  const auth = { Authorization: 'Bearer ' + token, Accept: 'application/json' }

  // 1. Здоровье
  try {
    const h = await fetch(API + '/health').then((r) => r.json())
    add('health', h.ok && h.llm?.enabled && h.levelTravel?.enabled && h.db?.configured, { build: h.build, commit: h.commit })
  } catch (e) {
    add('health', false, String(e))
  }

  // 2. Вход
  add('есть токен тестового аккаунта', !!token, token ? 'ok' : 'войдите в профиле totus-qa')
  const list = await fetch(API + '/ai-chats', { headers: auth })
  const listBody = await list.text()
  add('токен принимается (/api/ai-chats)', list.status === 200, list.status === 200 ? 200 : `${list.status} ${listBody.slice(0, 120)}`)

  // 3. Сохранение чата
  if (list.status === 200) {
    const id = 'qa-live-' + Date.now()
    const chat = { id, title: 'QA live check', updatedAt: Date.now(), messages: [{ id: id + '-1', role: 'user', content: 'Проверка сохранения чата', timestamp: new Date().toISOString() }] }
    const put = await fetch(API + '/ai-chats/' + encodeURIComponent(id), { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(chat) })
    const after = await fetch(API + '/ai-chats', { headers: auth }).then((r) => r.json()).catch(() => ({}))
    const all = after.chats || after.sessions || []
    add('чат сохраняется и виден в «Мои чаты»', put.ok && all.some((c) => c.id === id), { put: put.status, chats: all.length })
    const del = await fetch(API + '/ai-chats/' + encodeURIComponent(id), { method: 'DELETE', headers: auth })
    const after2 = await fetch(API + '/ai-chats', { headers: auth }).then((r) => r.json()).catch(() => ({}))
    add('тестовый чат удалён', del.ok && !(after2.chats || after2.sessions || []).some((c) => c.id === id), del.status)
  }

  // 4–5. Ответ Милы
  const ask = (text) =>
    new Promise((resolve) => {
      const ws = new WebSocket(WS + '?token=' + encodeURIComponent(token))
      let reply = ''
      const events = []
      const done = (r) => { try { ws.close() } catch {} ; resolve(r) }
      const timer = setTimeout(() => done({ reply, events: [...events, 'TIMEOUT'] }), 120000)
      ws.onopen = () => ws.send(JSON.stringify({ type: 'chat', content: text }))
      ws.onerror = () => { clearTimeout(timer); done({ reply, events: [...events, 'ws error'] }) }
      ws.onmessage = (ev) => {
        let d
        try { d = JSON.parse(ev.data) } catch { return }
        if (d.type === 'token') reply += d.content || ''
        else if (d.type !== 'typing' && d.type !== 'tool') events.push(d.type)
        if (d.type === 'done' || d.type === 'error') { clearTimeout(timer); done({ reply, events }) }
      }
    })
  const hi = await ask('Привет! Хочу в отпуск, с чего начнём?')
  add('Мила отвечает', hi.reply.length > 20 && !hi.events.includes('error') && !hi.events.includes('TIMEOUT'), { reply: hi.reply.slice(0, 200), events: hi.events })
  const sept = await ask('Не знаю куда поехать в сентябре с ребёнком 5 лет — что посоветуете?')
  add('старая кнопка «Совет куда ехать» — без сентября', sept.reply.length > 20 && !/сентябр/i.test(sept.reply), sept.reply.slice(0, 200))

  return { ok: checks.every((c) => c.ok), at: new Date().toISOString(), checks }
})()
