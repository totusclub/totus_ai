import { Link } from 'react-router-dom'
import { Clock, MapPin } from 'lucide-react'
import type { Tour } from '@/types'
import { formatPrice } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function TourCard({ tour }: { tour: Tour }) {
  const image = tour.images[0]

  return (
    <article className="group flex flex-col overflow-hidden rounded-[12px] border border-slate-700/70 bg-slate-800/60 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:shadow-[0_12px_40px_rgb(6_182_212_/_0.15)]">
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-cyan-950/50">
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
        <Badge className="absolute left-3 top-3 border-cyan-500/20 bg-slate-950/70 text-cyan-200">
          Тотус клуб
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
            {tour.name}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
            <MapPin className="h-3.5 w-3.5 text-cyan-400" />
            {tour.destination}
          </p>
        </div>

        <p className="line-clamp-2 text-sm text-slate-400">{tour.description}</p>

        <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {tour.duration}
          </span>
          {tour.stars ? <span>{tour.stars}★</span> : null}
          {tour.rating > 0 && (
            <span className="text-amber-400">
              ★ {tour.rating}
              {tour.review_count ? ` · ${tour.review_count}` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-lg font-semibold text-cyan-300">
            {formatPrice(tour.price, tour.currency)}
            <span className="ml-1 text-xs font-normal text-slate-500">от</span>
          </p>
          <Link
            to={`/tours/${tour.id}`}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/40 px-3 text-xs font-medium text-white transition hover:border-cyan-500/50 hover:bg-slate-800"
          >
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  )
}
