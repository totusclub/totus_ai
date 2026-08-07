import type { Tour } from '@/types'
import { TourCard } from '@/components/TourCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Map } from 'lucide-react'

export function TourGrid({
  tours,
  isLoading,
}: {
  tours?: Tour[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-[12px] border border-slate-700/60">
            <Skeleton className="h-40 w-full rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!tours?.length) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[12px] border border-dashed border-slate-700 bg-slate-800/30 px-6 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 text-cyan-400">
          <Map className="h-10 w-10" />
        </div>
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-white">
          Туры не найдены
        </h3>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          Измените фильтры или спросите ассистента в чате — он поможет подобрать варианты шаг за
          шагом.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tours.map((tour) => (
        <TourCard key={tour.id} tour={tour} />
      ))}
    </div>
  )
}
