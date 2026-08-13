/**
 * Normalización de los nombres de producto que vienen de ANMAT.
 *
 * Vive acá y no dentro de una ruta porque lo usan tanto el listado
 * (routes/productos.ts) como la lista de pedido (routes/lista.ts), y el Excel que
 * recibe el proveedor tiene que mostrar exactamente el mismo nombre que la
 * pantalla desde la que se armó el pedido.
 */

/**
 * ANMAT deja `nombre_fantasia` con valores de relleno en vez de vacío. Se
 * devuelven como null para que el consumidor caiga en `nombre_producto`.
 *
 * Para agregar un placeholder nuevo: sumarlo al Set en minúsculas.
 */
const PLACEHOLDER_FANTASIA = new Set([
  'no registra',
  'no aplica',
  'sin fantasia',
  'sin nombre',
  'n/a',
  '-',
]);

export function cleanFantasia(s: string | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_FANTASIA.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/**
 * Nombre con el que se muestra un producto: la fantasía si es real, si no la
 * denominación de ANMAT. Misma regla que aplica la tabla del listado en el
 * frontend y la que usa el Excel.
 */
export function nombreVisible(
  nombre_fantasia: string | null,
  nombre_producto: string,
): string {
  return cleanFantasia(nombre_fantasia) ?? nombre_producto;
}
