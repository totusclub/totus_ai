import type { SearchFilters } from '@/types'
import { getApiBase } from '@/config'

/** @deprecated Use getApiBase() — kept for gradual migration inside the package */
export const API_BASE = typeof process !== 'undefined'
  ? process.env.NEXT_PUBLIC_API_URL ?? '/api'
  : '/api'

export { getApiBase }

export const FROM_CITIES = [
  'Moscow',
  'Saint Petersburg',
  'Kazan',
  'Yekaterinburg',
  'Novosibirsk',
  'Samara',
  'Rostov-on-Don',
  'Krasnodar',
  'Ufa',
  'Perm',
]

export const NIGHTS_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]

export const STARS_OPTIONS = [1, 2, 3, 4, 5]

export const SORT_OPTIONS: { value: SearchFilters['sortBy']; labelRu: string }[] = [
  { value: 'price', labelRu: 'Сначала дешёвые' },
  { value: 'rating', labelRu: 'По рейтингу' },
  { value: 'stars', labelRu: 'По звёздам' },
]

export const QUICK_ACTIONS = [
  {
    id: 'ask',
    label: 'Ask advice',
    labelRu: 'Совет куда ехать',
    prompt: 'Посоветуйте, куда поехать в отпуск',
  },
  {
    id: 'uai',
    label: 'Ultra all inclusive',
    labelRu: 'Что такое ультра всё включено',
    prompt: 'Чем «ультра всё включено» отличается от «всё включено»? Что лучше для семьи с детьми?',
  },
  { id: 'turkey', label: 'Tours to Turkey', labelRu: 'Туры в Турцию', prompt: 'Найди туры в Турцию' },
  { id: 'egypt', label: 'Tours to Egypt', labelRu: 'Туры в Египет', prompt: 'Найди туры в Египет' },
]

export const DEFAULT_FILTERS: SearchFilters = {
  fromCity: 'Moscow',
  destination: 'Turkey',
  nights: 7,
  adults: 2,
  kids: 0,
  startDate: '',
  starsFrom: 1,
  starsTo: 5,
  priceMin: 0,
  priceMax: 500000,
  sortBy: 'price',
}

export const DESTINATIONS = [
  'Turkey',
  'Antalya',
  'Egypt',
  'Hurghada',
  'Dubai',
  'UAE',
  'Thailand',
  'Phuket',
  'Greece',
  'Cyprus',
  'Spain',
  'Bali',
  'Maldives',
  'Tunisia',
  'Montenegro',
  'Italy',
  'France',
]
