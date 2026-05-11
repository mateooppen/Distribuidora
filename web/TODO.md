# TODO — Deudas técnicas del frontend

Pendientes conocidos del dashboard LIALG. Cada item describe qué falta, por
qué quedó pendiente, y cómo abordarlo cuando se retome.

---

## Deuda visual / UX

### Strings técnicos sin formatear de cara al usuario

Hay varios lugares donde valores enum del backend se renderizan crudos en la
UI. El usuario final ve `desconocida`, `baja_provisoria`, `RNPA`, etc.

- **`ProductoDetalle` → Presentaciones → campo "Disponibilidad"**
  Valores crudos: `disponible | discontinuada | estacional | desconocida`.
  Formatear a "Disponible", "Discontinuada", "Estacional", "Desconocida".
  Archivo: `src/components/ProductoDetalle.tsx`

- **`ProductoDetalle` → Presentaciones → campo "Formato"**
  Valores crudos: `paquete | frasco | sachet | display | caja | botella | lata | bolsa | blister | otro`.
  Aplicar capitalización consistente.
  Archivo: `src/components/ProductoDetalle.tsx`

- **`ProductoDetalle` → campo "Tipo de registro" (si llega a mostrarse)**
  Valores: `RNPA | SENASA | INV`. Hoy se muestra solo el `numero_registro`,
  pero si en el futuro se agrega el tipo, definir mapeo a labels humanos.

### Mensajes de error genéricos

Los `catch` actuales muestran `Error: ${err.message}` directo del backend o
"desconocido" como fallback. Falta:

- Mapear errores HTTP comunes (404, 500, network) a mensajes accionables.
- Diferenciar "error de red" (probar de nuevo) vs "error de la API" (avisar).
- Archivos afectados: `src/pages/ProductosPage.tsx`, `src/pages/MarcasPage.tsx`,
  `src/components/ProductoDetalle.tsx`, `src/pages/HomePage.tsx` (SyncCard).

### Empty states del panel de detalle

Las secciones Presentaciones, Aptitudes e Historial usan `EmptyState` con texto
italic muy seco ("no hay presentaciones cargadas"). Las tablas (Productos/Marcas)
ya tienen un empty state enriquecido con glifo `∅` + título + sugerencia.
Aplicar el mismo patrón en el panel.
Archivo: `src/components/ProductoDetalle.tsx`

---

## Datos faltantes en el backend

### KPI cards de la home — delta y sparkline

Las cards de Productos/Marcas/Categorías tienen espacio reservado para mostrar:

1. **Delta** respecto al período anterior (ej: "Δ +312 mes").
   - Comentario inline en `src/pages/HomePage.tsx` línea ~88.
   - Dato esperado: `{ valor: number, periodo: 'día' | 'semana' | 'mes' }`.
   - Bloquea: el endpoint `/api/dashboard/resumen` solo devuelve totales actuales.
     Necesita historizar conteos diarios/semanales o agregar `created_at` queries.

2. **Sparkline** de tendencia.
   - Comentario inline en `src/pages/HomePage.tsx` línea ~91.
   - Dato esperado: `number[]` (últimos N períodos).
   - Bloquea: mismo issue que delta — sin historización no hay serie.

### KPI card "Productos vigentes"

Originalmente se pidió agregar una cuarta KPI con cantidad/% de productos
vigentes. No se implementó porque `/api/dashboard/resumen` no expone breakdown
por `estado_certificacion`. Cuando esté disponible:

- Agregar `vigentes: number` al response del endpoint.
- Agregar `<KpiCard label="total vigentes" .../>` con su propio accentVar (sugiero `--kpi-sync` o uno nuevo verde).
- Archivo: `src/pages/HomePage.tsx` (sección KPIs).

### Filtro de estado en /productos

El listado actualmente fuerza `estado: 'vigente'` en `ProductosPage.tsx`. La
columna "Estado" original de la tabla se eliminó porque era siempre la misma.
Si en el futuro se expone como filtro:

- Reactivar la columna "Estado" con el badge semántico (código está versionado
  pero fue eliminado — recuperar de git history).
- Agregar `<Select>` de estado en `Filtros.tsx`.

---

## Componentes shadcn sin "limpiar"

### Overrides redundantes en instancias de `<Input>` y `<Select>`

Después del sweep de componentes UI, los defaults del `Input` y `SelectTrigger`
ya aplican `borderRadius: 0` y `borderColor: 'hsl(var(--border-default))'`.
Sin embargo, muchas instancias siguen pasando esos estilos explícitamente vía
`style={{ borderRadius: 0, borderColor: ... }}`.

No están rotos, pero son ruido visual en el código. Limpieza segura cuando se
tenga tiempo. Archivos con overrides:
- `src/components/Filtros.tsx`
- `src/components/MarcaCombobox.tsx`
- `src/components/MarcasTable.tsx`
- `src/components/ProductosTable.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/MarcasPage.tsx`

### `Button` de shadcn no estilizado

El componente `src/components/ui/button.tsx` sigue con los defaults de shadcn
(rounded-md, fondo primary, etc.). En el rediseño se reemplazó por `<button>`
nativo en todos los usos visibles (paginación, toggle de tema, panel sync, etc.).

Opciones cuando se retome:
1. Redefinir variantes del Button para que apliquen el sistema (borde recto,
   mono, hover con `--bg-surface-raised`). Cualquier consumidor nuevo lo hereda.
2. Eliminar el componente si confirmamos que ningún lugar lo usa más.

---

## Mejoras no críticas

### Accesibilidad / mobile — items que faltan

Ya hecho: focus visible global con anillo de acento, navbar responsive,
headers de página con tamaños y paddings ajustados a mobile, contador
de resultados inline en mobile.

Pendiente:
- **Tablas a 375px**: a ese ancho `<table>` necesita scroll horizontal porque
  las columnas no se acomodan. Hoy ya hace overflow-auto, pero el header del
  scroll no es obvio. Considerar tarjetas en lugar de tabla en mobile, o
  indicador visual de que se puede scrollear.
- **Contraste**: validar `--text-muted` sobre `--bg-surface-raised` (sobre todo
  en dark mode, donde la diferencia es chica). Probar con la herramienta de
  contrast checker del DevTools.
- **MarcaCombobox por teclado**: validar que Enter selecciona, Escape cierra,
  flechas mueven foco. Radix maneja la mayoría, pero confirmar con teclado real.
- **Header del detalle a 375px**: el botón `×` y el kicker `$ detalle del
  producto` entran, pero el título largo puede solaparse con el `×`. Validar
  con productos de nombre largo.

### Estados de carga restantes

El sweep de skeletons cubrió KPIs, SyncCard, Top marcas, Categorías, tablas y
panel de detalle. Faltó:
- **MarcaCombobox dropdown**: usa texto `buscando…`. Se justifica como está
  por ser un espacio chico, pero podría ir un mini-skeleton de 5 filas.

### Categoría "Otros" siempre al final

Implementado en frontend (`src/pages/HomePage.tsx` en `CategoriasGrid`). Si
en algún momento la API empieza a devolver categorías ordenadas, considerar
mover esa lógica al backend (un `ORDER BY CASE WHEN slug = 'otros' THEN 1 ELSE 0 END`).

---

## Convenciones para mantener este archivo

- Cuando se complete un item, eliminarlo de acá (no marcar `~~tachado~~` —
  borrar para mantener legible).
- Cuando aparezca un `// TODO` nuevo en el código, agregarlo acá con referencia
  al archivo y línea.
- No anotar bugs en este archivo; usar el sistema de issues correspondiente.
