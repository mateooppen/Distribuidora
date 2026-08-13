# Lista de pedido — propuesta de diseño

Funcionalidad para armar una lista de productos desde el listado filtrado y exportarla
en Excel para mandarle a un proveedor.

Estado: **implementada** (etapas 1 a 5). Ver §8 para el detalle por etapa y §10 para lo
que se descubrió construyéndola.

---

## 1. Decisiones tomadas

| Decisión | Elección |
|---|---|
| Contenido de la línea | Solo producto (marca, nombre, RNPA). Sin cantidades ni notas. |
| Cantidad de listas | Una sola lista activa. |
| Persistencia | `localStorage`, sin backend de escritura. |
| Formato de salida | `.xlsx` generado en la API. |
| Columnas del Excel | Marca, Producto, RNPA. |
| Orden | Agrupado por marca, alfabético. |
| Después de exportar | La lista queda intacta. Se vacía solo con acción explícita. |
| Encabezado del archivo | Título + fecha + total, luego la tabla. |
| Mobile | Es un caso de uso real (depósito / góndola). |

Estas quedan definidas por mí como responsable de la interacción:

- **Agregar con botón `+` por fila, sin checkboxes.**
- **Panel lateral *y* página propia**, con roles distintos.

El razonamiento está en §4.

---

## 2. El problema de la clave estable

La base se regenera completa en GitHub Actions y se publica como release asset. En
`productos`, `id_producto` es `INTEGER PRIMARY KEY` — es decir, el rowid de SQLite, asignado
por orden de inserción del CSV de ANMAT (`src/scripts/import-anmat.ts:111`). Si upstream se
agrega o se elimina una fila, **todos los ids posteriores se corren**.

Consecuencia: una lista guardada en `localStorage` por `id_producto` apuntaría a productos
distintos después de un release de la base, sin ningún síntoma visible. Se exportaría un
pedido incorrecto.

**Solución:** la clave persistida es el par `(tipo_registro, numero_registro)` — el RNPA —
que ya tiene `UNIQUE (tipo_registro, numero_registro)` en `src/db/schema.sql:71` y está
deduplicado en el import. `id_producto` se guarda solo como atajo de lectura, nunca como
identidad.

Corolario de diseño: **el RNPA deja de ser un dato decorativo y pasa a ser obligatorio para
que un producto sea agregable.** Un producto sin RNPA utilizable no puede entrar a la
lista — su botón `+` va deshabilitado con tooltip explicando por qué.

**Verificado sobre la base (2026-08-12):**

| Métrica | Valor |
|---|---|
| Productos totales | 35.498 |
| Sin `numero_registro` | 0 |
| `tipo_registro` distinto de RNPA | 0 |
| Claves `(tipo, numero)` duplicadas | 0 |
| RNPA no plausible | **4** |

Como todo es RNPA, `tipo` queda fijo en `'RNPA'` en el cliente y no hizo falta agregar
`tipo_registro` al endpoint del listado. Si algún día entran SENASA o INV, hay que empezar
a traerlo.

Los 4 casos no plausibles son filas con las columnas corridas en el CSV de origen: el RNPA
trae `"FARMCITY SA"`, `"DATOS DE LA FIRMA P"`, una denominación entera y `"-"`. Por eso la
validación es **por plausibilidad, no por `null`**: `rnpaValido()` exige al menos dos dígitos
(los RNPA reales varían mucho de formato, pero todos los tienen). Esos 4 productos aparecen
en el listado con el botón deshabilitado.

---

## 3. Modelo de datos

### 3.1 `localStorage`

Clave: `lialg-lista-pedido`

```jsonc
{
  "v": 1,                               // versión del esquema, para migrar sin romper
  "actualizada": "2026-08-12T14:03:00.000Z",
  "items": [
    {
      "tipo": "RNPA",                   // identidad ─┐
      "rnpa": "04-035678",              //            ┘ clave estable
      "id": 12043,                      // atajo, puede quedar obsoleto
      "marca": "Schar",                 // ─┐
      "producto": "Penne sin gluten",   //  │ snapshot para render instantáneo
      "fantasia": "SCHAR PENNE",        // ─┘ y para no perder el dato si el producto desaparece
      "agregado": "2026-08-12T14:02:11.000Z"
    }
  ]
}
```

