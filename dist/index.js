import { getAiNativeConfig, getWsUrl, getApiBase, configureAiAssistantNative, getTourHref } from './chunk-ZWDNSBGU.js';
export { configureAiAssistantNative, getAiNativeConfig, getApiBase, getTourHref, getWsUrl } from './chunk-ZWDNSBGU.js';
import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, Pressable, Image, StyleSheet, KeyboardAvoidingView, FlatList, TextInput, Platform, Modal, Linking } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

// src/lib/utils.ts
function formatPrice(price, currency = "USD") {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(price);
  } catch {
    return `${Math.round(price)} ${currency}`;
  }
}
function formatNightsRu(nights) {
  const n = Math.abs(Math.trunc(nights));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} \u043D\u043E\u0447\u044C`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} \u043D\u043E\u0447\u0438`;
  return `${n} \u043D\u043E\u0447\u0435\u0439`;
}
function formatDurationLabel(duration, durationHours) {
  const m = duration.match(/(\d+)\s*nights?/i);
  if (m) return formatNightsRu(Number(m[1]));
  if (durationHours && durationHours >= 24) {
    return formatNightsRu(Math.round(durationHours / 24));
  }
  return duration;
}
function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// src/stores/assistantStore.ts
var welcome = {
  id: "welcome",
  role: "assistant",
  content: "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u042F \u041C\u0438\u043B\u0430, \u043F\u043E\u043C\u043E\u0449\u043D\u0438\u043A \xAB\u0422\u043E\u0442\u0443\u0441 \u043A\u043B\u0443\u0431\u0430\xBB \u2600\uFE0F \u041C\u043E\u0433\u0443 \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u043F\u0440\u043E \u043E\u0442\u0434\u044B\u0445 \u0438 \u043F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C \u0442\u0443\u0440 \u0441\u043E \u0441\u0441\u044B\u043B\u043A\u043E\u0439. \u0421\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u0447\u0442\u043E \u0443\u0433\u043E\u0434\u043D\u043E \u2014 \u0438\u043B\u0438 \u0441\u043A\u0430\u0436\u0438\u0442\u0435, \u043A\u0443\u0434\u0430 \u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u043E\u0435\u0445\u0430\u0442\u044C.",
  timestamp: /* @__PURE__ */ new Date()
};
var STORAGE_KEY = "totus-chats-v1";
function reviveMessages(messages) {
  return messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp ?? Date.now()) }));
}
function newChat() {
  return {
    id: uid("chat"),
    title: "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442",
    updatedAt: Date.now(),
    messages: [{ ...welcome, id: uid("welcome"), timestamp: /* @__PURE__ */ new Date() }]
  };
}
function titleFrom(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 42)}\u2026` : t;
}
var persistTimer = null;
async function persistNow(chats, activeId) {
  const { isRemoteHistoryEnabled, upsertRemoteChat, setRemoteActiveChat } = await import('./historyApi-ETSOVUDP.js');
  if (await isRemoteHistoryEnabled()) {
    const active = chats.find((c) => c.id === activeId) ?? chats[chats.length - 1];
    if (active) {
      await upsertRemoteChat(active);
      await setRemoteActiveChat(active.id);
    }
    return;
  }
  try {
    const trimmed = chats.slice(-30).map((c) => ({ ...c, messages: c.messages.slice(-60) }));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ chats: trimmed, activeId }));
  } catch {
  }
}
function persist(chats, activeId) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistNow(chats, activeId);
  }, 700);
}
async function loadChatsFromStorage() {
  try {
    const { isRemoteHistoryEnabled, fetchRemoteChats } = await import('./historyApi-ETSOVUDP.js');
    if (await isRemoteHistoryEnabled()) {
      const remote = await fetchRemoteChats();
      if (remote && remote.chats.length) return remote;
      return null;
    }
  } catch (e) {
    console.warn("[ai-history] remote load failed, falling back to local", e);
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.chats) || !parsed.chats.length) return null;
    const chats = parsed.chats.slice(-30).map((c) => ({ ...c, messages: reviveMessages(c.messages ?? []) }));
    const activeId = chats.some((c) => c.id === parsed.activeId) ? parsed.activeId : chats[chats.length - 1].id;
    return { chats, activeId };
  } catch {
    return null;
  }
}
var fresh = newChat();
var useAssistantStore = create((set, get) => ({
  isOpen: false,
  isConnected: false,
  isTyping: false,
  typingStatus: null,
  messages: fresh.messages,
  chats: [fresh],
  activeChatId: fresh.id,
  showChatList: false,
  streamingId: null,
  highlightedTours: [],
  hydrated: false,
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setConnected: (connected) => set({ isConnected: connected }),
  setTyping: (typing) => set({ isTyping: typing, ...typing ? {} : { typingStatus: null } }),
  setTypingStatus: (status) => set({ typingStatus: status }),
  hydrateFromStorage: (payload) => {
    if (!payload) {
      set({
        hydrated: true,
        streamingId: null,
        isTyping: false,
        typingStatus: null
      });
      return;
    }
    const active = payload.chats.find((c) => c.id === payload.activeId) ?? payload.chats[0];
    set({
      chats: payload.chats,
      activeChatId: active.id,
      messages: active.messages,
      hydrated: true,
      // Never keep mid-stream ids across a storage replace.
      streamingId: null,
      isTyping: false,
      typingStatus: null
    });
  },
  addMessage: (message) => {
    const id = message.id ?? uid("msg");
    set((s) => ({
      messages: [
        ...s.messages,
        {
          ...message,
          id,
          timestamp: /* @__PURE__ */ new Date()
        }
      ]
    }));
    return id;
  },
  appendToMessage: (id, chunk) => set((s) => ({
    messages: s.messages.map(
      (m) => m.id === id ? { ...m, content: m.content + chunk } : m
    )
  })),
  updateMessage: (id, patch) => set((s) => ({
    messages: s.messages.map((m) => m.id === id ? { ...m, ...patch } : m)
  })),
  setStreamingId: (id) => set({ streamingId: id }),
  setHighlightedTours: (tours) => set({ highlightedTours: tours }),
  clearMessages: () => set((s) => {
    const next = [{ ...welcome, id: uid("welcome"), timestamp: /* @__PURE__ */ new Date() }];
    const chats = s.chats.map(
      (c) => c.id === s.activeChatId ? { ...c, messages: next, title: "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442", updatedAt: Date.now() } : c
    );
    return { messages: next, chats, streamingId: null, isTyping: false, typingStatus: null };
  }),
  setShowChatList: (show) => set({ showChatList: show }),
  startNewChat: () => set((s) => {
    const chat = newChat();
    return {
      chats: [...s.chats, chat],
      activeChatId: chat.id,
      messages: chat.messages,
      highlightedTours: [],
      showChatList: false,
      streamingId: null,
      isTyping: false,
      typingStatus: null
    };
  }),
  switchChat: (id) => {
    const chat = get().chats.find((c) => c.id === id);
    if (!chat) return [];
    set({
      activeChatId: id,
      messages: chat.messages,
      highlightedTours: [],
      showChatList: false,
      streamingId: null,
      isTyping: false,
      typingStatus: null
    });
    return chat.messages;
  },
  deleteChat: (id) => {
    void import('./historyApi-ETSOVUDP.js').then(({ deleteRemoteChat }) => deleteRemoteChat(id));
    set((s) => {
      const rest = s.chats.filter((c) => c.id !== id);
      if (!rest.length) {
        const chat = newChat();
        return { chats: [chat], activeChatId: chat.id, messages: chat.messages };
      }
      if (s.activeChatId !== id) return { chats: rest };
      const last = rest[rest.length - 1];
      return { chats: rest, activeChatId: last.id, messages: last.messages };
    });
  }
}));
useAssistantStore.subscribe((state, prev) => {
  if (!state.hydrated) return;
  if (state.messages === prev.messages && state.chats === prev.chats) return;
  if (state.messages !== prev.messages) {
    const chats = state.chats.map(
      (c) => c.id === state.activeChatId ? {
        ...c,
        messages: state.messages,
        title: c.title === "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442" ? titleFrom(state.messages) : c.title,
        updatedAt: Date.now()
      } : c
    );
    useAssistantStore.setState({ chats }, false);
    void persist(chats, state.activeChatId);
    return;
  }
  void persist(state.chats, state.activeChatId);
});

// src/theme/colors.ts
var lightColors = {
  paper: "#ffffff",
  page: "#f5f6f8",
  sand: "#f3f5f7",
  ink: "#1f1f1f",
  subtle: "#6b7280",
  faint: "#9ca3af",
  line: "#e6e8eb",
  coral: "#fe732e",
  coralDeep: "#ea5f1a",
  sea: "#35a8e0",
  seaSoft: "#e8f4fc",
  gold: "#f0a92c",
  ok: "#16a34a",
  white: "#ffffff",
  userBubble: "#1f1f1f",
  userBubbleText: "#ffffff",
  overlay: "rgba(31,31,31,0.35)"
};
var darkColors = {
  paper: "#121212",
  page: "#1a1a1a",
  sand: "#242424",
  ink: "#f5f5f5",
  subtle: "#b0b0b0",
  faint: "#808080",
  line: "#3a3a3a",
  coral: "#fe732e",
  coralDeep: "#ea5f1a",
  sea: "#4db8e8",
  seaSoft: "#1a2f3a",
  gold: "#f0a92c",
  ok: "#22c55e",
  white: "#ffffff",
  userBubble: "#fe732e",
  userBubbleText: "#ffffff",
  overlay: "rgba(0,0,0,0.45)"
};
function getAiColors(scheme) {
  return scheme === "dark" ? darkColors : lightColors;
}
var AiThemeContext = createContext({
  colorScheme: "light",
  colors: lightColors,
  isDark: false
});
function AiThemeProvider({
  colorScheme = "light",
  children
}) {
  const value = useMemo(() => {
    const colors = getAiColors(colorScheme);
    return {
      colorScheme,
      colors,
      isDark: colorScheme === "dark"
    };
  }, [colorScheme]);
  return /* @__PURE__ */ jsx(AiThemeContext.Provider, { value, children });
}
function useAiTheme() {
  return useContext(AiThemeContext);
}
var AiNativeRuntimeContext = createContext({});
function AiNativeRuntimeProvider({
  value,
  children
}) {
  return /* @__PURE__ */ jsx(AiNativeRuntimeContext.Provider, { value, children });
}
function useAiNativeRuntime() {
  return useContext(AiNativeRuntimeContext);
}
function extractHotelIdFromTourId(tourId) {
  if (!tourId) return null;
  const lt = /^lt_(\d+)$/i.exec(tourId.trim());
  if (lt) return lt[1];
  if (/^\d+$/.test(tourId.trim())) return tourId.trim();
  return null;
}
function applyConfig(props) {
  const next = {};
  if (props.apiBase !== void 0) next.apiBase = props.apiBase;
  if (props.wsUrl !== void 0) next.wsUrl = props.wsUrl;
  if (props.tourBasePath !== void 0) next.tourBasePath = props.tourBasePath;
  if (props.siteOrigin !== void 0) next.siteOrigin = props.siteOrigin;
  if (props.openUrl !== void 0) next.openUrl = props.openUrl;
  if (props.getAccessToken !== void 0) next.getAccessToken = props.getAccessToken;
  if (props.historyMode !== void 0) next.historyMode = props.historyMode;
  if (Object.keys(next).length) configureAiAssistantNative(next);
}
function AiAssistantNativeProvider({
  children,
  apiBase,
  wsUrl,
  tourBasePath,
  siteOrigin,
  openUrl,
  getAccessToken,
  historyMode,
  onOpenHotel,
  colorScheme = "light"
}) {
  applyConfig({
    apiBase,
    wsUrl,
    tourBasePath,
    siteOrigin,
    openUrl,
    getAccessToken,
    historyMode
  });
  const hydrateFromStorage = useAssistantStore((s) => s.hydrateFromStorage);
  const [ready, setReady] = useState(() => useAssistantStore.getState().hydrated);
  useEffect(() => {
    applyConfig({
      apiBase,
      wsUrl,
      tourBasePath,
      siteOrigin,
      openUrl,
      getAccessToken,
      historyMode
    });
  }, [apiBase, wsUrl, tourBasePath, siteOrigin, openUrl, getAccessToken, historyMode]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const payload = await loadChatsFromStorage();
      if (cancelled) return;
      hydrateFromStorage(payload);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromStorage, getAccessToken, historyMode]);
  const runtime = useMemo(
    () => ({ openUrl, onOpenHotel }),
    [openUrl, onOpenHotel]
  );
  return /* @__PURE__ */ jsx(AiThemeProvider, { colorScheme, children: /* @__PURE__ */ jsx(AiNativeRuntimeProvider, { value: runtime, children: /* @__PURE__ */ jsx(View, { style: { flex: 1 }, children: ready ? children : null }) }) });
}
function useWebSocket(enabled = true) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const manualCloseRef = useRef(false);
  const connectSeqRef = useRef(0);
  const hydrated = useAssistantStore((s) => s.hydrated);
  const setConnected = useAssistantStore((s) => s.setConnected);
  const setTyping = useAssistantStore((s) => s.setTyping);
  const addMessage = useAssistantStore((s) => s.addMessage);
  const appendToMessage = useAssistantStore((s) => s.appendToMessage);
  const updateMessage = useAssistantStore((s) => s.updateMessage);
  const setStreamingId = useAssistantStore((s) => s.setStreamingId);
  const setHighlightedTours = useAssistantStore((s) => s.setHighlightedTours);
  const setTypingStatus = useAssistantStore((s) => s.setTypingStatus);
  const handleMessageRef = useRef(() => {
  });
  handleMessageRef.current = (raw) => {
    let data;
    try {
      data = JSON.parse(String(raw.data));
    } catch {
      return;
    }
    switch (data.type) {
      case "typing":
        setTyping(true);
        break;
      case "token": {
        if (!data.content) break;
        setTyping(false);
        const store = useAssistantStore.getState();
        let id = store.streamingId;
        if (!id) {
          id = data.messageId ?? uid("assistant");
          addMessage({ id, role: "assistant", content: "" });
          setStreamingId(id);
        }
        appendToMessage(id, data.content);
        break;
      }
      case "tours":
        if (data.tours?.length) {
          setHighlightedTours(data.tours);
          const store = useAssistantStore.getState();
          const id = store.streamingId;
          if (!id) {
            const newId = data.messageId ?? uid("assistant");
            addMessage({
              id: newId,
              role: "assistant",
              content: "",
              metadata: { tour_results: data.tours }
            });
            setStreamingId(newId);
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                tour_results: data.tours
              }
            });
          }
        }
        break;
      case "rooms":
        if (data.rooms?.length && data.hotel) {
          const store = useAssistantStore.getState();
          const id = store.streamingId;
          const payload = { hotel: data.hotel, rooms: data.rooms };
          if (!id) {
            const newId = data.messageId ?? uid("assistant");
            addMessage({
              id: newId,
              role: "assistant",
              content: "",
              metadata: { room_cards: payload }
            });
            setStreamingId(newId);
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                room_cards: payload
              }
            });
          }
        }
        break;
      case "destinations":
        if (data.destinations?.length) {
          const store = useAssistantStore.getState();
          const id = store.streamingId;
          if (!id) {
            const newId = data.messageId ?? uid("assistant");
            addMessage({
              id: newId,
              role: "assistant",
              content: "",
              metadata: { destination_cards: data.destinations }
            });
            setStreamingId(newId);
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                destination_cards: data.destinations
              }
            });
          }
        }
        break;
      case "booking":
        if (data.booking) {
          const store = useAssistantStore.getState();
          const id = store.streamingId;
          if (!id) {
            const newId = data.messageId ?? uid("assistant");
            addMessage({
              id: newId,
              role: "assistant",
              content: "",
              metadata: { booking: data.booking }
            });
            setStreamingId(newId);
          } else {
            updateMessage(id, {
              metadata: {
                ...store.messages.find((m) => m.id === id)?.metadata,
                booking: data.booking
              }
            });
          }
        }
        break;
      case "tool": {
        if (!data.tool) break;
        if (data.tool.status === "running") {
          setTyping(true);
          setTypingStatus(friendlyStatus(data.tool.name));
        }
        const store = useAssistantStore.getState();
        const id = store.streamingId;
        if (id) {
          const msg = store.messages.find((m) => m.id === id);
          const calls = [...msg?.metadata?.tool_calls ?? []];
          const idx = calls.findIndex((c) => c.id && c.id === data.tool.id);
          if (idx >= 0) calls[idx] = { ...calls[idx], ...data.tool };
          else calls.push(data.tool);
          updateMessage(id, { metadata: { ...msg?.metadata, tool_calls: calls } });
        }
        break;
      }
      case "done":
        setTyping(false);
        setStreamingId(null);
        break;
      case "error":
        setTyping(false);
        setStreamingId(null);
        addMessage({
          role: "assistant",
          content: data.error ?? "\u041F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0430. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437."
        });
        break;
    }
  };
  const clearInFlight = useCallback(() => {
    setTyping(false);
    setStreamingId(null);
  }, [setStreamingId, setTyping]);
  const connect = useCallback(() => {
    if (!enabled || !hydrated) return;
    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const attempt = ++connectSeqRef.current;
    Promise.resolve().then(() => getAiNativeConfig().getAccessToken?.() ?? null).catch(() => null).then((token) => {
      if (manualCloseRef.current || attempt !== connectSeqRef.current) return;
      const current = wsRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const ws = new WebSocket(withToken(getWsUrl(), token));
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        const payload = buildRestorePayload();
        if (payload.messages.length) ws.send(JSON.stringify(payload));
      };
      ws.onclose = () => {
        setConnected(false);
        clearInFlight();
        if (!manualCloseRef.current) {
          reconnectRef.current = setTimeout(connect, 2e3);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => handleMessageRef.current(event);
    });
  }, [clearInFlight, enabled, hydrated, setConnected]);
  useEffect(() => {
    if (!enabled || !hydrated) return;
    manualCloseRef.current = false;
    connect();
    return () => {
      manualCloseRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      clearInFlight();
      setConnected(false);
    };
  }, [clearInFlight, connect, enabled, hydrated, setConnected]);
  const send = useCallback(
    (content) => {
      if (!content.trim()) return;
      addMessage({ role: "user", content: content.trim() });
      setTyping(true);
      const payload = JSON.stringify({ type: "chat", content: content.trim() });
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(payload);
      } else {
        setTyping(false);
        addMessage({
          role: "assistant",
          content: "\u041D\u0435\u0442 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F \u0441 \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442\u043E\u043C. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442 \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437."
        });
      }
    },
    [addMessage, setTyping]
  );
  const reset = useCallback(() => {
    useAssistantStore.getState().clearMessages();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "reset" }));
    }
  }, []);
  const newChat2 = useCallback(() => {
    useAssistantStore.getState().startNewChat();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "reset" }));
    }
  }, []);
  const openChat = useCallback((id) => {
    useAssistantStore.getState().switchChat(id);
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(buildRestorePayload()));
  }, []);
  const streamingId = useAssistantStore((s) => s.streamingId);
  return { send, reset, newChat: newChat2, openChat, streamingId };
}
function buildRestorePayload() {
  const messages = useAssistantStore.getState().messages;
  const history = messages.filter((m) => m.content.trim() && m.id !== "welcome" && !m.id.startsWith("welcome")).map((m) => ({ role: m.role, content: m.content }));
  const hotels = [];
  for (const m of messages) {
    for (const t of m.metadata?.tour_results ?? []) {
      if (!t?.name) continue;
      const idx = hotels.findIndex((h) => h.name === t.name);
      if (idx !== -1) hotels.splice(idx, 1);
      hotels.push({ id: t.id, name: t.name });
    }
  }
  return { type: "restore", messages: history.slice(-40), hotels: hotels.slice(-8) };
}
function withToken(url, token) {
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
function friendlyStatus(toolName) {
  switch (toolName) {
    case "search_tours":
      return "\u041F\u043E\u0434\u0431\u0438\u0440\u0430\u044E \u0442\u0443\u0440\u044B";
    case "get_hotel_info":
      return "\u0418\u0437\u0443\u0447\u0430\u044E \u043E\u0442\u0435\u043B\u044C";
    case "get_hotel_offers":
      return "\u0418\u0449\u0443 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u044B \u0440\u0430\u0437\u043C\u0435\u0449\u0435\u043D\u0438\u044F";
    case "annotate_hotels":
      return "\u0414\u043E\u0431\u0430\u0432\u043B\u044F\u044E \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438";
    case "show_destinations":
      return "\u0421\u043E\u0431\u0438\u0440\u0430\u044E \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F";
    default:
      return "\u0414\u0443\u043C\u0430\u044E";
  }
}

// src/hooks/useAssistant.ts
function useAssistant() {
  const isOpen = useAssistantStore((s) => s.isOpen);
  const isConnected = useAssistantStore((s) => s.isConnected);
  const isTyping = useAssistantStore((s) => s.isTyping);
  const messages = useAssistantStore((s) => s.messages);
  const hydrated = useAssistantStore((s) => s.hydrated);
  const toggleOpen = useAssistantStore((s) => s.toggleOpen);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const { send, reset, newChat: newChat2, openChat } = useWebSocket(hydrated);
  return {
    isOpen,
    isConnected,
    isTyping,
    messages,
    toggleOpen,
    setOpen,
    send,
    reset,
    newChat: newChat2,
    openChat
  };
}

// src/lib/meals.ts
var MEAL_LABELS = {
  UAI: "\u0423\u043B\u044C\u0442\u0440\u0430 \u0432\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
  "UAI+": "\u0423\u043B\u044C\u0442\u0440\u0430 \u0432\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
  AI: "\u0412\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
  "AI+": "\u0412\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
  AIP: "\u0412\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
  FB: "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0430\u043D\u0441\u0438\u043E\u043D",
  "FB+": "\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0430\u043D\u0441\u0438\u043E\u043D",
  HB: "\u041F\u043E\u043B\u0443\u043F\u0430\u043D\u0441\u0438\u043E\u043D",
  "HB+": "\u041F\u043E\u043B\u0443\u043F\u0430\u043D\u0441\u0438\u043E\u043D",
  BB: "\u0417\u0430\u0432\u0442\u0440\u0430\u043A\u0438",
  RO: "\u0411\u0435\u0437 \u043F\u0438\u0442\u0430\u043D\u0438\u044F",
  OB: "\u0411\u0435\u0437 \u043F\u0438\u0442\u0430\u043D\u0438\u044F",
  SC: "\u0411\u0435\u0437 \u043F\u0438\u0442\u0430\u043D\u0438\u044F"
};
function mealLabel(code) {
  return MEAL_LABELS[code.trim().toUpperCase()] ?? code.trim();
}

// src/lib/bookingHref.ts
function toSiteRelativeHref(href) {
  try {
    const m = href.match(/^(?:https?:\/\/[^/?#]+)?([^?#]*)(\?[^#]*)?(#.*)?$/i);
    if (!m) return href;
    return `${m[1] || ""}${m[2] || ""}${m[3] || ""}`;
  } catch {
    return href;
  }
}
function hotelDetailsHrefFromTour(tour) {
  if (tour.link) return toSiteRelativeHref(tour.link);
  return getTourHref(tour.id);
}
function upsertQueryParam(href, key, value) {
  const hashIdx = href.indexOf("#");
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const withoutHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const qIdx = withoutHash.indexOf("?");
  const path = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;
  const search = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : "";
  const parts = search ? search.split("&").filter((p) => p && !p.startsWith(`${key}=`) && p !== key) : [];
  parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return `${path}?${parts.join("&")}${hash}`;
}
function removeQueryParams(href, keys) {
  const hashIdx = href.indexOf("#");
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const withoutHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const qIdx = withoutHash.indexOf("?");
  if (qIdx < 0) return href;
  const path = withoutHash.slice(0, qIdx);
  const search = withoutHash.slice(qIdx + 1);
  const keySet = new Set(keys);
  const parts = search.split("&").filter((p) => {
    if (!p) return false;
    const k = decodeURIComponent(p.split("=")[0] || "");
    return !keySet.has(k);
  });
  return parts.length ? `${path}?${parts.join("&")}${hash}` : `${path}${hash}`;
}
function roomBookingHref(room, hotelId) {
  if (room.booking_url) {
    let href = toSiteRelativeHref(room.booking_url);
    try {
      if (room.room_type && !/[?&]room_type=/.test(href)) {
        href = upsertQueryParam(href, "room_type", room.room_type);
      }
      href = removeQueryParams(href, ["list_price", "room_price"]);
    } catch {
    }
    return href;
  }
  return getTourHref(`lt_${hotelId}`, room.room_type);
}
async function openBookingHref(href) {
  const { siteOrigin, openUrl } = getAiNativeConfig();
  let url = href;
  if (!/^https?:\/\//i.test(href)) {
    const origin = (siteOrigin || "https://totus.club").replace(/\/$/, "");
    url = `${origin}${href.startsWith("/") ? href : `/${href}`}`;
  }
  if (openUrl) {
    await openUrl(url);
    return;
  }
  const can = await Linking.canOpenURL(url);
  if (can) await Linking.openURL(url);
}
var sendListeners = /* @__PURE__ */ new Set();
function onAssistantSendRequest(listener) {
  sendListeners.add(listener);
  return () => {
    sendListeners.delete(listener);
  };
}
function requestAssistantSend(prompt) {
  for (const listener of sendListeners) listener(prompt);
}
function useOpenHotelAction() {
  const { onOpenHotel, openUrl } = useAiNativeRuntime();
  return (opts) => {
    const fromTour = extractHotelIdFromTourId(opts.tourId);
    const fromNum = opts.hotelId != null && Number.isFinite(Number(opts.hotelId)) ? String(Math.trunc(Number(opts.hotelId))) : null;
    let hotelId = fromTour || fromNum;
    if (!hotelId && opts.href) {
      const idMatch = /[?&]hotel_id=(\d+)/i.exec(opts.href) || /[?&]hotelId=(\d+)/i.exec(opts.href);
      if (idMatch) hotelId = idMatch[1];
      if (!hotelId) {
        const m = /lt_(\d+)/i.exec(opts.href);
        if (m) hotelId = m[1];
      }
      if (!hotelId) {
        const pathId = opts.href.match(/\/(?:hotel-details|tours)\/([^/?#]+)/i);
        if (pathId) {
          const raw = decodeURIComponent(pathId[1]);
          const lt = /^lt_(\d+)$/i.exec(raw);
          hotelId = lt ? lt[1] : /^\d+$/.test(raw) ? raw : null;
        }
      }
    }
    if (hotelId && onOpenHotel) {
      const handled = onOpenHotel({
        hotelId: String(hotelId),
        tourId: opts.tourId,
        roomType: opts.roomType,
        href: opts.href
      });
      if (handled !== false) return;
    }
    const { siteOrigin } = getAiNativeConfig();
    let url = opts.href;
    if (!/^https?:\/\//i.test(url)) {
      const origin = (siteOrigin || "https://totus.club").replace(/\/$/, "");
      url = `${origin}${url.startsWith("/") ? url : `/${url}`}`;
    }
    if (openUrl) {
      void openUrl(url);
      return;
    }
    void openBookingHref(opts.href);
  };
}
function ChatMessage({ message }) {
  const { colors } = useAiTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isUser = message.role === "user";
  const hasContent = message.content.trim().length > 0;
  const hasCards = Boolean(message.metadata?.tour_results?.length) || Boolean(message.metadata?.room_cards?.rooms?.length) || Boolean(message.metadata?.destination_cards?.length) || Boolean(message.metadata?.booking);
  if (!hasContent && !hasCards) return null;
  return /* @__PURE__ */ jsx(View, { style: [styles.row, isUser ? styles.rowEnd : styles.rowStart], children: /* @__PURE__ */ jsxs(View, { style: [styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant], children: [
    hasContent ? /* @__PURE__ */ jsx(Text, { style: [styles.body, isUser && styles.bodyUser], children: renderAssistantText(message.content, styles) }) : null,
    message.metadata?.tour_results && message.metadata.tour_results.length > 0 ? /* @__PURE__ */ jsx(View, { style: [styles.cards, hasContent && styles.cardsSpaced], children: message.metadata.tour_results.map((tour) => /* @__PURE__ */ jsx(HotelCard, { tour }, tour.id)) }) : null,
    message.metadata?.room_cards && message.metadata.room_cards.rooms.length > 0 ? /* @__PURE__ */ jsxs(View, { style: [hasContent && styles.cardsSpaced], children: [
      message.metadata.room_cards.hotel.name ? /* @__PURE__ */ jsxs(Text, { style: styles.roomsTitle, children: [
        "\u041D\u043E\u043C\u0435\u0440\u0430 \xB7 ",
        message.metadata.room_cards.hotel.name
      ] }) : null,
      /* @__PURE__ */ jsx(View, { style: styles.cards, children: message.metadata.room_cards.rooms.map((room) => /* @__PURE__ */ jsx(
        RoomCardView,
        {
          room,
          hotelId: message.metadata.room_cards.hotel.id,
          hotelImage: message.metadata.room_cards.hotel.image
        },
        room.room_type
      )) }),
      /* @__PURE__ */ jsx(Text, { style: styles.roomsHint, children: "\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043D\u043E\u043C\u0435\u0440\u0430, \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043F\u043E \u044D\u0442\u043E\u043C\u0443 \u0437\u0430\u043F\u0440\u043E\u0441\u0443. \u0427\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u043E\u0432, \u0432\u043E\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435\u0441\u044C \u043F\u043E\u0438\u0441\u043A\u043E\u043C \u0432\u0440\u0443\u0447\u043D\u0443\u044E." })
    ] }) : null,
    message.metadata?.destination_cards && message.metadata.destination_cards.length > 0 ? /* @__PURE__ */ jsx(View, { style: [styles.destGrid, hasContent && styles.cardsSpaced], children: message.metadata.destination_cards.map((dest) => /* @__PURE__ */ jsxs(
      Pressable,
      {
        style: styles.destCard,
        onPress: () => requestAssistantSend(`\u041D\u0430\u0439\u0434\u0438 \u0442\u0443\u0440\u044B: ${dest.name}`),
        children: [
          dest.image ? /* @__PURE__ */ jsx(Image, { source: { uri: dest.image }, style: styles.destImage }) : /* @__PURE__ */ jsx(View, { style: [styles.destImage, styles.destFallback] }),
          /* @__PURE__ */ jsxs(View, { style: styles.destOverlay, children: [
            /* @__PURE__ */ jsxs(Text, { style: styles.destName, children: [
              dest.emoji ? `${dest.emoji} ` : "",
              dest.name
            ] }),
            dest.country && dest.country !== dest.name ? /* @__PURE__ */ jsx(Text, { style: styles.destCountry, children: dest.country }) : null
          ] }),
          dest.tagline ? /* @__PURE__ */ jsx(Text, { style: styles.destTagline, numberOfLines: 2, children: dest.tagline }) : null
        ]
      },
      dest.name
    )) }) : null
  ] }) });
}
function HotelCard({ tour }) {
  const { colors } = useAiTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const openHotel = useOpenHotelAction();
  const image = tour.images?.[0];
  const pickMap = {
    "\u043E\u043F\u0442\u0438\u043C\u0443\u043C \u0446\u0435\u043D\u0430/\u043A\u0430\u0447\u0435\u0441\u0442\u0432\u043E": { bg: colors.coral, fg: colors.white },
    "\u0441\u0430\u043C\u0430\u044F \u043D\u0438\u0437\u043A\u0430\u044F \u0446\u0435\u043D\u0430": { bg: colors.ok, fg: colors.white },
    "\u043B\u0443\u0447\u0448\u0438\u0439 \u0440\u0435\u0439\u0442\u0438\u043D\u0433": { bg: colors.gold, fg: colors.white }
  };
  const labelColors = tour.pick_label ? pickMap[tour.pick_label] ?? { bg: colors.paper, fg: colors.ink } : null;
  const open = () => openHotel({
    tourId: tour.id,
    // Prefer full AI booking link (has dates / destination) so hotel page finds rooms.
    href: tour.link || hotelDetailsHrefFromTour(tour)
  });
  return /* @__PURE__ */ jsxs(Pressable, { style: styles.hotelCard, onPress: open, children: [
    /* @__PURE__ */ jsxs(View, { style: styles.hotelHero, children: [
      image ? /* @__PURE__ */ jsx(Image, { source: { uri: image }, style: styles.hotelImage }) : /* @__PURE__ */ jsx(View, { style: [styles.hotelImage, styles.hotelFallback], children: /* @__PURE__ */ jsx(Text, { style: styles.hotelEmoji, children: tour.emoji || "\u{1F3E8}" }) }),
      /* @__PURE__ */ jsx(View, { style: styles.hotelGradient }),
      tour.pick_label && labelColors ? /* @__PURE__ */ jsx(View, { style: [styles.pickLabel, { backgroundColor: labelColors.bg }], children: /* @__PURE__ */ jsx(Text, { style: [styles.pickLabelText, { color: labelColors.fg }], children: tour.pick_label }) }) : null,
      /* @__PURE__ */ jsxs(View, { style: styles.hotelMeta, children: [
        /* @__PURE__ */ jsxs(Text, { style: styles.hotelName, children: [
          tour.name,
          tour.stars ? /* @__PURE__ */ jsx(Text, { style: styles.hotelStars, children: "\u2605".repeat(Math.min(tour.stars, 5)) }) : null
        ] }),
        /* @__PURE__ */ jsxs(Text, { style: styles.hotelSub, children: [
          tour.destination,
          " \xB7 ",
          formatDurationLabel(tour.duration, tour.duration_hours),
          tour.rating > 0 ? ` \xB7 \u2605 ${tour.rating}` : ""
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(View, { style: styles.hotelFooter, children: [
      /* @__PURE__ */ jsxs(View, { children: [
        /* @__PURE__ */ jsx(Text, { style: styles.priceLabel, children: "\u0446\u0435\u043D\u0430 \u0437\u0430 \u0442\u0443\u0440" }),
        /* @__PURE__ */ jsxs(Text, { style: styles.price, children: [
          "\u043E\u0442 ",
          formatPrice(tour.price, tour.currency)
        ] })
      ] }),
      /* @__PURE__ */ jsx(View, { style: styles.cta, children: /* @__PURE__ */ jsx(Text, { style: styles.ctaText, children: "\u041A \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044E" }) })
    ] }),
    tour.comment ? /* @__PURE__ */ jsx(View, { style: styles.commentBox, children: /* @__PURE__ */ jsxs(Text, { style: styles.comment, children: [
      "\u{1F4AC} ",
      tour.comment
    ] }) }) : null
  ] });
}
function RoomCardView({
  room,
  hotelId,
  hotelImage
}) {
  const { colors } = useAiTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const openHotel = useOpenHotelAction();
  const meals = Object.entries(room.meals).sort((a, b) => a[1] - b[1]);
  return /* @__PURE__ */ jsxs(View, { style: styles.roomCard, children: [
    hotelImage ? /* @__PURE__ */ jsx(Image, { source: { uri: hotelImage }, style: styles.roomThumb }) : null,
    /* @__PURE__ */ jsxs(View, { style: styles.roomBody, children: [
      /* @__PURE__ */ jsx(Text, { style: styles.roomType, children: room.room_type }),
      /* @__PURE__ */ jsx(View, { style: styles.mealRow, children: meals.slice(0, 3).map(([meal, price]) => /* @__PURE__ */ jsx(View, { style: styles.mealChip, children: /* @__PURE__ */ jsxs(Text, { style: styles.mealText, children: [
        mealLabel(meal),
        " \xB7 \u043E\u0442 ",
        formatPrice(price, room.currency)
      ] }) }, meal)) }),
      /* @__PURE__ */ jsxs(View, { style: styles.roomFooter, children: [
        /* @__PURE__ */ jsxs(Text, { style: styles.price, children: [
          "\u043E\u0442 ",
          formatPrice(room.min_price, room.currency)
        ] }),
        /* @__PURE__ */ jsx(
          Pressable,
          {
            style: styles.ctaSmall,
            onPress: () => openHotel({
              hotelId,
              roomType: room.room_type,
              href: roomBookingHref(room, hotelId)
            }),
            children: /* @__PURE__ */ jsx(Text, { style: styles.ctaText, children: "\u041A \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044E" })
          }
        )
      ] })
    ] })
  ] });
}
function renderAssistantText(raw, styles) {
  const cleaned = raw.replace(/^#{1,6}\s*/gm, "").replace(/^\s*[-*]\s+/gm, "\u2022 ");
  const parts = cleaned.split(/\*\*(.+?)\*\*/g);
  return parts.map(
    (part, i) => i % 2 === 1 ? /* @__PURE__ */ jsx(Text, { style: styles.bold, children: part }, i) : /* @__PURE__ */ jsx(Text, { children: part.replaceAll("**", "") }, i)
  );
}
function makeStyles(c) {
  return StyleSheet.create({
    row: { width: "100%", marginBottom: 4 },
    rowStart: { alignItems: "flex-start" },
    rowEnd: { alignItems: "flex-end" },
    bubble: {
      maxWidth: "92%",
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    bubbleUser: {
      backgroundColor: c.userBubble,
      borderBottomRightRadius: 6
    },
    bubbleAssistant: {
      backgroundColor: c.sand,
      borderWidth: 1,
      borderColor: c.line,
      borderBottomLeftRadius: 6
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: c.ink
    },
    bodyUser: {
      color: c.userBubbleText
    },
    bold: { fontWeight: "600" },
    cards: { gap: 10 },
    cardsSpaced: { marginTop: 12 },
    hotelCard: {
      overflow: "hidden",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.paper
    },
    hotelHero: { height: 128, position: "relative" },
    hotelImage: { width: "100%", height: "100%" },
    hotelFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.sand
    },
    hotelEmoji: { fontSize: 28 },
    hotelGradient: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay
    },
    pickLabel: {
      position: "absolute",
      left: 8,
      top: 8,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3
    },
    pickLabelText: { fontSize: 10, fontWeight: "600" },
    hotelMeta: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 10
    },
    hotelName: { color: c.white, fontWeight: "600", fontSize: 14 },
    hotelStars: { color: c.coral },
    hotelSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
    hotelFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8
    },
    priceLabel: { fontSize: 11, color: c.faint },
    price: { fontSize: 14, fontWeight: "600", color: c.coral },
    cta: {
      backgroundColor: c.coral,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    ctaSmall: {
      backgroundColor: c.coral,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6
    },
    ctaText: { color: c.white, fontSize: 11, fontWeight: "600" },
    commentBox: {
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingHorizontal: 10,
      paddingVertical: 8
    },
    comment: { fontSize: 12, color: c.ink, opacity: 0.8 },
    roomsTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: c.sea,
      textTransform: "uppercase",
      marginBottom: 8
    },
    roomsHint: {
      marginTop: 8,
      fontSize: 11,
      lineHeight: 15,
      color: c.subtle,
      backgroundColor: c.sand,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 10,
      paddingVertical: 6
    },
    roomCard: {
      flexDirection: "row",
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.paper,
      padding: 10
    },
    roomThumb: { width: 64, height: 64, borderRadius: 8 },
    roomBody: { flex: 1, minWidth: 0 },
    roomType: { fontWeight: "500", color: c.ink },
    mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    mealChip: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.sand,
      paddingHorizontal: 6,
      paddingVertical: 3
    },
    mealText: { fontSize: 10, color: c.ink, opacity: 0.8 },
    roomFooter: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    },
    destGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    destCard: {
      width: "48%",
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.paper
    },
    destImage: { width: "100%", height: 96 },
    destFallback: { backgroundColor: c.sand },
    destOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 36,
      padding: 8
    },
    destName: { color: c.white, fontWeight: "600", fontSize: 13 },
    destCountry: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
    destTagline: {
      fontSize: 11,
      lineHeight: 14,
      color: c.ink,
      opacity: 0.8,
      paddingHorizontal: 8,
      paddingVertical: 6
    }
  });
}

// src/lib/constants.ts
var QUICK_ACTIONS = [
  {
    id: "ask",
    labelRu: "\u0421\u043E\u0432\u0435\u0442 \u043A\u0443\u0434\u0430 \u0435\u0445\u0430\u0442\u044C",
    prompt: "\u041D\u0435 \u0437\u043D\u0430\u044E \u043A\u0443\u0434\u0430 \u043F\u043E\u0435\u0445\u0430\u0442\u044C \u0432 \u0441\u0435\u043D\u0442\u044F\u0431\u0440\u0435 \u0441 \u0440\u0435\u0431\u0451\u043D\u043A\u043E\u043C 5 \u043B\u0435\u0442 \u2014 \u0447\u0442\u043E \u043F\u043E\u0441\u043E\u0432\u0435\u0442\u0443\u0435\u0442\u0435?"
  },
  {
    id: "uai",
    labelRu: "\u0427\u0442\u043E \u0442\u0430\u043A\u043E\u0435 \u0443\u043B\u044C\u0442\u0440\u0430 \u0432\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    prompt: "\u0427\u0435\u043C \xAB\u0443\u043B\u044C\u0442\u0440\u0430 \u0432\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E\xBB \u043E\u0442\u043B\u0438\u0447\u0430\u0435\u0442\u0441\u044F \u043E\u0442 \xAB\u0432\u0441\u0451 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E\xBB? \u0427\u0442\u043E \u043B\u0443\u0447\u0448\u0435 \u0434\u043B\u044F \u0441\u0435\u043C\u044C\u0438 \u0441 \u0434\u0435\u0442\u044C\u043C\u0438?"
  },
  { id: "turkey", labelRu: "\u0422\u0443\u0440\u044B \u0432 \u0422\u0443\u0440\u0446\u0438\u044E", prompt: "\u041D\u0430\u0439\u0434\u0438 \u0442\u0443\u0440\u044B \u0432 \u0422\u0443\u0440\u0446\u0438\u044E" },
  { id: "egypt", labelRu: "\u0422\u0443\u0440\u044B \u0432 \u0415\u0433\u0438\u043F\u0435\u0442", prompt: "\u041D\u0430\u0439\u0434\u0438 \u0442\u0443\u0440\u044B \u0432 \u0415\u0433\u0438\u043F\u0435\u0442" }
];
function QuickActions({ onSelect }) {
  const { colors } = useAiTheme();
  const styles = useMemo(() => makeStyles2(colors), [colors]);
  return /* @__PURE__ */ jsx(View, { style: styles.wrap, children: QUICK_ACTIONS.map((action) => /* @__PURE__ */ jsx(
    Pressable,
    {
      onPress: () => onSelect(action.prompt),
      style: ({ pressed }) => [styles.chip, pressed && styles.chipPressed],
      children: /* @__PURE__ */ jsx(Text, { style: styles.chipText, children: action.labelRu })
    },
    action.id
  )) });
}
function makeStyles2(c) {
  return StyleSheet.create({
    wrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    chip: {
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.sand,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7
    },
    chipPressed: {
      borderColor: c.coral
    },
    chipText: {
      fontSize: 11,
      color: c.ink,
      opacity: 0.85
    }
  });
}
function ChatPanel({
  showCloseButton = false,
  onClose,
  showBackButton = false,
  onBack,
  topInset = 0,
  bottomInset = 8
}) {
  const { colors } = useAiTheme();
  const styles = useMemo(() => makeStyles3(colors), [colors]);
  const { isConnected, isTyping, messages, send, newChat: newChat2, openChat } = useAssistant();
  const chats = useAssistantStore((s) => s.chats);
  const activeChatId = useAssistantStore((s) => s.activeChatId);
  const showChatList = useAssistantStore((s) => s.showChatList);
  const setShowChatList = useAssistantStore((s) => s.setShowChatList);
  const deleteChat = useAssistantStore((s) => s.deleteChat);
  const typingStatus = useAssistantStore((s) => s.typingStatus);
  const [draft, setDraft] = useState("");
  const [llmOn, setLlmOn] = useState(false);
  const listRef = useRef(null);
  useEffect(() => {
    return onAssistantSendRequest((prompt) => send(prompt));
  }, [send]);
  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, isTyping]);
  useEffect(() => {
    fetch(`${getApiBase()}/health`).then((r) => r.json()).then(
      (data) => setLlmOn(Boolean(data.llm?.enabled ?? data.kimi?.enabled))
    ).catch(() => setLlmOn(false));
  }, [isConnected]);
  const submit = () => {
    if (!draft.trim() || isTyping) return;
    send(draft);
    setDraft("");
  };
  return /* @__PURE__ */ jsx(View, { style: [styles.safe, { paddingTop: topInset }], children: /* @__PURE__ */ jsxs(
    KeyboardAvoidingView,
    {
      style: styles.flex,
      behavior: Platform.OS === "ios" ? "padding" : void 0,
      children: [
        /* @__PURE__ */ jsxs(View, { style: styles.header, children: [
          /* @__PURE__ */ jsxs(View, { style: styles.headerLeft, children: [
            showBackButton ? /* @__PURE__ */ jsx(
              Pressable,
              {
                onPress: onBack,
                style: styles.backBtn,
                hitSlop: 8,
                accessibilityLabel: "\u041D\u0430\u0437\u0430\u0434",
                children: /* @__PURE__ */ jsx(Text, { style: styles.backBtnText, children: "\u2190" })
              }
            ) : null,
            /* @__PURE__ */ jsx(View, { style: styles.avatar, children: /* @__PURE__ */ jsx(Text, { style: styles.avatarText, children: "\u2600\uFE0F" }) }),
            /* @__PURE__ */ jsxs(View, { style: styles.headerText, children: [
              /* @__PURE__ */ jsx(Text, { style: styles.title, children: "\u041C\u0438\u043B\u0430 \xB7 \u0422\u043E\u0442\u0443\u0441 \u043A\u043B\u0443\u0431" }),
              /* @__PURE__ */ jsx(Text, { style: styles.subtitle, children: isConnected ? llmOn ? "\u041E\u043D\u043B\u0430\u0439\u043D \xB7 \u043F\u043E\u0434\u0431\u043E\u0440 \u0442\u0443\u0440\u043E\u0432" : "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C" : "\u041F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435\u2026" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs(View, { style: styles.headerActions, children: [
            /* @__PURE__ */ jsx(HeaderBtn, { label: "\u0447\u0430\u0442\u044B", onPress: () => setShowChatList(!showChatList), styles }),
            /* @__PURE__ */ jsx(HeaderBtn, { label: "+", onPress: newChat2, styles }),
            showCloseButton ? /* @__PURE__ */ jsx(HeaderBtn, { label: "\u2715", onPress: () => onClose?.(), styles }) : null
          ] })
        ] }),
        showChatList ? /* @__PURE__ */ jsxs(View, { style: styles.chatList, children: [
          /* @__PURE__ */ jsx(Text, { style: styles.chatListTitle, children: "\u041C\u043E\u0438 \u0447\u0430\u0442\u044B" }),
          [...chats].reverse().map((chat) => /* @__PURE__ */ jsxs(
            View,
            {
              style: [styles.chatRow, chat.id === activeChatId && styles.chatRowActive],
              children: [
                /* @__PURE__ */ jsxs(Pressable, { style: styles.chatRowMain, onPress: () => openChat(chat.id), children: [
                  /* @__PURE__ */ jsx(
                    Text,
                    {
                      numberOfLines: 1,
                      style: [
                        styles.chatTitle,
                        chat.id === activeChatId && styles.chatTitleActive
                      ],
                      children: chat.title
                    }
                  ),
                  /* @__PURE__ */ jsx(Text, { style: styles.chatDate, children: new Date(chat.updatedAt).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit"
                  }) })
                ] }),
                /* @__PURE__ */ jsx(Pressable, { onPress: () => deleteChat(chat.id), hitSlop: 8, children: /* @__PURE__ */ jsx(Text, { style: styles.delete, children: "\u{1F5D1}" }) })
              ]
            },
            chat.id
          ))
        ] }) : null,
        /* @__PURE__ */ jsx(
          FlatList,
          {
            ref: listRef,
            style: styles.flex,
            contentContainerStyle: styles.messages,
            data: messages,
            keyExtractor: (item) => item.id,
            renderItem: ({ item }) => /* @__PURE__ */ jsx(ChatMessage, { message: item }),
            ListFooterComponent: isTyping ? /* @__PURE__ */ jsx(View, { style: styles.typingWrap, children: /* @__PURE__ */ jsx(View, { style: styles.typingBubble, children: /* @__PURE__ */ jsxs(Text, { style: styles.typingText, children: [
              typingStatus ?? "\u0414\u0443\u043C\u0430\u044E",
              "\u2026"
            ] }) }) }) : null
          }
        ),
        /* @__PURE__ */ jsxs(View, { style: [styles.composer, { paddingBottom: Math.max(bottomInset, 8) }], children: [
          /* @__PURE__ */ jsx(QuickActions, { onSelect: (prompt) => send(prompt) }),
          /* @__PURE__ */ jsxs(View, { style: styles.inputRow, children: [
            /* @__PURE__ */ jsx(
              TextInput,
              {
                style: styles.input,
                value: draft,
                onChangeText: setDraft,
                placeholder: "\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u0441\u043E\u0432\u0435\u0442 \u0438\u043B\u0438 \u043E\u043F\u0438\u0448\u0438\u0442\u0435 \u0442\u0443\u0440\u2026",
                placeholderTextColor: colors.faint,
                multiline: true,
                editable: !isTyping
              }
            ),
            /* @__PURE__ */ jsx(
              Pressable,
              {
                onPress: submit,
                disabled: !draft.trim() || isTyping,
                style: [styles.send, (!draft.trim() || isTyping) && styles.sendDisabled],
                children: /* @__PURE__ */ jsx(Text, { style: styles.sendText, children: "\u27A4" })
              }
            )
          ] }),
          /* @__PURE__ */ jsx(Text, { style: styles.disclaimer, children: "\u0410\u0433\u0435\u043D\u0442 \u043C\u043E\u0436\u0435\u0442 \u043E\u0448\u0438\u0431\u0430\u0442\u044C\u0441\u044F \u2014 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0439\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432\u0440\u0443\u0447\u043D\u0443\u044E." })
        ] })
      ]
    }
  ) });
}
function HeaderBtn({
  label,
  onPress,
  styles
}) {
  return /* @__PURE__ */ jsx(Pressable, { onPress, style: styles.headerBtn, hitSlop: 6, children: /* @__PURE__ */ jsx(Text, { style: styles.headerBtnText, children: label }) });
}
function makeStyles3(c) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1, backgroundColor: c.paper },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: c.paper
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 2
    },
    backBtnText: { fontSize: 24, color: c.ink, fontWeight: "400", lineHeight: 28 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.coral,
      alignItems: "center",
      justifyContent: "center"
    },
    avatarText: { fontSize: 16 },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 13, fontWeight: "600", color: c.ink },
    subtitle: { marginTop: 2, fontSize: 12, color: c.subtle },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
    headerBtn: {
      minWidth: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6
    },
    headerBtnText: { fontSize: 13, color: c.ink },
    chatList: {
      maxHeight: 220,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      backgroundColor: c.paper
    },
    chatListTitle: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 10,
      fontWeight: "600",
      color: c.faint,
      textTransform: "uppercase"
    },
    chatRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    chatRowActive: { backgroundColor: c.sand },
    chatRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
    chatTitle: { flex: 1, fontSize: 14, color: c.ink },
    chatTitleActive: { color: c.coral },
    chatDate: { fontSize: 10, color: c.faint },
    delete: { fontSize: 14, opacity: 0.6 },
    messages: { paddingHorizontal: 12, paddingVertical: 16, gap: 12 },
    typingWrap: { alignItems: "flex-start", marginTop: 4 },
    typingBubble: {
      borderRadius: 16,
      borderBottomLeftRadius: 6,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.sand,
      paddingHorizontal: 12,
      paddingVertical: 10
    },
    typingText: { fontSize: 12, color: c.subtle },
    composer: {
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingHorizontal: 12,
      paddingTop: 10,
      gap: 8,
      backgroundColor: c.paper
    },
    inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 110,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.ink,
      backgroundColor: c.page
    },
    send: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.coral,
      alignItems: "center",
      justifyContent: "center"
    },
    sendDisabled: { opacity: 0.45 },
    sendText: { color: c.white, fontSize: 16 },
    disclaimer: {
      textAlign: "center",
      fontSize: 10,
      lineHeight: 13,
      color: c.faint
    }
  });
}
function ChatWidget({ fabBottom = 24, fabRight = 20 }) {
  const { colors } = useAiTheme();
  const styles = useMemo(() => makeStyles4(colors), [colors]);
  const isOpen = useAssistantStore((s) => s.isOpen);
  const toggleOpen = useAssistantStore((s) => s.toggleOpen);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      Pressable,
      {
        accessibilityLabel: isOpen ? "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0447\u0430\u0442" : "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0447\u0430\u0442",
        onPress: toggleOpen,
        style: [styles.fab, { bottom: fabBottom, right: fabRight }],
        children: /* @__PURE__ */ jsx(Text, { style: styles.fabIcon, children: isOpen ? "\u2715" : "\u{1F4AC}" })
      }
    ),
    /* @__PURE__ */ jsx(
      Modal,
      {
        visible: isOpen,
        animationType: "slide",
        presentationStyle: "pageSheet",
        onRequestClose: toggleOpen,
        children: /* @__PURE__ */ jsx(View, { style: styles.modalRoot, children: isOpen ? /* @__PURE__ */ jsx(ChatPanel, { showCloseButton: true, onClose: toggleOpen }) : null })
      }
    )
  ] });
}
function makeStyles4(c) {
  return StyleSheet.create({
    modalRoot: { flex: 1, backgroundColor: c.paper },
    fab: {
      position: "absolute",
      zIndex: 50,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.coral,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.coral,
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6
    },
    fabIcon: { color: c.white, fontSize: 22 }
  });
}
function ChatScreen({
  topInset = 0,
  bottomInset = 8,
  showBackButton = false,
  onBack
}) {
  const { colors } = useAiTheme();
  const styles = useMemo(
    () => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.paper }
    }),
    [colors]
  );
  return /* @__PURE__ */ jsx(View, { style: styles.root, children: /* @__PURE__ */ jsx(
    ChatPanel,
    {
      topInset,
      bottomInset,
      showBackButton,
      onBack
    }
  ) });
}

export { AiAssistantNativeProvider, ChatMessage, ChatPanel, ChatScreen, ChatWidget, QuickActions, extractHotelIdFromTourId, loadChatsFromStorage, useAiNativeRuntime, useAiTheme, useAssistant, useAssistantStore, useWebSocket };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map