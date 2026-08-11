import type { RoomCard, Tour } from '@/types'
import { getTourHref } from '@/config'

/** Keep booking on the host site (kedam), even if API returns an absolute totus URL. */
export function toSiteRelativeHref(href: string): string {
  try {
    const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://local')
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return href
  }
}

/** Hotel card → /hotel-details (via tour.link). Price comes from live search on that page. */
export function hotelDetailsHrefFromTour(tour: Tour): string {
  if (tour.link) return toSiteRelativeHref(tour.link)
  return getTourHref(tour.id)
}

/** Room card → hotel-details with room_type; price is resolved on the hotel page. */
export function roomBookingHref(room: RoomCard, hotelId: number): string {
  if (room.booking_url) {
    let href = toSiteRelativeHref(room.booking_url)
    try {
      const u = new URL(href, 'https://local')
      if (room.room_type && !u.searchParams.has('room_type')) {
        u.searchParams.set('room_type', room.room_type)
      }
      // Never pass chat price in URL — hotel-details finds cheapest from params.
      u.searchParams.delete('list_price')
      u.searchParams.delete('room_price')
      href = `${u.pathname}${u.search}${u.hash}`
    } catch {
      /* keep */
    }
    return href
  }
  return getTourHref(`lt_${hotelId}`, room.room_type)
}
