import { cn } from '@/lib/utils'

export function Badge({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs text-slate-300',
        className,
      )}
    >
      {children}
    </span>
  )
}
