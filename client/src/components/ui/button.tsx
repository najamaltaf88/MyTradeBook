import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
  {
    variants: {
      variant: {
        default:
          "border border-primary/30 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[0_16px_40px_hsl(var(--primary)/0.28)]",
        destructive:
          "border border-destructive/30 bg-[image:var(--gradient-danger)] text-destructive-foreground shadow-[0_16px_40px_hsl(var(--destructive)/0.26)]",
        outline:
          "border border-border bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "border border-border bg-secondary text-secondary-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
        ghost: "border border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        success: "border border-emerald-400/25 bg-[image:var(--gradient-success)] text-white shadow-[0_16px_40px_rgba(16,185,129,0.26)]",
        glass: "border border-border bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "min-h-10 px-4 py-2.5",
        sm: "min-h-8 rounded-lg px-3 text-xs",
        lg: "min-h-11 rounded-2xl px-8 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