**Por qué guardar un snapshot y no solo el RNPA:** el panel tiene que renderizar al instante
al abrirlo, sin esperar una request. Y si un producto desaparece del catálogo en una
regeneración, el snapshot permite seguir mostrándolo como "ya no figura en el catálogo"
en vez de mostrar una fila fantasma vacía.

**Reglas:**
- Deduplicación por `rnpa`. Agregar dos veces no hace nada (el botón ya muestra `✓`).
- Orden en storage: por `agregado`. La agrupación por marca es de presentación, no de storage.
- Tope duro: **300 ítems**. Suficiente para cualquier pedido real y mantiene el panel usable.
- Escritura con `try/catch` — `localStorage` puede fallar en modo privado; si falla, la
  lista sigue funcionando en memoria y se avisa que no va a sobrevivir al cierre.

### 3.2 Estado en React

Un `ListaPedidoProvider` en `App.tsx` con Context, sin librería de estado nueva.
Expone `useListaPedido()`:

```ts
{
  items: ItemLista[]
  total: number
  contiene: (rnpa: string) => boolean
  agregar: (producto: ProductoListItem) => void
  agregarVarios: (productos: ProductoListItem[]) => { agregados: number; duplicados: number }
  quitar: (rnpa: string) => void
  vaciar: () => void
  deshacer: () => void          // revierte la última operación
}
```

`deshacer` guarda un único snapshot previo en memoria (no un historial). Cubre el caso
real: "agregué 47 sin querer" o "borré uno que necesitaba".

---

## 4. Interacción

### 4.1 Agregar — tres vías, un solo estado

**Por qué no checkboxes.** Los checkboxes introducen un segundo estado ("seleccionado")
que compite con el que realmente importa ("está en la lista"), y la fila ya tiene el click
asignado a abrir el detalle. Un checkbox tildado que todavía no se agregó es una trampa: se
pierde al cambiar de página o de filtro. El botón `+` que pasa a `✓` **es** el estado — no
hay paso intermedio que perder.

**(a) Botón por fila.** Columna nueva al final de `ProductosTable`, ancho fijo, `stopPropagation`
para no abrir el detalle.

- No está en la lista → `+`, borde tenue, `aria-label="Agregar {producto} a la lista"`.
- Está en la lista → `✓` con el color de acento y fondo sutil. Click = quitar.
  `aria-label="Quitar {producto} de la lista"`.
- Sin RNPA → deshabilitado, `title="Sin RNPA — no se puede agregar al pedido"`.
- **Siempre visible**, no aparece en hover: en touch no hay hover, y el estado `✓` es
  información que se lee escaneando la columna.

**(b) Masivo por filtro.** Arriba del listado: `+ Agregar los 47 resultados`.

El filtro *es* la selección. "Todo Schar sin TACC" ya lo expresaste al buscar; obligarte a
tildar 47 casillas es hacerte repetir una intención que ya declaraste. Guardas:

- **Siempre visible**, incluso sin filtros y aunque no entren. La primera versión lo ocultaba
  cuando no aplicaba y el resultado fue que la funcionalidad era invisible: nadie sabía que
  existía. Un control deshabilitado que explica por qué enseña la mecánica; uno ausente no
  comunica nada.
- Si el total es > 25, pide confirmación con el conteo.
- Si el total excede el espacio libre hasta el tope de 300, el botón queda deshabilitado con
  el motivo al lado y no agrega nada parcialmente.
- Requiere traer los N productos del filtro, no solo la página visible → request con
  `pageSize` alto contra `/api/productos` reusando los mismos filtros.
- Al terminar: banner con `47 agregados · 3 ya estaban · Deshacer`.

