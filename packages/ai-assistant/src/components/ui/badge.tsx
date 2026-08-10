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
        'inline-flex items-center rounded-lg border border-line bg-paper/90 px-2 py-0.5 text-xs font-medium text-ink',
        className,
      )}
    >
      {children}
    </span>
  )
}
