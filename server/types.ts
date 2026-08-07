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
  id: string
  name: string
  destination: string
  description: string
  price: number
  currency: string
  duration: string
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
  category?: TourCategory | 'all'
  duration?: DurationFilter | 'all'
  dateFrom?: string
  dateTo?: string
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
