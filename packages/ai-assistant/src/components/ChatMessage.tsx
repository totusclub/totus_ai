'use client'

import type { ChatMessage as ChatMessageType, RoomCard, Tour } from '@/types'
import { mealLabel } from '@/lib/meals'
import { formatDurationLabel, formatPrice } from '@/lib/utils'
import { hotelDetailsHrefFromTour, roomBookingHref } from '@/lib/bookingHref'
import { Badge } from '@/components/ui/badge'

const PICK_LABEL_STYLES: Record<string, string> = {
  'оптимум цена/качество': 'bg-coral text-white',
  'самая низкая цена': 'bg-ok text-white',
  'лучший рейтинг': 'bg-gold text-white',
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user'
  const hasContent = message.content.trim().length > 0

  // A message may exist only as a carrier for tool metadata (the debug block
  // is no longer rendered). Without this guard it showed up as an empty bubble.
  const hasCards =
    Boolean(message.metadata?.tour_results?.length) ||
    Boolean(message.metadata?.room_cards?.rooms?.length) ||
    Boolean(message.metadata?.destination_cards?.length) ||
    Boolean(message.metadata?.booking)
  if (!hasContent && !hasCards) return null

  return (
    <div className={`animate-fade-in-up flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-md bg-ink text-white'
            : 'rounded-bl-md border border-line bg-sand text-ink'
        }`}
      >
        {hasContent && (
          <p className="whitespace-pre-wrap">{renderAssistantText(message.content)}</p>
        )}

        {message.metadata?.tour_results && message.metadata.tour_results.length > 0 && (
          <div className={`${hasContent ? 'mt-3' : ''} space-y-2.5`}>
            {message.metadata.tour_results.map((tour) => (
              <HotelCard key={tour.id} tour={tour} />
            ))}
          </div>
        )}

        {message.metadata?.room_cards && message.metadata.room_cards.rooms.length > 0 && (
          <div className={`${hasContent ? 'mt-3' : ''}`}>
            {message.metadata.room_cards.hotel.name && (
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-sea">
                Номера · {message.metadata.room_cards.hotel.name}
              </p>
            )}
            <div className="space-y-2.5">
              {message.metadata.room_cards.rooms.map((room) => (
                <RoomCardView
                  key={room.room_type}
                  room={room}
                  hotelId={message.metadata!.room_cards!.hotel.id}
                  hotelImage={message.metadata!.room_cards!.hotel.image}
                />
              ))}
            </div>
            <p className="mt-2 rounded-lg border border-line bg-sand/70 px-2.5 py-1.5 text-[11px] leading-snug text-subtle">
              Показаны номера, доступные по этому запросу. Чтобы увидеть больше вариантов,
              воспользуйтесь поиском вручную.
            </p>
          </div>
        )}

        {message.metadata?.destination_cards && message.metadata.destination_cards.length > 0 && (
          <div className={`${hasContent ? 'mt-3' : ''} grid grid-cols-2 gap-2`}>
            {message.metadata.destination_cards.map((dest) => (
              <button
                key={dest.name}
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('assistant:send', { detail: `Найди туры: ${dest.name}` }),
                  )
                }
                className="group relative overflow-hidden rounded-xl border border-line/60 text-left transition-transform hover:scale-[1.02]"
              >
                <div className="relative h-24 w-full">
                  {dest.image ? (
                    <img
                      src={dest.image}
                      alt={dest.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-[radial-gradient(circle_at_30%_30%,rgb(255_90_60_/_0.18),transparent_60%),radial-gradient(circle_at_75%_70%,rgb(14_124_134_/_0.16),transparent_55%)] bg-sand" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2">
                    <p className="text-sm font-semibold leading-tight text-ink">
                      {dest.emoji ? `${dest.emoji} ` : ''}
                      {dest.name}
                    </p>
                    {dest.country && dest.country !== dest.name && (
                      <p className="text-[11px] text-ink/80">{dest.country}</p>
                    )}
                  </div>
                </div>
                {dest.tagline && (
                  <div className="bg-page/70 px-2 py-1.5">
                    <p className="line-clamp-2 text-[11px] leading-snug text-ink/80">
                      {dest.tagline}
                    </p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Hotel card: photo, pick label, key facts, price and a booking button that
 *  leads to room selection (the internal tour page). */
function HotelCard({ tour }: { tour: Tour }) {
  const image = tour.images?.[0]
  const labelStyle = tour.pick_label
    ? (PICK_LABEL_STYLES[tour.pick_label] ?? 'bg-paper/95 text-ink')
    : null

  return (
    <div className="overflow-hidden rounded-xl border border-line/60 bg-paper">
      <div className="relative h-32 w-full">
        {image ? (
          <img src={image} alt={tour.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_30%,rgb(14_124_134_/_0.16),transparent_60%)] bg-sand text-3xl">
            {tour.emoji}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
        {tour.pick_label && labelStyle && (
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelStyle}`}
          >
            {tour.pick_label}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="font-semibold leading-tight text-white">
            {tour.name}
            {tour.stars ? (
              <span className="ml-1 text-coral">{'★'.repeat(Math.min(tour.stars, 5))}</span>
            ) : null}
          </p>
          <p className="text-xs text-white/85">
            {tour.destination} · {formatDurationLabel(tour.duration, tour.duration_hours)}
            {tour.rating > 0 ? (
              <>
                {' · '}
                <span className="text-coral">★</span> {tour.rating}
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div>
          <p className="text-[11px] text-faint">цена за тур</p>
          <p className="font-semibold text-coral">от {formatPrice(tour.price, tour.currency)}</p>
        </div>
        <a
          href={hotelDetailsHrefFromTour(tour)}
          className="rounded-lg bg-coral px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-coral-deep"
        >
          Перейти к бронированию
        </a>
      </div>
      {tour.comment && (
        <div className="border-t border-line px-2.5 py-2">
          <p className="text-xs leading-snug text-ink/80">💬 {tour.comment}</p>
        </div>
      )}
    </div>
  )
}

/** Room card: meals with prices and a booking button. If the client's own
 *  booking platform URL is configured, the button goes there; otherwise it
 *  opens the internal tour page with this room preselected. */
function RoomCardView({
  room,
  hotelId,
  hotelImage,
}: {
  room: RoomCard
  hotelId: number
  hotelImage?: string
}) {
  const bookingHref = roomBookingHref(room, hotelId)
  const meals = Object.entries(room.meals).sort((a, b) => a[1] - b[1])

  return (
    <div className="flex gap-2.5 rounded-xl border border-line/60 bg-paper p-2.5">
      {hotelImage && (
        <img
          src={hotelImage}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight text-ink">{room.room_type}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {meals.slice(0, 3).map(([meal, price]) => (
            <Badge key={meal} className="border-line bg-sand text-[10px] text-ink/80">
              {mealLabel(meal)} · от {formatPrice(price, room.currency)}
            </Badge>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-coral">
            от {formatPrice(room.min_price, room.currency)}
          </p>
          <a
            href={bookingHref}
            className="rounded-lg bg-coral px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-coral-deep"
          >
            К бронированию
          </a>
        </div>
      </div>
    </div>
  )
}

/** Minimal safe rendering for model output: **bold** → <strong>, headers and
 *  stray markdown symbols stripped. Everything else is plain text. */
function renderAssistantText(raw: string) {
  const cleaned = raw.replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ')
  const parts = cleaned.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part.replaceAll('**', '')
    ),
  )
}
