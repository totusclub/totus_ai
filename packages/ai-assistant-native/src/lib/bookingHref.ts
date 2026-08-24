import type { RoomCard, Tour } from '@/types'
import { getTourHref } from '@/config'

/** Keep booking on the host site, even if API returns an absolute totus URL. */
export function toSiteRelativeHref(href: string): string {
  try {
    // Avoid URLSearchParams APIs that RN does not implement (.has / .set / .delete).
    const m = href.match(/^(?:https?:\/\/[^/?#]+)?([^?#]*)(\?[^#]*)?(#.*)?$/i)
    if (!m) return href
    return `${m[1] || ''}${m[2] || ''}${m[3] || ''}`
  } catch {
    return href
  }
}

/** Hotel card → /hotel-details (via tour.link). */
export function hotelDetailsHrefFromTour(tour: Tour): string {
  if (tour.link) return toSiteRelativeHref(tour.link)
  return getTourHref(tour.id)
}

function upsertQueryParam(href: string, key: string, value: string): string {
  const hashIdx = href.indexOf('#')
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : ''
  const withoutHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href
  const qIdx = withoutHash.indexOf('?')
  const path = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash
  const search = qIdx >= 0 ? withoutHash.slice(qIdx + 1) : ''

  const parts = search
    ? search.split('&').filter((p) => p && !p.startsWith(`${key}=`) && p !== key)
    : []
  parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  return `${path}?${parts.join('&')}${hash}`
}

function removeQueryParams(href: string, keys: string[]): string {
  const hashIdx = href.indexOf('#')
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : ''
  const withoutHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href
  const qIdx = withoutHash.indexOf('?')
  if (qIdx < 0) return href
  const path = withoutHash.slice(0, qIdx)
  const search = withoutHash.slice(qIdx + 1)
  const keySet = new Set(keys)
  const parts = search.split('&').filter((p) => {
    if (!p) return false
    const k = decodeURIComponent(p.split('=')[0] || '')
    return !keySet.has(k)
  })
  return parts.length ? `${path}?${parts.join('&')}${hash}` : `${path}${hash}`
}

/** Room card → hotel-details with room_type. */
export function roomBookingHref(room: RoomCard, hotelId: number): string {
  if (room.booking_url) {
    let href = toSiteRelativeHref(room.booking_url)
    try {
      if (room.room_type && !/[?&]room_type=/.test(href)) {
        href = upsertQueryParam(href, 'room_type', room.room_type)
      }
      href = removeQueryParams(href, ['list_price', 'room_price'])
    } catch {
      /* keep */
    }
    return href
  }
  return getTourHref(`lt_${hotelId}`, room.room_type)
}
