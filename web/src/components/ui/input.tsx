import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Defaults consistentes con el proyecto: sin radius, borde recto.
          // Cada instancia puede sobreescribir con className y style.
          "flex h-10 w-full border px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors",
          className,
        )}
        style={{
          background: 'hsl(var(--bg-surface))',
          borderColor: 'hsl(var(--border-default))',
          borderRadius: 0,
          color: 'hsl(var(--text-primary))',
          ...style,
        }}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
