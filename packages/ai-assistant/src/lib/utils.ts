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
