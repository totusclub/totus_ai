// src/config.ts
var config = {
  apiBase: "https://apiv2.totus.club/api",
  wsUrl: "wss://apiv2.totus.club/ws/assistant",
  tourBasePath: "/hotel-details",
  siteOrigin: "https://totus.club"
};
function configureAiAssistantNative(partial) {
  config = {
    ...config,
    ...partial,
    tourBasePath: partial.tourBasePath ?? config.tourBasePath
  };
}
function getAiNativeConfig() {
  return config;
}
function getApiBase() {
  return config.apiBase.replace(/\/$/, "");
}
function getWsUrl() {
  return config.wsUrl;
}
function getTourHref(tourId, room) {
  const base = `${config.tourBasePath.replace(/\/$/, "")}/${tourId}`;
  if (!room) return base;
  return `${base}?room_type=${encodeURIComponent(room)}`;
}

export { configureAiAssistantNative, getAiNativeConfig, getApiBase, getTourHref, getWsUrl };
//# sourceMappingURL=chunk-ZWDNSBGU.js.map
//# sourceMappingURL=chunk-ZWDNSBGU.js.map