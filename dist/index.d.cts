import * as react from 'react';
import { ReactNode } from 'react';
import * as zustand from 'zustand';

type AiAssistantNativeConfig = {
    /** HTTP API prefix, e.g. https://apiv2.totus.club/api */
    apiBase: string;
    /** WebSocket URL, e.g. wss://apiv2.totus.club/ws/assistant */
    wsUrl: string;
    /** Base path for hotel/tour detail links, default /hotel-details */
    tourBasePath: string;
    /**
     * Open hotel/booking links.
     * Default: Linking.openURL with siteOrigin for relative paths.
     */
    openUrl?: (url: string) => void | Promise<void>;
    /**
     * Origin for absolute booking links from relative paths.
     * Example: https://totus.club
     */
    siteOrigin?: string;
    /**
     * JWT access token (same as kedam/totusapp login).
     * When present, chat history is stored in MySQL via API (not AsyncStorage).
     */
    getAccessToken?: () => string | null | Promise<string | null>;
    /**
     * `remote` — always use API (requires token)
     * `local` — AsyncStorage only
     * `auto` (default) — remote when token exists, else local
     */
    historyMode?: 'auto' | 'remote' | 'local';
};
declare function configureAiAssistantNative(partial: Partial<AiAssistantNativeConfig>): void;
declare function getAiNativeConfig(): AiAssistantNativeConfig;
declare function getApiBase(): string;
declare function getWsUrl(): string;
declare function getTourHref(tourId: string, room?: string): string;

type AiColorScheme = 'light' | 'dark';
type AiColors = {
    paper: string;
    page: string;
    sand: string;
    ink: string;
    subtle: string;
    faint: string;
    line: string;
    coral: string;
    coralDeep: string;
    sea: string;
    seaSoft: string;
    gold: string;
    ok: string;
    white: string;
    userBubble: string;
    userBubbleText: string;
    overlay: string;
};

type OpenHotelInfo = {
    hotelId: string;
    roomType?: string;
    href?: string;
    /** Original tour id from API, e.g. lt_9223758 */
    tourId?: string;
};
type AiNativeRuntime = {
    openUrl?: (url: string) => void | Promise<void>;
    /**
     * Prefer this for hotel cards — host opens in-app hotel screen.
     * Return true if handled (browser must not open).
     */
    onOpenHotel?: (info: OpenHotelInfo) => boolean | void;
};
declare function useAiNativeRuntime(): AiNativeRuntime;
/** Extract numeric hotel id from tour id / link. */
declare function extractHotelIdFromTourId(tourId?: string): string | null;

type AiAssistantNativeProviderProps = {
    children: ReactNode;
    apiBase?: string;
    wsUrl?: string;
    tourBasePath?: string;
    siteOrigin?: string;
    openUrl?: AiAssistantNativeConfig['openUrl'];
    getAccessToken?: AiAssistantNativeConfig['getAccessToken'];
    historyMode?: AiAssistantNativeConfig['historyMode'];
    /** In-app hotel navigation — preferred over openUrl/browser. */
    onOpenHotel?: (info: OpenHotelInfo) => boolean | void;
    colorScheme?: AiColorScheme;
};
declare function AiAssistantNativeProvider({ children, apiBase, wsUrl, tourBasePath, siteOrigin, openUrl, getAccessToken, historyMode, onOpenHotel, colorScheme, }: AiAssistantNativeProviderProps): react.JSX.Element;

type ChatWidgetProps = {
    fabBottom?: number;
    fabRight?: number;
};
/** Floating FAB + modal chat. Prefer `ChatScreen` inside an AI navigation tab. */
declare function ChatWidget({ fabBottom, fabRight }: ChatWidgetProps): react.JSX.Element;

type ChatScreenProps = {
    /** Top safe-area from host app. */
    topInset?: number;
    /** Small bottom padding only (default 8). Do not pass full home-indicator inset. */
    bottomInset?: number;
    showBackButton?: boolean;
    onBack?: () => void;
};
declare function ChatScreen({ topInset, bottomInset, showBackButton, onBack, }: ChatScreenProps): react.JSX.Element;

type ChatPanelProps = {
    showCloseButton?: boolean;
    onClose?: () => void;
    /** Show ← back in header (e.g. leave AI tab). */
    showBackButton?: boolean;
    onBack?: () => void;
    /** Top safe-area inset from host (avoid double SafeAreaView). */
    topInset?: number;
    /** Bottom padding under composer — pass home indicator once only. */
    bottomInset?: number;
};
declare function ChatPanel({ showCloseButton, onClose, showBackButton, onBack, topInset, bottomInset, }: ChatPanelProps): react.JSX.Element;

