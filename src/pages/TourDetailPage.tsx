import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  Check,
  MapPin,
  Users,
  X as XIcon,
} from 'lucide-react'
import { getTour, getTourRooms } from '@/lib/api'
import { mealLabel } from '@/lib/meals'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAssistantStore } from '@/stores/assistantStore'

export function TourDetailPage() {
  const { id = '' } = useParams()
  const setOpen = useAssistantStore((s) => s.setOpen)

  const { data: tour, isLoading, error } = useQuery({
    queryKey: ['tour', id],
    queryFn: () => getTour(id),
    enabled: Boolean(id),
  })

  const bookInChat = () => {
    if (!tour) return
    setOpen(true)
    window.dispatchEvent(
      new CustomEvent('assistant:send', {
        detail: `Хочу забронировать тур «${tour.name}» (${tour.id})`,
      }),
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (error || !tour) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-lg text-white">Тур не найден</p>
        <Link to="/" className="mt-4 inline-block text-cyan-400 hover:underline">
          На главную
        </Link>
      </div>
    )
  }

  const categoryLabel = 'Тотус клуб'

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Все туры
      </Link>

      <div className="overflow-hidden rounded-[12px] border border-slate-700/70 bg-slate-800/60 backdrop-blur-md">
        <div className="relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950/40 sm:h-64">
          {tour.images[0] ? (
            <img
              src={tour.images[0]}
              alt={tour.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-8xl">{tour.emoji}</span>
          )}
        </div>

        <div className="space-y-8 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge className="mb-2 border-cyan-500/20 bg-cyan-500/10 text-cyan-200">
                {categoryLabel}
              </Badge>
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-white">
                {tour.name}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-slate-400">
                <MapPin className="h-4 w-4 text-cyan-400" />
                {tour.destination} · {tour.duration} · до {tour.max_group_size} чел.
              </p>
              <p className="mt-1 text-amber-400">
                ★ {tour.rating} ({tour.review_count} отзывов)
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-3xl font-semibold text-cyan-300">
                {formatPrice(tour.price, tour.currency)}
              </p>
              <p className="text-sm text-slate-500">за человека</p>
              <Button type="button" className="mt-3 w-full sm:w-auto" onClick={bookInChat}>
                Забронировать
              </Button>
            </div>
          </div>

          <p className="leading-relaxed text-slate-300">{tour.description}</p>

          <section>
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
              Программа
            </h2>
            <ol className="relative space-y-0 border-l border-slate-700 pl-6">
              {tour.itinerary.map((item, idx) => (
                <li key={idx} className="relative pb-6 last:pb-0">
                  <span className="absolute -left-[1.9rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-cyan-500/50 bg-slate-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  </span>
                  <p className="text-xs font-medium uppercase tracking-wide text-cyan-400">
                    {item.time}
                  </p>
                  <p className="mt-1 font-medium text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                </li>
              ))}
            </ol>
          </section>

          <RoomTypesSection tourId={tour.id} />

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="mb-3 font-semibold text-white">Включено</h2>
              <ul className="space-y-2">
                {tour.inclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-3 font-semibold text-white">Не включено</h2>
              <ul className="space-y-2">
                {tour.exclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                    <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section>
            <h2 className="mb-3 font-semibold text-white">Место встречи</h2>
            <div className="overflow-hidden rounded-[12px] border border-slate-700 bg-slate-900/60">
              <div className="flex h-40 items-center justify-center bg-[radial-gradient(circle_at_30%_40%,rgb(6_182_212_/_0.15),transparent_50%),radial-gradient(circle_at_70%_60%,rgb(59_130_246_/_0.12),transparent_45%)]">
                <div className="text-center">
                  <MapPin className="mx-auto mb-2 h-8 w-8 text-cyan-400" />
                  <p className="text-sm text-white">{tour.meeting_point.address}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {tour.meeting_point.lat.toFixed(3)}, {tour.meeting_point.lng.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-white">
              <Calendar className="h-4 w-4 text-cyan-400" />
              Доступные даты
            </h2>
            <div className="flex flex-wrap gap-2">
              {tour.available_dates.map((date) => (
                <Badge key={date} className="border-slate-600 bg-slate-900/70 px-3 py-1.5">
                  {date}
                </Badge>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-semibold text-white">Отзывы</h2>
            <div className="space-y-3">
              {tour.reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-[12px] border border-slate-700/70 bg-slate-900/40 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white">{review.author}</p>
                    <span className="text-sm text-amber-400">★ {review.rating}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{review.comment}</p>
                  <p className="mt-2 text-xs text-slate-500">{review.date}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-700 pt-6">
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Users className="h-4 w-4" />
              Языки гида: {tour.guide_languages.join(', ')}
            </p>
            <p className="text-sm text-slate-500">{tour.cancellation_policy}</p>
            <Button type="button" className="ml-auto" onClick={bookInChat}>
              Забронировать сейчас
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoomTypesSection({ tourId }: { tourId: string }) {
  const [searchParams] = useSearchParams()
  const selectedRoom = searchParams.get('room')?.toLowerCase() ?? null
  const selectedRef = useRef<HTMLLIElement | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['tour-rooms', tourId],
    queryFn: () => getTourRooms(tourId),
    enabled: Boolean(tourId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const rooms = data?.rooms ?? []

  // If the chat sent the user here for a specific room — scroll to it.
  useEffect(() => {
    if (selectedRoom && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [selectedRoom, rooms.length])

  if (!isLoading && rooms.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-semibold text-white">
        Типы номеров
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Показаны номера, доступные по этому запросу. Чтобы увидеть больше вариантов,
        воспользуйтесь поиском вручную.
      </p>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <ul className="space-y-3">
          {rooms.map((room) => (
            <li
              key={room.room_type}
              ref={room.room_type.toLowerCase() === selectedRoom ? selectedRef : undefined}
              className={`rounded-[12px] border p-4 ${
                room.room_type.toLowerCase() === selectedRoom
                  ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-400/50'
                  : 'border-slate-700 bg-slate-900/60'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{room.room_type}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(room.meals)
                      .sort((a, b) => a[1] - b[1])
                      .map(([meal, price]) => (
                        <Badge key={meal} className="text-slate-300">
                          {mealLabel(meal)} · от {formatPrice(price, room.currency)}
                        </Badge>
                      ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {room.offers_count}{' '}
                    {room.offers_count === 1
                      ? 'предложение'
                      : room.offers_count < 5
                        ? 'предложения'
                        : 'предложений'}{' '}
                    от туроператоров
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-cyan-300">
                    от {formatPrice(room.min_price, room.currency)}
                  </p>
                  {room.booking_url ? (
                    <a
                      href={room.booking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                    >
                      Перейти к бронированию
                    </a>
                  ) : room.url ? (
                    <a
                      href={room.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm text-cyan-400 hover:underline"
                    >
                      Смотреть тур →
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
