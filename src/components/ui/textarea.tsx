import * as React from 'react'
import { cn } from '@/lib/utils'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[44px] max-h-32 w-full resize-none rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
