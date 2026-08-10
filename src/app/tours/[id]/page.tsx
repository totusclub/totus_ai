'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { AiTourDetailPage } from '@tosmedia/ai-assistant'

export default function TourDetailRoute() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-8 text-sm text-gray-500">Загрузка…</div>}>
      <TourDetailInner />
    </Suspense>
  )
}

function TourDetailInner() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const tourId = params?.id ?? ''
  const selectedRoom = searchParams.get('room')

  return <AiTourDetailPage tourId={tourId} selectedRoom={selectedRoom} />
}
