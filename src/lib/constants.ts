import type { SearchFilters } from '@/types'

export const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/assistant`

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

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
    prompt: 'Не знаю куда поехать в сентябре с ребёнком 5 лет — что посоветуете?',
  },
  {
    id: 'uai',
    label: 'What is UAI',
    labelRu: 'Что такое UAI',
    prompt: 'Чем UAI отличается от AI? Что лучше для семьи с детьми?',
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
