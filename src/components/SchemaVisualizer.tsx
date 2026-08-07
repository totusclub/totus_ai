import { useMemo, useState } from 'react'
import { Database, KeyRound, Link2, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getSchema } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { SchemaTable } from '@/types'

export function SchemaVisualizer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['schema'],
    queryFn: getSchema,
    enabled: open,
  })
  const [selected, setSelected] = useState<string | null>('tours')

  const table = useMemo(
    () => data?.find((t) => t.name === selected) ?? data?.[0],
    [data, selected],
  )

  const relations = useMemo(() => {
    if (!data || !table) return []
    return table.columns
      .filter((c) => c.fk)
      .map((c) => ({ from: `${table.name}.${c.name}`, to: c.fk! }))
  }, [data, table])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-page/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-line bg-page shadow-2xl animate-fade-in-up">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] font-semibold text-ink">
              <Database className="h-4 w-4 text-sea" />
              Schema Visualizer
            </p>
            <p className="text-xs text-subtle">Admin / debug · таблицы и связи</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="grid flex-1 grid-rows-[auto_1fr] gap-4 overflow-hidden p-4">
          <div className="flex flex-wrap gap-2">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-24" />
              ))}
            {data?.map((t: SchemaTable) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setSelected(t.name)}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  table?.name === t.name
                    ? 'border-sea/50 bg-sea-soft text-sea'
                    : 'border-line bg-sand/80 text-ink/80 hover:border-faint'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto rounded-[12px] border border-line bg-sand/60 p-4">
            {table ? (
              <>
                <h3 className="mb-3 font-semibold text-ink">{table.name}</h3>
                <ul className="space-y-2">
                  {table.columns.map((col) => (
                    <li
                      key={col.name}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-page/50 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {col.pk && <KeyRound className="h-3.5 w-3.5 text-gold" />}
                        {col.fk && <Link2 className="h-3.5 w-3.5 text-sea" />}
                        <span className="font-medium text-ink">{col.name}</span>
                      </div>
                      <div className="text-right text-xs text-subtle">
                        <span>{col.type}</span>
                        {col.pk && <span className="ml-2 text-gold">PK</span>}
                        {col.fk && <span className="ml-2 text-sea">FK → {col.fk}</span>}
                        {col.nullable && <span className="ml-2 text-faint">null</span>}
                      </div>
                    </li>
                  ))}
                </ul>

                {relations.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs uppercase tracking-wide text-faint">
                      Связи
                    </p>
                    <div className="space-y-2">
                      {relations.map((r) => (
                        <div
                          key={r.from}
                          className="flex items-center gap-2 rounded-lg border border-sea/20 bg-sea-soft px-3 py-2 text-xs text-sea"
                        >
                          <span>{r.from}</span>
                          <span className="text-faint">───</span>
                          <span>{r.to}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Skeleton className="h-48 w-full" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
