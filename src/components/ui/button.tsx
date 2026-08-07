import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[16px] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_20px_rgb(6_182_212_/_0.25)] hover:shadow-[0_0_28px_rgb(6_182_212_/_0.4)]',
        secondary: 'bg-blue-500 text-white hover:bg-blue-400',
        outline:
          'border border-slate-700 bg-slate-800/40 text-white hover:border-cyan-500/50 hover:bg-slate-800',
        ghost: 'text-slate-300 hover:bg-slate-800 hover:text-white',
        danger: 'bg-red-500/90 text-white hover:bg-red-500',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 rounded-xl px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
)
Button.displayName = 'Button'
