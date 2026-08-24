export function formatPrice(price: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price)
  } catch {
    return `${Math.round(price)} ${currency}`
  }
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

export function formatDurationLabel(duration: string, durationHours?: number): string {
  const m = duration.match(/(\d+)\s*nights?/i)
  if (m) return formatNightsRu(Number(m[1]))
  if (durationHours && durationHours >= 24) {
    return formatNightsRu(Math.round(durationHours / 24))
  }
  return duration
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
