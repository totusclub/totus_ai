import * as React from 'react'
import { cn } from '@/lib/utils'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[44px] max-h-32 w-full resize-none rounded-xl border border-line bg-paper/70 px-3 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition focus:border-coral/60 focus:ring-2 focus:ring-coral/20',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
