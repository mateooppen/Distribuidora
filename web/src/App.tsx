import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { ProductosPage } from '@/pages/ProductosPage'
import { MarcasPage } from '@/pages/MarcasPage'
import { cn } from '@/lib/utils'

function NavBar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'px-4 py-2 text-sm font-medium rounded-md transition-colors',
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent',
    )

  return (
    <nav className="border-b border-border bg-card sticky top-0 z-40">
      <div className="container mx-auto px-6 max-w-[1400px] h-14 flex items-center gap-2">
        <div className="mr-6">
          <span className="font-semibold text-base text-foreground tracking-tight">LIALG</span>
          <span className="text-muted-foreground font-normal text-sm ml-2">sin TACC</span>
        </div>
        <NavLink to="/" end className={linkClass}>Inicio</NavLink>
        <NavLink to="/productos" className={linkClass}>Productos</NavLink>
        <NavLink to="/marcas" className={linkClass}>Marcas</NavLink>
      </div>
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/productos" element={<ProductosPage />} />
        <Route path="/marcas" element={<MarcasPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
