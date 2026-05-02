import { useEffect, useState } from 'react'

/**
 * Devuelve `value` retrasado `ms` milisegundos. Cada vez que `value`
 * cambia se reinicia el timer. Útil para inputs de búsqueda.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])

  return debounced
}
