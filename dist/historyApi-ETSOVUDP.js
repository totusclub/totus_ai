import { getAiNativeConfig, getApiBase } from './chunk-ZWDNSBGU.js';

// src/lib/historyApi.ts
async function authHeaders() {
  const token = await Promise.resolve(getAiNativeConfig().getAccessToken?.() ?? null);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
async function isRemoteHistoryEnabled() {
  const cfg = getAiNativeConfig();
  if (cfg.historyMode === "local") return false;
  if (cfg.historyMode === "remote") return true;
  const token = await Promise.resolve(cfg.getAccessToken?.() ?? null);
  return Boolean(token);
}
async function fetchRemoteChats() {
  if (!await isRemoteHistoryEnabled()) return null;
  const res = await fetch(`${getApiBase()}/ai-chats`, {
    headers: {
      Accept: "application/json",
      ...await authHeaders()
    }
  });
  if (res.status === 401 || res.status === 503) return null;
  if (!res.ok) throw new Error(`ai-chats list failed: ${res.status}`);
  const data = await res.json();
  const chats = (data.chats || []).map((c) => ({
    ...c,
    messages: (c.messages || []).map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp ?? Date.now())
    }))
  }));
  return { chats, activeId: data.activeId || chats[0]?.id || "" };
}
async function upsertRemoteChat(chat) {
  if (!await isRemoteHistoryEnabled()) return;
  const payload = {
    id: chat.id,
    title: chat.title,
    updatedAt: chat.updatedAt,
    messages: chat.messages.slice(-80).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      metadata: m.metadata
    }))
  };
  const res = await fetch(`${getApiBase()}/ai-chats/${encodeURIComponent(chat.id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...await authHeaders()
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    console.warn("[ai-history] upsert failed", res.status);
  }
}
async function deleteRemoteChat(chatId) {
  if (!await isRemoteHistoryEnabled()) return;
  await fetch(`${getApiBase()}/ai-chats/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
    headers: await authHeaders()
  }).catch(() => void 0);
}
async function setRemoteActiveChat(activeId) {
  if (!await isRemoteHistoryEnabled()) return;
  await fetch(`${getApiBase()}/ai-chats/active`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...await authHeaders()
    },
    body: JSON.stringify({ activeId })
  }).catch(() => void 0);
}

export { deleteRemoteChat, fetchRemoteChats, isRemoteHistoryEnabled, setRemoteActiveChat, upsertRemoteChat };
//# sourceMappingURL=historyApi-ETSOVUDP.js.map
//# sourceMappingURL=historyApi-ETSOVUDP.js.map