**(c) Desde el detalle.** Botón primario en el `Sheet` de `ProductoDetalle`, mismo estado
`+`/`✓`. Es el caso de "leo la ficha, después decido".

### 4.2 Dónde vive la lista

**Un solo destino: la página `/lista`**, con su ítem propio en el navbar — `Lista` al lado
de Inicio, Productos y Marcas, con el contador encima del texto.

La primera versión tenía además un panel lateral: el navbar mostraba un botón con ícono de
portapapeles que lo abría, y desde el panel había que tocar otra vez para llegar a la
pantalla. Dos acciones para un destino, con un ícono que no comunicaba a dónde llevaba —y
menos todavía con la lista vacía, sin contador—. La idea era separar "vistazo rápido" de
"revisión final", pero el costo de la indirección se lo comió: el panel se eliminó.

`/lista` es la revisión final y también el vistazo: agrupada por marca con subtotal, quitar
por ítem, vaciar, deshacer y exportar. Volver al listado con el botón atrás del navegador
recupera los filtros, que viven en la URL.

**Contador en el navbar:** el número va posicionado sobre el texto, no en línea, para que el
ancho del ítem no dependa de si tiene 1, 2 o 3 dígitos. Al crecer hace un "pop" breve — es el
único feedback de que un `+` hizo algo cuando estás en el listado. Sin contador cuando está
vacía.

### 4.3 Estados vacíos

- **Panel vacío:** "Tu lista está vacía. Agregá productos con el botón + desde el listado."
  + link a `/productos`.
- **`/lista` vacía:** mismo mensaje, con más aire y el link como botón primario.
- **Ítem que ya no figura en el catálogo** (resuelto contra la API y no encontrado): se
  muestra con el snapshot guardado, atenuado, con una etiqueta `no figura en el catálogo` y
  el `×` a mano. **No se borra solo** — que un producto se caiga de ANMAT es información que
  te importa, no ruido a esconder. Sí se excluye del Excel, avisando antes de exportar.

### 4.4 Confirmaciones

- `Vaciar lista` → `Dialog` de confirmación con el conteo. Es la única acción destructiva.
- Quitar un ítem → sin confirmación, pero con `Deshacer` en un banner.
- Agregado masivo > 25 → confirmación previa.

---

## 5. Mobile

Se usa en depósito y góndola, así que es un target de primera clase, no un "que no se rompa".

- **El listado son tarjetas, no una tabla.** Cuatro columnas no entran en 375px. El primer
  intento fue dejar la tabla con scroll horizontal y la columna de acción fija encima: el
  resultado fue que el RNPA quedaba tapado debajo del botón. Abajo de `sm` cada producto es
  una tarjeta —nombre, denominación, marca · RNPA, y el `+` a la derecha— y **no hay scroll
  horizontal en ninguna parte de la app**.
- **Orden en mobile:** como no hay encabezados de columna que clickear, va un selector propio
  (Relevancia / Producto A→Z / Z→A / Marca A→Z / Z→A). Sin él se perdía la funcionalidad.
- **Botón `+`:** 44×44 px, verificado que no se superpone con ningún otro contenido.
- **`/lista`:** las filas se apilan (el RNPA pasa abajo del nombre) y la barra de acciones
  fija se parte en dos filas: contador arriba, botones abajo, con Exportar ocupando el ancho.
- **Navbar:** "Inicio" se oculta abajo de `sm` —el logo es link a inicio y lo cubre— para que
  entren los cuatro destinos.
- **Salida del archivo — el punto importante.** Descargar un `.xlsx` en un celular y después
  encontrarlo para adjuntarlo es un dolor. Como el archivo lo genera la API y llega como blob,
  se puede usar la Web Share API:

  ```ts
  const file = new File([blob], nombre, { type: XLSX_MIME })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Lista de pedido' })  // → WhatsApp, mail, Drive
  } else {
    descargarBlob(blob, nombre)                                        // fallback desktop
  }
  ```

  En Android/iOS eso abre la hoja de compartir nativa y el Excel va directo al chat del
  proveedor. Sin dependencias nuevas. En desktop cae al `download` de siempre.

