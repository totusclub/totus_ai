import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DurationFilter, Tour } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number, currency = 'USD') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(price)
}

/** 1 ночь / 2 ночи / 5 ночей */
export function formatNightsRu(nights: number): string {
  const n = Math.abs(Math.trunc(nights))
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ночь`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ночи`
  return `${n} ночей`
}

/** "7 nights" / hours → русская подпись для карточек */
export function formatDurationLabel(duration: string, durationHours?: number): string {
  const m = duration.match(/(\d+)\s*nights?/i)
  if (m) return formatNightsRu(Number(m[1]))
  if (durationHours && durationHours >= 24) {
    return formatNightsRu(Math.round(durationHours / 24))
  }
  return duration
}

export function matchesDuration(tour: Tour, duration: DurationFilter | 'all') {
  if (duration === 'all') return true
  if (duration === 'half-day') return tour.duration_hours <= 5
  if (duration === 'full-day') return tour.duration_hours > 5 && tour.duration_hours <= 12
  return tour.duration_hours > 12
}

export function starLabel(rating: number) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0))
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
