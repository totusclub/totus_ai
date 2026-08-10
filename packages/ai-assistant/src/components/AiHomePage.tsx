'use client'

import { Database, Sparkles, MessageCircle } from 'lucide-react'
import { TourGrid } from '@/components/TourGrid'
import { SchemaVisualizer } from '@/components/SchemaVisualizer'
import { Button } from '@/components/ui/button'
import { useAssistantStore } from '@/stores/assistantStore'

export function AiHomePage() {
  const highlightedTours = useAssistantStore((s) => s.highlightedTours)
  const isTyping = useAssistantStore((s) => s.isTyping)
  const showSchema = useAssistantStore((s) => s.showSchema)
  const setShowSchema = useAssistantStore((s) => s.setShowSchema)
  const setOpen = useAssistantStore((s) => s.setOpen)

  const hasTours = highlightedTours.length > 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-sea/80">
            Тотус клуб
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Подбор туров с Милой
          </h1>
          <p className="mt-2 max-w-xl text-subtle">
            Опишите отдых в чате — Мила подберёт туры и покажет их здесь со ссылками.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setShowSchema(true)}>
            <Database className="h-4 w-4" />
            Schema
          </Button>
          <Button type="button" onClick={() => setOpen(true)}>
            <Sparkles className="h-4 w-4" />
            Открыть ассистента
          </Button>
        </div>
      </header>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-subtle">
            {isTyping
              ? 'Мила подбирает туры…'
              : hasTours
                ? `Мила нашла: ${highlightedTours.length} ${plural(highlightedTours.length)}`
                : 'Пока пусто — спросите Милу в чате'}
          </p>
        </div>

        {hasTours || isTyping ? (
          <TourGrid tours={highlightedTours} isLoading={isTyping && !hasTours} />
        ) : (
          <EmptyState onOpen={() => setOpen(true)} />
        )}
      </section>

      <SchemaVisualizer open={showSchema} onClose={() => setShowSchema(false)} />
    </div>
  )
}

function plural(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'тур'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'тура'
  return 'туров'
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[12px] border border-dashed border-line bg-sand/30 px-6 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-page text-sea">
        <MessageCircle className="h-10 w-10" />
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
        Спросите Милу
      </h3>
      <p className="mt-2 max-w-md text-sm text-subtle">
        Например: «Турция в конце августа, двое взрослых и ребёнок 5 лет, всё включено, песчаный
        пляж». Мила найдёт туры и покажет их здесь.
      </p>
      <Button type="button" className="mt-5" onClick={onOpen}>
        <Sparkles className="h-4 w-4" />
        Открыть чат
      </Button>
    </div>
  )
}
