'use client'

import { Clock, MapPin } from 'lucide-react'
import type { Tour } from '@/types'
import { hotelDetailsHrefFromTour } from '@/lib/bookingHref'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function TourCard({ tour }: { tour: Tour }) {
  const image = tour.images[0]

  return (
    <article className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper shadow-card transition duration-300 hover:-translate-y-1 hover:border-coral/50 hover:shadow-pop">
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-sand via-page to-sea-soft">
        {image ? (
          <img
            src={image}
            alt={tour.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <span className="text-6xl transition duration-300 group-hover:scale-110">{tour.emoji}</span>
        )}
        <Badge className="absolute left-3 top-3 border-transparent bg-paper/90 text-ink shadow-card">
          Тотус клуб
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink">
            {tour.name}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-subtle">
            <MapPin className="h-3.5 w-3.5 text-sea" />
            {tour.destination}
          </p>
        </div>

        <p className="line-clamp-2 text-sm text-subtle">{tour.description}</p>

        <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-subtle">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {tour.duration}
          </span>
          {tour.stars ? <span>{tour.stars}★</span> : null}
          {tour.rating > 0 && (
            <span className="text-gold">
              ★ {tour.rating}
              {tour.review_count ? ` · ${tour.review_count}` : ''}
            </span>
          )}
        </div>

      </div>

      {/* Отрывной корешок билета: перфорация с вырезами, цена и действие */}
      <div className="ticket-stub relative mt-auto flex items-center justify-between gap-3 px-4 py-3">
        <span className="ticket-notch-top" aria-hidden />
        <span className="ticket-notch-bottom" aria-hidden />
        <p className="text-lg font-bold tabular-nums text-ink">
          <span className="mr-1 text-xs font-normal text-faint">от</span>
          {formatPrice(tour.price, tour.currency)}
        </p>
        <a
          href={hotelDetailsHrefFromTour(tour)}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-coral px-4 text-xs font-semibold text-white shadow-[0_6px_16px_rgb(255_90_60_/_0.3)] transition hover:bg-coral-deep"
        >
          Подробнее
        </a>
      </div>
    </article>
  )
}
