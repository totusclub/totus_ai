import { getApiBase } from '@/config'
import type { BookingResponse, Tour } from '@/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
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

export function getTour(id: string) {
  return request<Tour>(`/tours/${id}`)
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

export function createBooking(payload: Record<string, unknown>) {
  return request<BookingResponse>('/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
