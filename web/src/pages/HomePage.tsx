import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuracion(seg: number | null): string {
  if (seg === null) return '—'
  if (seg < 60) return `${seg.toFixed(0)}s`
  return `${Math.floor(seg / 60)}m ${Math.round(seg % 60)}s`
}


function SyncStatus() {
  const queryClient = useQueryClient()
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [token, setToken] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.syncStatus(),
    refetchInterval: (query) => query.state.data?.en_curso ? 10_000 : 60_000,
  })

  const mutation = useMutation({
    mutationFn: () => api.triggerUpdate(token),
    onSuccess: (res) => {
      setMensaje(res.mensaje)
      setShowTokenInput(false)
      setTokenInput('')
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['sync-status'] })
      }, 2000)
    },
    onError: (err: Error) => setMensaje(`Error: ${err.message}`),
  })

  const ultimo = data?.ultimo_run ?? null

  const handleDispararUpdate = () => {
    const t = tokenInput.trim()
    if (!t) return
    setToken(t)
    mutation.mutate()
  }

  const estadoColor =
    ultimo?.estado === 'ok' ? 'text-green-500' :
    ultimo?.estado === 'error' ? 'text-red-500' :
    ultimo?.estado === 'en_curso' ? 'text-yellow-500' :
    'text-muted-foreground'

  const estadoLabel =
    data?.en_curso ? 'En curso...' :
    ultimo?.estado === 'ok' ? 'Exitoso' :
    ultimo?.estado === 'error' ? 'Error' :
    'Sin datos'

  return (
    <div className="bg-card border border-border rounded-lg p-4 w-full max-w-sm ml-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Sincronización ANMAT</h2>
        {data?.en_curso && (
          <span className="text-xs text-yellow-500 font-medium">⏳ En curso</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando...</p>
      ) : ultimo ? (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estado</span>
            <span className={`font-medium ${estadoColor}`}>{estadoLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fecha</span>
            <span>{formatFecha(ultimo.iniciado_en)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duración</span>
            <span>{formatDuracion(ultimo.duracion_seg)}</span>
          </div>
          {ultimo.productos_nuevos !== null && ultimo.productos_nuevos > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Productos nuevos</span>
              <span>+{ultimo.productos_nuevos}</span>
            </div>
          )}
          {ultimo.error_mensaje && (
            <p className="text-red-400 pt-1">{ultimo.error_mensaje}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sin ejecuciones registradas.</p>
      )}

      {mensaje && (
        <p className="text-xs text-muted-foreground mt-2">{mensaje}</p>
      )}

      <div className="mt-3 space-y-2">
        {showTokenInput ? (
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Token de administración"
              value={tokenInput}
              className="h-7 text-xs"
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDispararUpdate()}
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 text-xs px-2"
              onClick={handleDispararUpdate}
              disabled={!tokenInput.trim() || mutation.isPending}
            >
              {mutation.isPending ? '...' : 'Confirmar'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              onClick={() => { setShowTokenInput(false); setTokenInput('') }}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs w-full"
            onClick={() => { setShowTokenInput(true); setMensaje(null) }}
            disabled={!!data?.en_curso}
          >
            Actualizar ahora
          </Button>
        )}
      </div>
    </div>
  )
}

export function HomePage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
        <div>
          <header className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Productos certificados sin TACC
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Listado LIALG — ANMAT Argentina
            </p>
          </header>
          <TotalesHeader />
          <BusquedaRapida />
        </div>
        <SyncStatus />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">
        <TopMarcas />
        <CategoriasGrid />
      </div>
    </div>
  )
}
