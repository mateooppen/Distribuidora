import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, type CategoriaNode } from '@/lib/api'

function TotalesHeader() {
  const { data } = useQuery({
    queryKey: ['dashboard-resumen'],
    queryFn: api.dashboardResumen,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {[
        { label: 'Productos', value: data?.productos },
        { label: 'Marcas', value: data?.marcas },
        { label: 'Categorías', value: data?.categorias },
      ].map(({ label, value }) => (
        <div key={label} className="bg-card border border-border rounded-lg px-5 py-3 flex flex-col min-w-[120px]">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {value !== undefined ? value.toLocaleString('es-AR') : '—'}
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</span>
        </div>
      ))}
    </div>
  )
}

function BusquedaRapida() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (trimmed) navigate(`/productos?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-md mb-10">
      <Input
        type="search"
        placeholder="Buscar productos…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <Button type="submit" disabled={!q.trim()}>
        Buscar
      </Button>
    </form>
  )
}

function TopMarcas() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['filtros-marcas-top'],
    queryFn: () => api.filtrosMarcas('', 15),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Top marcas</h2>
      <ul className="space-y-1">
        {data?.data.map((m) => (
          <li key={m.id_marca}>
            <button
              onClick={() => navigate(`/productos?marca=${m.id_marca}`)}
              className="flex justify-between w-full text-sm text-left px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              <span className="truncate">{m.nombre_marca}</span>
              <span className="text-muted-foreground ml-3 tabular-nums shrink-0">
                {m.total_productos.toLocaleString('es-AR')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoriaCard({ nodo }: { nodo: CategoriaNode }) {
  const navigate = useNavigate()

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/40 transition-colors">
      <button
        onClick={() => navigate(`/productos?categoria=${nodo.slug}`)}
        className="flex justify-between items-baseline w-full mb-3 text-left group"
      >
        <span className="font-semibold text-sm group-hover:text-primary transition-colors">
          {nodo.nombre}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums ml-2 shrink-0">
          {nodo.total_productos.toLocaleString('es-AR')}
        </span>
      </button>
      {nodo.hijos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {nodo.hijos.map((hijo) => (
            <button
              key={hijo.id_categoria}
              onClick={() => navigate(`/productos?categoria=${hijo.slug}`)}
              className="text-xs px-2 py-0.5 rounded-full bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground transition-colors"
            >
              {hijo.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CategoriasGrid() {
  const { data } = useQuery({
    queryKey: ['dashboard-categorias'],
    queryFn: api.dashboardCategoriasJerarquia,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Categorías</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data?.data.map((nodo) => (
          <CategoriaCard key={nodo.id_categoria} nodo={nodo} />
        ))}
      </div>
    </div>
  )
}

export function HomePage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-[1400px]">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Productos certificados sin TACC
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Listado LIALG — ANMAT Argentina
        </p>
      </header>

      <TotalesHeader />
      <BusquedaRapida />

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">
        <TopMarcas />
        <CategoriasGrid />
      </div>
    </div>
  )
}