type TourCategory = 'adventure' | 'cultural' | 'food' | 'relaxation' | 'nightlife' | 'family';
type DurationFilter = 'half-day' | 'full-day' | 'multi-day';
interface ItineraryItem {
    time: string;
    title: string;
    description: string;
}
interface Location {
    address: string;
    lat: number;
    lng: number;
}
interface Review {
    id: string;
    author: string;
    rating: number;
    comment: string;
    date: string;
}
interface Tour {
    pick_label?: string;
    comment?: string;
    id: string;
    name: string;
    destination: string;
    description: string;
    price: number;
    currency: string;
    duration: string;
    link?: string;
    duration_hours: number;
    max_group_size: number;
    rating: number;
    review_count: number;
    stars?: number;
    category: TourCategory;
    images: string[];
    emoji: string;
    itinerary: ItineraryItem[];
    inclusions: string[];
    exclusions: string[];
    meeting_point: Location;
    cancellation_policy: string;
    guide_languages: string[];
    available_dates: string[];
    reviews: Review[];
}
interface BookingResponse {
    booking_id: string;
    status: 'confirmed' | 'pending' | 'cancelled';
    total_price: number;
    created_at: string;
    tour_name?: string;
    date?: string;
    guests?: number;
}
interface ChatMessage$1 {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
        tool_calls?: ToolCall[];
        tour_results?: Tour[];
        booking?: BookingResponse;
        destination_cards?: DestinationCard[];
        room_cards?: RoomCardsPayload;
    };
}
interface ToolCall {
    id?: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
    status?: 'running' | 'done' | 'error';
    label?: string;
    summary?: string;
    api_calls?: string[];
}
interface RoomCard {
    room_type: string;
    min_price: number;
    currency: string;
    meals: Record<string, number>;
    offers_count: number;
    sample_tour_id?: string;
    url?: string;
    booking_url?: string;
}
interface RoomCardsPayload {
    hotel: {
        id: number;
        name?: string;
        image?: string;
    };
    rooms: RoomCard[];
}
interface DestinationCard {
    name: string;
    country?: string;
    tagline?: string;
    image?: string;
    emoji?: string;
}
interface WsServerMessage {
    type: 'token' | 'done' | 'error' | 'tool' | 'tours' | 'booking' | 'typing' | 'destinations' | 'rooms';
    content?: string;
    messageId?: string;
    tool?: ToolCall;
    tours?: Tour[];
    booking?: BookingResponse;
    destinations?: DestinationCard[];
    rooms?: RoomCard[];
    hotel?: {
        id: number;
        name?: string;
        image?: string;
    };
    error?: string;
}

declare function ChatMessage({ message }: {
    message: ChatMessage$1;
}): react.JSX.Element | null;

declare function QuickActions({ onSelect }: {
    onSelect: (prompt: string) => void;
}): react.JSX.Element;

declare function useAssistant(): {
    isOpen: boolean;
    isConnected: boolean;
    isTyping: boolean;
    messages: ChatMessage$1[];
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    send: (content: string) => void;
    reset: () => void;
    newChat: () => void;
    openChat: (id: string) => void;
};

declare function useWebSocket(enabled?: boolean): {
    send: (content: string) => void;
    reset: () => void;
    newChat: () => void;
    openChat: (id: string) => void;
    streamingId: string | null;
};

interface ChatSession {
    id: string;
    title: string;
    updatedAt: number;
    messages: ChatMessage$1[];
}
interface AssistantState {
    isOpen: boolean;
    isConnected: boolean;
    isTyping: boolean;
    typingStatus: string | null;
    messages: ChatMessage$1[];
    chats: ChatSession[];
    activeChatId: string;
    showChatList: boolean;
    streamingId: string | null;
    highlightedTours: Tour[];
    hydrated: boolean;
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    setConnected: (connected: boolean) => void;
    setTyping: (typing: boolean) => void;
    setTypingStatus: (status: string | null) => void;
    addMessage: (message: Omit<ChatMessage$1, 'id' | 'timestamp'> & {
        id?: string;
    }) => string;
    appendToMessage: (id: string, chunk: string) => void;
    updateMessage: (id: string, patch: Partial<ChatMessage$1>) => void;
    setStreamingId: (id: string | null) => void;
    setHighlightedTours: (tours: Tour[]) => void;
    clearMessages: () => void;
    setShowChatList: (show: boolean) => void;
    startNewChat: () => void;
    switchChat: (id: string) => ChatMessage$1[];
    deleteChat: (id: string) => void;
    hydrateFromStorage: (payload: {
        chats: ChatSession[];
        activeId: string;
    } | null) => void;
}
declare function loadChatsFromStorage(): Promise<{
    chats: ChatSession[];
    activeId: string;
} | null>;
declare const useAssistantStore: zustand.UseBoundStore<zustand.StoreApi<AssistantState>>;

type AiThemeContextValue = {
    colorScheme: AiColorScheme;
    colors: AiColors;
    isDark: boolean;
};
declare function useAiTheme(): AiThemeContextValue;

export { type AiAssistantNativeConfig, AiAssistantNativeProvider, type AiAssistantNativeProviderProps, type AiColorScheme, type AiColors, type AiNativeRuntime, type BookingResponse, ChatMessage, ChatPanel, type ChatPanelProps, ChatScreen, type ChatScreenProps, ChatWidget, type ChatWidgetProps, type DestinationCard, type DurationFilter, type ItineraryItem, type Location, type OpenHotelInfo, QuickActions, type Review, type RoomCard, type RoomCardsPayload, type ToolCall, type Tour, type TourCategory, type WsServerMessage, configureAiAssistantNative, extractHotelIdFromTourId, getAiNativeConfig, getApiBase, getTourHref, getWsUrl, loadChatsFromStorage, useAiNativeRuntime, useAiTheme, useAssistant, useAssistantStore, useWebSocket };
