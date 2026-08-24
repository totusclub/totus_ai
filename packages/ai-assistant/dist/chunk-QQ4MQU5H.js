// src/config.ts
var envApi = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : void 0;
var envWs = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WS_URL : void 0;
var config = {
  apiBase: envApi || "/api",
  wsUrl: envWs,
  tourBasePath: "/tours",
  homePath: "/"
};
function configureAiAssistant(partial) {
  config = {
    ...config,
    ...partial,
    tourBasePath: partial.tourBasePath ?? config.tourBasePath,
    homePath: partial.homePath ?? config.homePath
  };
}
function getAiConfig() {
  return config;
}
function getApiBase() {
  return config.apiBase;
}
function getTourHref(tourId, room) {
  const base = `${config.tourBasePath.replace(/\/$/, "")}/${tourId}`;
  if (!room) return base;
  return `${base}?room=${encodeURIComponent(room)}`;
}
function getWsUrl() {
  if (config.wsUrl) return config.wsUrl;
  if (typeof window === "undefined") {
    return "ws://localhost:3011/ws/assistant";
  }
  const { protocol, hostname, host } = window.location;
  const wsProto = protocol === "https:" ? "wss" : "ws";
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${wsProto}://localhost:3011/ws/assistant`;
  }
  return `${wsProto}://${host}/ws/assistant`;
}

export { configureAiAssistant, getAiConfig, getApiBase, getTourHref, getWsUrl };
//# sourceMappingURL=chunk-QQ4MQU5H.js.map
//# sourceMappingURL=chunk-QQ4MQU5H.js.map