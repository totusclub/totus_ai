import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-btn)] text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-0 bg-coral text-white hover:bg-coral-deep shadow-[0_8px_20px_rgb(255_90_60_/_0.28)] hover:shadow-[0_10px_26px_rgb(255_90_60_/_0.36)]',
        secondary: 'border-0 bg-sea text-white hover:bg-[#0a6a73]',
        outline:
          'border border-solid border-line bg-paper text-ink hover:border-coral/60 hover:text-coral',
        ghost: 'border-0 bg-transparent text-subtle hover:bg-sand hover:text-ink',
        danger: 'border-0 bg-danger text-white hover:bg-[#c13424]',
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
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
