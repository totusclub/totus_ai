export type TourCategory =
  | 'adventure'
  | 'cultural'
  | 'food'
  | 'relaxation'
  | 'nightlife'
  | 'family'

export type DurationFilter = 'half-day' | 'full-day' | 'multi-day'

export interface ItineraryItem {
  time: string
  title: string
  description: string
}

export interface Location {
  address: string
  lat: number
  lng: number
}

export interface Review {
  id: string
  author: string
  rating: number
  comment: string
  date: string
}

export interface Tour {
  pick_label?: string
  comment?: string
  id: string
  name: string
  destination: string
  description: string
  price: number
  currency: string
  duration: string
  /** Client hotel-details URL (totus / kedam), when provided by the API */
  link?: string
  duration_hours: number
  max_group_size: number
  rating: number
  review_count: number
  stars?: number
  category: TourCategory
  images: string[]
  emoji: string
  itinerary: ItineraryItem[]
  inclusions: string[]
  exclusions: string[]
  meeting_point: Location
  cancellation_policy: string
  guide_languages: string[]
  available_dates: string[]
  reviews: Review[]
}

export interface BookingRequest {
  tour_id: string
  date: string
  guests: number
  contact_email: string
  contact_phone: string
  guest_names: string[]
  special_requests?: string
}

export interface BookingResponse {
  booking_id: string
  status: 'confirmed' | 'pending' | 'cancelled'
  total_price: number
  created_at: string
  tour_name?: string
  date?: string
  guests?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    tool_calls?: ToolCall[]
    tour_results?: Tour[]
    booking?: BookingResponse
    destination_cards?: DestinationCard[]
    room_cards?: RoomCardsPayload
  }
}

export interface ToolCall {
  id?: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  status?: 'running' | 'done' | 'error'
  label?: string
  summary?: string
  api_calls?: string[]
}

export interface SearchFilters {
  fromCity: string
  destination: string
  nights: number
  adults: number
  kids: number
  startDate: string
  starsFrom: number
  starsTo: number
  priceMin: number
  priceMax: number
  sortBy: 'price' | 'rating' | 'stars'
  /** @deprecated kept for compatibility */
  category?: TourCategory | 'all'
  duration?: DurationFilter | 'all'
  dateFrom?: string
  dateTo?: string
}

export interface AvailabilityResponse {
  tour_id: string
  date: string
  available: boolean
  spots_left: number
  price: number
}

export interface SchemaColumn {
  name: string
  type: string
  pk?: boolean
  fk?: string
  nullable?: boolean
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
}

export interface RoomCard {
  room_type: string
  min_price: number
  currency: string
  meals: Record<string, number>
  offers_count: number
  sample_tour_id?: string
  url?: string
  booking_url?: string
}

export interface RoomCardsPayload {
  hotel: { id: number; name?: string; image?: string }
  rooms: RoomCard[]
}

export interface DestinationCard {
  name: string
  country?: string
  tagline?: string
  image?: string
  emoji?: string
}

export interface WsServerMessage {
  type: 'token' | 'done' | 'error' | 'tool' | 'tours' | 'booking' | 'typing' | 'destinations' | 'rooms'
  content?: string
  messageId?: string
  tool?: ToolCall
  tours?: Tour[]
  booking?: BookingResponse
  destinations?: DestinationCard[]
  rooms?: RoomCard[]
  hotel?: { id: number; name?: string; image?: string }
  error?: string
}

export interface WsClientMessage {
  type: 'chat' | 'reset'
  content?: string
  sessionId?: string
}
