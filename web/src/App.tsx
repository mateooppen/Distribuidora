import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { ProductosPage } from '@/pages/ProductosPage'
import { MarcasPage } from '@/pages/MarcasPage'
import { cn } from '@/lib/utils'

function NavBar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'px-3 py-2 text-sm font-medium rounded-md transition-colors',
      isActive
        ? 'bg-foreground text-background'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
    )

  return (
    <nav className="border-b bg-background sticky top-0 z-40">
      <div className="container mx-auto px-4 max-w-[1400px] h-14 flex items-center gap-2">
        <div className="font-semibold text-lg mr-4">
          LIALG <span className="text-muted-foreground font-normal text-sm">— sin TACC</span>
        </div>
        <NavLink to="/" end className={linkClass}>
          Productos
        </NavLink>
        <NavLink to="/marcas" className={linkClass}>
          Marcas
        </NavLink>
      </div>
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<ProductosPage />} />
        <Route path="/marcas" element={<MarcasPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
