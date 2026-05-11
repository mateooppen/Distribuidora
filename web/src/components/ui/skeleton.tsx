/**
 * Skeleton loader reutilizable.
 *
 * Bloque animado con pulse usando los tokens del proyecto. Esquinas rectas,
 * sin radius — coherente con el lenguaje de "consola interna".
 *
 * Variantes recomendadas:
 *   <Skeleton className="h-4 w-32" />           texto chico (label)
 *   <Skeleton className="h-6 w-24" />           texto medio (valor numérico)
 *   <Skeleton className="h-10 w-full" />        input / botón
 *   <Skeleton className="h-12 w-12" />          ícono / avatar
 */

import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {}

export function Skeleton({ className, style, ...props }: SkeletonProps) {
  return (
    <span
      className={cn('inline-block animate-pulse align-middle', className)}
      style={{
        background: 'hsl(var(--bg-surface-raised))',
        ...style,
      }}
      {...props}
    />
  )
}
