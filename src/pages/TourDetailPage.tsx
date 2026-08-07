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
        <p className="text-lg text-ink">Тур не найден</p>
        <Link to="/" className="mt-4 inline-block text-sea hover:underline">
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
        className="mb-6 inline-flex items-center gap-2 text-sm text-subtle transition hover:text-coral"
      >
        <ArrowLeft className="h-4 w-4" />
        Все туры
      </Link>

      <div className="overflow-hidden rounded-[12px] border border-line bg-paper backdrop-blur-md">
        <div className="relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br from-sand via-page to-sea-soft sm:h-64">
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
              <Badge className="mb-2 border-line bg-sea-soft text-sea">
                {categoryLabel}
              </Badge>
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink">
                {tour.name}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-subtle">
                <MapPin className="h-4 w-4 text-sea" />
                {tour.destination} · {tour.duration} · до {tour.max_group_size} чел.
              </p>
              <p className="mt-1 text-gold">
                ★ {tour.rating} ({tour.review_count} отзывов)
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-3xl font-semibold text-coral">
                {formatPrice(tour.price, tour.currency)}
              </p>
              <p className="text-sm text-faint">за человека</p>
              <Button type="button" className="mt-3 w-full sm:w-auto" onClick={bookInChat}>
                Забронировать
              </Button>
            </div>
          </div>

          <p className="leading-relaxed text-ink/80">{tour.description}</p>

          <section>
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
              Программа
            </h2>
            <ol className="relative space-y-0 border-l border-line pl-6">
              {tour.itinerary.map((item, idx) => (
                <li key={idx} className="relative pb-6 last:pb-0">
                  <span className="absolute -left-[1.9rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-sea/50 bg-paper">
                    <span className="h-1.5 w-1.5 rounded-full bg-coral" />
                  </span>
                  <p className="text-xs font-medium uppercase tracking-wide text-sea">
                    {item.time}
                  </p>
                  <p className="mt-1 font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-sm text-subtle">{item.description}</p>
                </li>
              ))}
            </ol>
          </section>

          <RoomTypesSection tourId={tour.id} />

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="mb-3 font-semibold text-ink">Включено</h2>
              <ul className="space-y-2">
                {tour.inclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink/80">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-3 font-semibold text-ink">Не включено</h2>
              <ul className="space-y-2">
                {tour.exclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink/80">
                    <XIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section>
            <h2 className="mb-3 font-semibold text-ink">Место встречи</h2>
            <div className="overflow-hidden rounded-[12px] border border-line bg-paper">
              <div className="flex h-40 items-center justify-center bg-[radial-gradient(circle_at_30%_40%,rgb(255_90_60_/_0.12),transparent_50%),radial-gradient(circle_at_70%_60%,rgb(14_124_134_/_0.12),transparent_45%)]">
                <div className="text-center">
                  <MapPin className="mx-auto mb-2 h-8 w-8 text-sea" />
                  <p className="text-sm text-ink">{tour.meeting_point.address}</p>
                  <p className="mt-1 text-xs text-faint">
                    {tour.meeting_point.lat.toFixed(3)}, {tour.meeting_point.lng.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
              <Calendar className="h-4 w-4 text-sea" />
              Доступные даты
            </h2>
            <div className="flex flex-wrap gap-2">
              {tour.available_dates.map((date) => (
                <Badge key={date} className="border-line bg-page/70 px-3 py-1.5">
                  {date}
                </Badge>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-semibold text-ink">Отзывы</h2>
            <div className="space-y-3">
              {tour.reviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-[12px] border border-line bg-sand/70 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-ink">{review.author}</p>
                    <span className="text-sm text-gold">★ {review.rating}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink/80">{review.comment}</p>
                  <p className="mt-2 text-xs text-faint">{review.date}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
            <p className="flex items-center gap-2 text-sm text-subtle">
              <Users className="h-4 w-4" />
              Языки гида: {tour.guide_languages.join(', ')}
            </p>
            <p className="text-sm text-faint">{tour.cancellation_policy}</p>
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
      <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
        Типы номеров
      </h2>
      <p className="mb-4 text-sm text-faint">
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
                  ? 'border-sea bg-sea-soft ring-1 ring-sea/40'
                  : 'border-line bg-paper'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{room.room_type}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(room.meals)
                      .sort((a, b) => a[1] - b[1])
                      .map(([meal, price]) => (
                        <Badge key={meal} className="text-ink/80">
                          {mealLabel(meal)} · от {formatPrice(price, room.currency)}
                        </Badge>
                      ))}
                  </div>
                  <p className="mt-2 text-xs text-faint">
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
                  <p className="text-lg font-semibold text-coral">
                    от {formatPrice(room.min_price, room.currency)}
                  </p>
                  {room.booking_url ? (
                    <a
                      href={room.booking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block rounded-lg bg-coral px-3 py-1.5 text-sm font-semibold text-white hover:bg-coral-deep"
                    >
                      Перейти к бронированию
                    </a>
                  ) : room.url ? (
                    <a
                      href={room.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm text-sea hover:underline"
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
