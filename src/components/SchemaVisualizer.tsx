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
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-700 bg-slate-900 shadow-2xl animate-fade-in-up">
        <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div>
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] font-semibold text-white">
              <Database className="h-4 w-4 text-cyan-400" />
              Schema Visualizer
            </p>
            <p className="text-xs text-slate-400">Admin / debug · таблицы и связи</p>
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
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                    : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto rounded-[12px] border border-slate-700 bg-slate-800/40 p-4">
            {table ? (
              <>
                <h3 className="mb-3 font-semibold text-white">{table.name}</h3>
                <ul className="space-y-2">
                  {table.columns.map((col) => (
                    <li
                      key={col.name}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/50 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {col.pk && <KeyRound className="h-3.5 w-3.5 text-amber-400" />}
                        {col.fk && <Link2 className="h-3.5 w-3.5 text-blue-400" />}
                        <span className="font-medium text-white">{col.name}</span>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <span>{col.type}</span>
                        {col.pk && <span className="ml-2 text-amber-400">PK</span>}
                        {col.fk && <span className="ml-2 text-blue-400">FK → {col.fk}</span>}
                        {col.nullable && <span className="ml-2 text-slate-500">null</span>}
                      </div>
                    </li>
                  ))}
                </ul>

                {relations.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                      Связи
                    </p>
                    <div className="space-y-2">
                      {relations.map((r) => (
                        <div
                          key={r.from}
                          className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-200"
                        >
                          <span>{r.from}</span>
                          <span className="text-slate-500">───</span>
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
