import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { ProductosPage } from '@/pages/ProductosPage'
import { MarcasPage } from '@/pages/MarcasPage'
import { cn } from '@/lib/utils'

// ── Theme ─────────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark'

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('lialg-theme')
    return (stored === 'dark' || stored === 'light') ? stored : 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('lialg-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light')
  return [theme, toggle]
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  )
}

// ── NavBar ────────────────────────────────────────────────────────────────────

function NavBar({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative px-1 py-1 text-sm font-medium transition-colors whitespace-nowrap',
      'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:transition-all',
      isActive
        ? 'text-foreground after:bg-primary'
        : 'text-muted-foreground hover:text-foreground after:bg-transparent',
    )

  return (
    <header
      className="sticky top-0 z-40"
      style={{ borderBottom: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--bg-surface))' }}
    >
      {/*
       * Layout: en desktop el nav va centrado absoluto y el toggle a la derecha.
       * En mobile (< sm) el nav fluye a continuación del logo (gap reducido) y
       * el toggle queda al final. Sin posicionamiento absoluto en mobile para
       * evitar que los links se monten sobre el logo en pantallas chicas.
       */}
      <div className="relative mx-auto px-4 sm:px-6 max-w-[1400px] h-14 flex items-center gap-3 sm:gap-0">

        {/* Logotipo — izquierda */}
        <div className="flex items-baseline gap-1 select-none shrink-0">
          <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground leading-none">
            San Felipa
          </span>
          {/* /sin-tacc se oculta en mobile chico para liberar espacio */}
          <span className="hidden xs:inline font-mono text-[13px] font-normal text-muted-foreground/60 leading-none">
            /sin-tacc
          </span>
        </div>

        {/*
         * Nav — centro absoluto en desktop, flujo normal en mobile.
         * sm:absolute sm:left-1/2 sm:-translate-x-1/2 activa el centrado solo
         * desde sm (≥640px) hacia arriba.
         */}
        <nav className="flex items-center gap-3 sm:gap-6 sm:absolute sm:left-1/2 sm:-translate-x-1/2 overflow-x-auto">
          <NavLink to="/" end className={linkClass}>Inicio</NavLink>
          <NavLink to="/productos" className={linkClass}>Productos</NavLink>
          <NavLink to="/marcas" className={linkClass}>Marcas</NavLink>
        </nav>

        {/* Toggle tema — derecha */}
        <div className="ml-auto shrink-0">
          <button
            onClick={onToggleTheme}
            className={cn(
              'p-2 rounded-md transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
            aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
            title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>

      </div>
    </header>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [theme, toggleTheme] = useTheme()

  return (
    <BrowserRouter>
      <div className="min-h-screen" style={{ background: 'hsl(var(--bg-base))' }}>
        <NavBar theme={theme} onToggleTheme={toggleTheme} />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/productos" element={<ProductosPage />} />
            <Route path="/marcas" element={<MarcasPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