---

## 6. Export

### 6.1 Endpoints (`api/src/routes/lista.ts`)

La base sigue **readonly**: estos endpoints solo leen y arman un archivo. No hay escritura ni
estado en el servidor.

**`POST /api/lista/resolver`**
```jsonc
// request
{ "rnpas": ["04-035678", "04-012345"] }
// response
{
  "encontrados": [ /* ProductoListItem[] con datos frescos */ ],
  "faltantes":   ["04-012345"]
}
```
Lo llama `/lista` al montar (y el panel la primera vez por sesión) para revalidar contra la
base actual: corrige nombres que cambiaron y detecta productos caídos del catálogo. El
snapshot de `localStorage` se actualiza con lo que vuelve.

**`POST /api/lista/export`**
Mismo body. Devuelve el `.xlsx` con
`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y
`Content-Disposition: attachment; filename="lista-pedido-2026-08-12.xlsx"`.

Resuelve por RNPA del lado del servidor — el Excel sale con datos frescos, no con el snapshot
del navegador. Los faltantes se omiten (el frontend ya avisó).

Se usa `POST` porque la lista puede tener 300 RNPAs y no entran cómodos en una query string.
No modifica nada; es un `POST` de conveniencia, no de escritura.

Validación: máximo 300 RNPAs por request, formato de RNPA validado antes de tocar la base.

### 6.2 El archivo

```
A1   LISTA DE PEDIDO — San Felipa                (negrita, 14pt, merge A1:C1)
A2   Fecha: 12/08/2026
A3   Total: 34 productos · 7 marcas
A4   (vacía)
A5   MARCA | PRODUCTO | RNPA                     (encabezado, negrita, fondo gris, freeze)
A6…  filas agrupadas por marca, marca alfabética, producto alfabético dentro del grupo
```

- Anchos: Marca 22, Producto 60, RNPA 18.
- RNPA como **texto**, no número — si no, Excel se come ceros a la izquierda y guiones.
- Producto = `nombre_fantasia` si existe, si no `nombre_producto` (la misma regla que ya usa
  la tabla del listado).
- Una sola hoja, llamada `Pedido`.
- Fila congelada en el encabezado de la tabla.

### 6.3 Dependencia nueva

**`exceljs` en `api/`** — única dependencia nueva de toda la funcionalidad. Se elige sobre
SheetJS por el control de estilos (negritas, anchos, freeze) que necesita el encabezado, y
porque en el servidor el peso del paquete no importa. El frontend no suma nada.

---

## 7. Fuera de alcance (explícito)

Para que quede registrado qué se decidió **no** hacer ahora, y por qué es fácil agregarlo después:

- Cantidades, unidades y notas por ítem. El modelo de datos ya tiene lugar; agregar un campo
  `cantidad` es aditivo y no rompe el `v: 1` si se hace con default.
- Múltiples listas con nombre.
- Un archivo o una hoja por proveedor.
- Compartir la lista por link.
- Precios (no están en la base).
- Historial de pedidos exportados.

---

## 8. Plan de implementación

| Etapa | Alcance | Archivos |
|---|---|---|
| **1 ✅** | Estado + `localStorage` + botón `+` en tabla y detalle + badge en navbar + panel lateral (quitar, vaciar, deshacer) | `web/src/lib/lista-pedido.ts`, `web/src/components/ListaPedidoProvider.tsx`, `BotonAgregarLista.tsx`, `ListaPedidoPanel.tsx`, `BotonListaNavbar.tsx`, `ProductosTable.tsx`, `ProductoDetalle.tsx`, `App.tsx`, `index.css` |
| **2 ✅** | Endpoint `resolver` + página `/lista` agrupada por marca + revalidación por RNPA + manejo de faltantes | `api/src/routes/lista.ts`, `api/src/lib/nombre-producto.ts`, `web/src/pages/ListaPage.tsx`, `web/src/lib/api.ts`, `App.tsx` |
| **3 ✅** | Endpoint `export` + armado del `.xlsx` + descarga y Web Share | `api/src/lib/xlsx-lista.ts`, `api/src/routes/lista.ts`, `api/package.json`, `web/src/lib/entregar-archivo.ts`, `ListaPage.tsx` |
| **4 ✅** | Agregado masivo por filtro + guardas + banner con deshacer | `web/src/components/AgregarResultadosLista.tsx`, `web/src/pages/ProductosPage.tsx` |
| **5 ✅** | Pasada de mobile: targets táctiles, panel full-screen, columna de acción fija, barra de acciones al alcance del pulgar | los componentes ya creados |

Cada etapa deja la app en un estado usable y verificable.

### 8.1 Verificación

Sobre el navegador, con la API y Vite corriendo:

- Agregar y quitar desde la tabla sin que se abra el panel de detalle; estado `✓` que
  sobrevive a recargar; badge del navbar.
- Seis clicks en el mismo tick de React entran los seis (ver §10).
- `/lista`: agrupación por marca, revalidación contra la API, producto inexistente marcado
  como fuera de catálogo y excluido del conteo exportable.
- Export: `Content-Disposition` con fecha legible desde el navegador (cross-origin),
  archivo válido, encabezado y freeze donde corresponde, RNPA como texto.
- Masivo: umbral de confirmación a los 25, bloqueo cuando no entran (1.094 resultados
  contra 293 lugares libres), deshacer que revierte el lote entero, y ausencia total de la
  acción sin filtros activos.
- 375px: sin scroll horizontal de página en ninguna pantalla, targets de 44px, panel a
  ancho completo, botón `+` dentro del viewport.
- Modo oscuro en `/lista` y en la columna fija de la tabla.

`tsc`, `eslint` y `npm run build` pasan en `web/` y `api/`. Los 5 errores y 2 warnings que
reporta `eslint src` en `web/` son todos de archivos preexistentes (`MarcasTable`,
`MarcasPage`, `ProductosPage`, `ui/*`); ningún archivo nuevo aparece.

---

## 9. Decisiones menores — resueltas en la etapa 1

1. **Feedback de "deshacer":** banner inline dentro del panel, sin agregar `sonner`. El
   mecanismo es genérico (guarda un único snapshot del estado previo, no un historial) y ya
   cubre quitar y vaciar; la etapa 4 lo reusa para el agregado masivo.
2. **Productos sin RNPA:** son 4, por columnas corridas en el CSV. Ver §2.
3. **Ícono del navbar:** `ClipboardList` de `lucide-react`.

## 10. Hallazgos durante la implementación

- **`index.css` aplicaba el fix del Sheet a todo `[role="dialog"]`.** El override forzaba
  `transform: translateX(0) !important`, que hubiera descolocado cualquier `Dialog` centrado
  (se posiciona con `translate(-50%, -50%)`). No se notaba porque el Sheet de detalle era el
  único diálogo del proyecto. Se acotó a `[data-panel-lateral]`, atributo que ahora ponen los
  dos paneles. Las etapas 2 y 3 pueden usar `Dialog` sin sorpresas.
- **Confirmación de "vaciar" inline en vez de `Dialog`.** Evita apilar dos focus traps de
  Radix dentro del Sheet y confirma la acción destructiva donde se disparó.
- **Celda de acción sticky.** En mobile la tabla ya desbordaba, así que el botón `+` quedaría
  fuera de alcance. La celda fija necesita fondo opaco, pero el zebra y el hover de la fila son
  semitransparentes: la fila expone el tinte en `--fila-tinte` y la celda lo compone sobre una
  base opaca. Sin eso, al pasar el mouse la fila se iluminaba entera menos la última columna.
- **El estado se dividió en dos archivos.** `lib/lista-pedido.ts` (tipos, helpers, contexto,
  hook) y `components/ListaPedidoProvider.tsx` (solo el componente): el fast-refresh de Vite
  no acepta un archivo que exporte un componente y además otras cosas.

- **Bug de batching: clicks rápidos se perdían.** Las mutaciones leían `items` del closure
  —hacía falta para capturar el estado previo del deshacer, porque un efecto dentro del
  updater de `setState` se ejecuta dos veces bajo StrictMode— y varios `agregar` en el mismo
  tick de React leían todos la misma lista vieja: sobrevivía solo el último. Se detectó
  agregando seis productos de golpe y viendo llegar uno.

  La solución fue juntar lista y deshacer en **un solo objeto de estado**. Como cada mutación
  escribe los dos a la vez, ahora todas son updates funcionales puros: reciben el estado real,
  devuelven el siguiente, y las operaciones encadenadas se componen. Sin closures ni efectos.

- **`cleanFantasia` se movió a `api/src/lib/nombre-producto.ts`.** Estaba dentro de
  `routes/productos.ts`. El Excel tiene que mostrar exactamente el mismo nombre que la
  pantalla desde la que se armó el pedido, así que la regla vive en un solo lugar.

- **`Content-Disposition` necesita `Access-Control-Expose-Headers`.** En dev la API está en
  `:3001` y el frontend en `:5173`: sin ese header el navegador no puede leer el nombre del
  archivo y la descarga cae al fallback genérico. Con curl no se notaba.

- **La revalidación refresca el snapshot desde el `queryFn`, no desde un efecto.** Pasa una
  vez por fetch en vez de una por render, y evita el `set-state-in-effect` que marca el lint.
  Para que no se realimente, `sincronizar` tiene identidad estable y devuelve el mismo estado
  cuando no hay nada que cambiar.

- **Productos dados de baja después de agregarlos.** No estaba en la propuesta: un producto
  puede seguir en el catálogo pero haber pasado a `baja_permanente` desde que se agregó a la
  lista. Se muestra con una etiqueta de advertencia y se exporta igual — el proveedor decide.
  Distinto de "no figura en el catálogo", que sí se excluye del Excel.

## 10.1 Segunda pasada, a partir de la revisión del usuario

Tres problemas reportados después de la primera entrega, los tres reales:

- **El responsive de mobile estaba roto.** La tabla con scroll horizontal + columna fija
  dejaba el RNPA tapado debajo del botón. El error de fondo fue de método: verifiqué el
  mobile midiendo por DOM (`scrollWidth`, bounding rects) y di por bueno "no desborda", que
  era cierto y a la vez irrelevante — nunca comparé si dos elementos se superponían, ni miré
  la pantalla. La verificación ahora incluye chequeo explícito de solapamiento entre el botón
  y el RNPA, y de que ningún contenedor scrollee en horizontal.
- **El masivo era invisible.** Ver §4.1(b).
- **La lista estaba a dos acciones de distancia, detrás de un ícono que no se entendía.**
  Ver §4.2.

Y un bug que apareció al arreglarlos: **Radix reserva `value=""` en `Select.Item`** y tira
si un ítem la usa. El selector de orden en mobile usaba la cadena vacía para "Relevancia", y
eso rompía toda la pantalla del listado en mobile. Ahora usa un centinela (`'auto'`).

## 11. Pendientes conocidos

- **`react-hooks/set-state-in-effect` en `ProductosPage` y `MarcasPage`.** Preexistente: el
  efecto que vuelve a la página 1 al cambiar un filtro. Arreglarlo implica reestructurar el
  estado de paginación, fuera del alcance de esta funcionalidad.
- **El bundle pasó de 519KB a 532KB** (155→159KB gzip). Vite avisa desde antes de esta
  funcionalidad; el Excel no aporta nada al frontend porque se genera en la API.
- **A 320px de ancho el navbar no entra.** Marca + tres destinos + contador + toggle de tema
  necesitan 32px más de los que hay. El nav queda deslizable en horizontal, así que degrada
  sin romper, pero "Lista" arranca fuera de vista. Resolverlo de verdad pide otro header para
  pantallas muy chicas (dos filas, o menú), que excede esta funcionalidad. **De 360px para
  arriba entra todo** — cubre los teléfonos actuales (360, 375, 390, 393, 412, 428).
