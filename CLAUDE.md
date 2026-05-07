# LIALG — instrucciones para Claude

## Flujo de trabajo

- **No hacer commit automáticamente** al terminar un prompt. Siempre terminar con un resumen de lo hecho y esperar confirmación explícita antes de commitear.
- Usar archivos temporales `tmp-*.mjs` para inspección de datos; eliminarlos antes del commit.

## Organización del código

- **Separar datos de lógica**: las tablas de configuración estáticas (listas de mapeos, constantes
  extensas, reglas de negocio en forma de datos) deben vivir en archivos propios bajo `src/data/`,
  no inline dentro del script que las consume. El script importa; el archivo de datos documenta.
- Los archivos en `src/data/` llevan nombres descriptivos que expliquen su contenido sin necesidad
  de leer el código (ej: `marcas-substring-map.ts`, no `constants.ts`).
- Cada archivo de datos incluye un comentario de cabecera que explique: qué contiene, por qué
  existe, el formato de cada entrada, y cómo agregar nuevas entradas en el futuro.

## Stack

| Capa | Directorio | Runtime |
|------|-----------|---------|
| Scripts CLI / DB | `src/` | Node + tsx |
| API REST | `api/src/` | Fastify + Kysely + better-sqlite3 |
| Frontend | `web/src/` | React + Vite + Tailwind + shadcn |

No mezclar dependencias entre capas. Consultar antes de agregar librerías nuevas.

## Base de datos (`db/lialg.db`)

- SQLite readonly desde la API; lectura/escritura solo desde scripts CLI.
- Scripts de modificación siempre ofrecen dry-run (default) y `--apply` para ejecutar.

## Normalización de marcas (`src/scripts/fix-marcas-no-registra.ts`)

ANMAT deja el campo marca en blanco para muchos productos. La marca real suele estar
en `nombre_fantasia` o `nombre_producto`. El script aplica dos pasadas:

### Pasada A — heurística de separadores

Busca en `nombre_fantasia` el separador `"- "` y determina la posición de la marca:

1. **Primer segmento ≤ 2 palabras, último > 2** → marca al inicio (`"SCHAR- GLUTEN FREE- PENNE"` → `Schar`)
2. **Último segmento ≤ 2 palabras, primero > 2** → marca al final (`"Galletitas rellenas - Smams"` → `Smams`)
3. **Sin guión, ≤ 2 palabras** → toda la fantasía es la marca
4. **Ambos segmentos cortos** → desempate: usar el que NO sea falso positivo

**Falsos positivos** (nunca extraer como marca): `gluten free`, `sin gluten`, `libre de gluten`,
`sin tacc`, `zero`, `premium`, `natural`, `organic`, `light`, `diet`, `original`, `classic`,
`extra`, `oyster sauce`, `soy sauce`, `teriyaki`, `fish sauce`.

### Pasada B — lista manual de substrings (`src/data/marcas-substring-map.ts`)

Para marcas que no siguen los patrones anteriores: busca el substring (case-insensitive)
en `nombre_fantasia` + `nombre_producto`. **Agregar nuevas entradas en `marcas-substring-map.ts`**
cuando se identifiquen marcas con muchos productos que la heurística no captura. Formato:

```ts
['SUBSTRING_A_BUSCAR', 'Nombre Normalizado de la Marca'],
```

El primer match de la lista gana; el orden importa para evitar solapamientos (ver comentarios
en el archivo). Los typos del dataset se agregan como entradas adicionales apuntando al mismo
nombre normalizado.

Ver el archivo para la lista completa de entradas actuales (~90 entradas).
