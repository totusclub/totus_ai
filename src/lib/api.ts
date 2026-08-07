import { API_BASE } from '@/lib/constants'
import type {
  AvailabilityResponse,
  BookingRequest,
  BookingResponse,
  SchemaTable,
  SearchFilters,
  Tour,
} from '@/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    try {
      const json = JSON.parse(text) as { error?: string }
      throw new Error(json.error || text || `Request failed: ${res.status}`)
    } catch (err) {
      if (err instanceof Error && err.message !== text) throw err
      throw new Error(text || `Request failed: ${res.status}`)
    }
  }
  return res.json() as Promise<T>
}

export function searchTours(filters: Partial<SearchFilters>) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'all') {
      params.set(key, String(value))
    }
  })
  const qs = params.toString()
  return request<Tour[]>(`/tours${qs ? `?${qs}` : ''}`)
}

export function getTour(id: string) {
  return request<Tour>(`/tours/${id}`)
}

export function checkAvailability(tourId: string, date: string, guests = 1) {
  return request<AvailabilityResponse>(
    `/tours/${tourId}/availability?date=${encodeURIComponent(date)}&guests=${guests}`,
  )
}

export function createBooking(payload: BookingRequest) {
  return request<BookingResponse>('/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getSchema() {
  return request<SchemaTable[]>('/schema')
}

export type RoomGroup = {
  room_type: string
  min_price: number
  currency: string
  meals: Record<string, number>
  offers_count: number
  sample_tour_id?: string
  url?: string
  booking_url?: string
}

export function getTourRooms(id: string) {
  return request<{ hotel_id: number; rooms: RoomGroup[] }>(`/tours/${id}/rooms`)
}
