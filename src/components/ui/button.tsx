import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Button variants aligned to the Shillak design system.
 *
 * default    — primary CTA: amber/saffron fill, black text
 * secondary  — secondary action: surface-2 fill, primary text
 * ghost      — no background, subtle hover
 * destructive — danger tint
 * outline    — bordered, no fill
 * link       — accent underline
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-medium cursor-pointer transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-black hover:bg-accent-hover active:bg-accent',
        secondary: 'bg-surface-2 text-text-primary hover:bg-surface-3',
        ghost: 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
        destructive: 'bg-danger/10 text-danger hover:bg-danger/20',
        outline: 'border border-border bg-transparent text-text-primary hover:bg-surface-2',
        link: 'text-accent underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-lg',
        default: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-sm',
        xl: 'h-14 px-6 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
