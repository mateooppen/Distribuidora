import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combina clases de Tailwind resolviendo conflictos.
 * Helper estándar de shadcn/ui — todos los componentes lo usan.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
