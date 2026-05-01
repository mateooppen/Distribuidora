/**
 * Etapa 4.C — Categorización de productos.
 *
 * Inserta el árbol de categorías en la tabla `categorias` y asigna
 * `id_categoria` a cada producto mediante reglas de palabras clave sobre
 * el nombre del producto (normalizado: sin tildes, minúsculas).
 *
 * Las reglas se aplican en orden de prioridad: la primera que coincide gana.
 * Productos sin coincidencia quedan asignados a "Otros".
 *
 * Uso:
 *   npm run db:categorize            → dry-run (muestra estadísticas)
 *   npm run db:categorize -- --apply → inserta categorías y asigna productos
 *   npm run db:categorize -- --reset → borra categorías previas antes de insertar
 */

import { createDb } from '../db/connection.js';
import { log } from '../lib/logger.js';

// ── Taxonomía ──────────────────────────────────────────────────────────────

interface CatDef {
  nombre: string;
  slug: string;
  orden: number;
  hijos?: CatDef[];
}

const TAXONOMIA: CatDef[] = [
  {
    nombre: 'Lácteos', slug: 'lacteos', orden: 10,
    hijos: [
      { nombre: 'Leche y bebidas lácteas', slug: 'lacteos-leche',  orden: 1 },
      { nombre: 'Quesos',                  slug: 'lacteos-quesos', orden: 2 },
      { nombre: 'Yogur',                   slug: 'lacteos-yogur',  orden: 3 },
      { nombre: 'Crema y manteca',         slug: 'lacteos-crema',  orden: 4 },
    ],
  },
  {
    nombre: 'Panadería y repostería', slug: 'panaderia', orden: 20,
    hijos: [
      { nombre: 'Pan y masas',        slug: 'panaderia-pan',       orden: 1 },
      { nombre: 'Galletitas',         slug: 'panaderia-galletitas', orden: 2 },
      { nombre: 'Harinas y premezclas', slug: 'panaderia-harinas', orden: 3 },
      { nombre: 'Pastas y fideos',    slug: 'panaderia-pastas',    orden: 4 },
    ],
  },
  {
    nombre: 'Cereales y granos', slug: 'cereales', orden: 30,
    hijos: [
      { nombre: 'Arroz',          slug: 'cereales-arroz',  orden: 1 },
      { nombre: 'Otros cereales y granos', slug: 'cereales-otros', orden: 2 },
    ],
  },
  {
    nombre: 'Chocolates y confitería', slug: 'confiteria', orden: 40,
    hijos: [
      { nombre: 'Chocolates',       slug: 'confiteria-chocolates',  orden: 1 },
      { nombre: 'Alfajores y barras', slug: 'confiteria-alfajores', orden: 2 },
      { nombre: 'Dulce de leche',   slug: 'confiteria-dulce-leche', orden: 3 },
      { nombre: 'Caramelos y golosinas', slug: 'confiteria-caramelos', orden: 4 },
    ],
  },
  {
    nombre: 'Dulces y conservas', slug: 'dulces', orden: 50,
    hijos: [
      { nombre: 'Mermeladas y jaleas', slug: 'dulces-mermeladas', orden: 1 },
      { nombre: 'Conservas',           slug: 'dulces-conservas',  orden: 2 },
    ],
  },
  {
    nombre: 'Bebidas', slug: 'bebidas', orden: 60,
    hijos: [
      { nombre: 'Yerba y mate',          slug: 'bebidas-yerba', orden: 1 },
      { nombre: 'Café e infusiones',     slug: 'bebidas-cafe',  orden: 2 },
      { nombre: 'Jugos y néctares',      slug: 'bebidas-jugos', orden: 3 },
      { nombre: 'Aguas y bebidas saborizadas', slug: 'bebidas-aguas', orden: 4 },
    ],
  },
  { nombre: 'Aceites, aderezos y salsas', slug: 'aceites-salsas',  orden: 70 },
  {
    nombre: 'Carnes y fiambres', slug: 'carnes', orden: 80,
    hijos: [
      { nombre: 'Carnes, aves y congelados', slug: 'carnes-frescas',  orden: 1 },
      { nombre: 'Fiambres y embutidos',      slug: 'carnes-fiambres', orden: 2 },
    ],
  },
  {
    nombre: 'Snacks y aperitivos', slug: 'snacks', orden: 90,
    hijos: [
      { nombre: 'Papas y snacks salados', slug: 'snacks-papas', orden: 1 },
      { nombre: 'Frutos secos y semillas', slug: 'snacks-frutos', orden: 2 },
    ],
  },
  { nombre: 'Helados y postres',         slug: 'helados-postres', orden: 100 },
  { nombre: 'Suplementos y dietéticos',  slug: 'suplementos',     orden: 110 },
  { nombre: 'Otros',                     slug: 'otros',           orden: 120 },
];

// ── Normalización ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Reglas de clasificación ────────────────────────────────────────────────
// Cada regla tiene:
//   slug     → categoría hija destino
//   contains → el nombre normalizado contiene alguno de estos strings (también normalizados)
//   starts   → el nombre normalizado empieza con alguno de estos strings (también normalizados)
//
// Las reglas se evalúan en el orden en que están definidas.
// La primera que coincide gana.
// IMPORTANTE: los patrones se normalizan automáticamente con norm() al inicio.

interface Rule {
  slug: string;
  starts?: string[];
  contains?: string[];
}

const RULES: Rule[] = [
  // ── Suplementos (primero: vocabulario muy específico) ──────────────────
  {
    slug: 'suplementos',
    contains: [
      'suplemento dietario', 'suplemento vitaminico', 'suplemento alimentario',
      'complemento nutricional', 'formula infantil', 'formula de inicio',
      'formula de continuacion', 'leche de formula', 'leche maternizada',
      'alimento lacto', 'nutricion enteral', 'alimento dietario',
      'alimento dietetico', 'alimento en polvo para lactantes',
    ],
  },
  {
    slug: 'suplementos',
    starts: ['suplemento', 'vitamina ', 'vitaminas ', 'proteina ', 'proteinas '],
  },
  {
    slug: 'suplementos',
    contains: ['suplemento en', 'suplemento con', 'aporte de vitamina'],
  },
  // "alimento dietético/dietario" sin otra palabra clave más específica
  {
    slug: 'suplementos',
    starts: ['alimento dietetico', 'alimento dietario', 'alimento vitaminado'],
  },

  // ── Bebidas: yerba y mate ─────────────────────────────────────────────
  { slug: 'bebidas-yerba', starts: ['yerba', 'mate cocido', 'te de yerba'] },
  { slug: 'bebidas-yerba', contains: ['yerba mate', 'mate elaborado'] },

  // ── Bebidas: café e infusiones ────────────────────────────────────────
  {
    slug: 'bebidas-cafe',
    starts: ['cafe ', 'café ', 'te ', 'té ', 'manzanilla', 'tilo ', 'poleo',
             'boldo', 'cedrón', 'cedron', 'infusion', 'infusión'],
  },
  {
    slug: 'bebidas-cafe',
    contains: ['cafe molido', 'café molido', 'cafe tostado', 'café tostado',
               'cafe instantaneo', 'te verde', 'té verde', 'te de manzanilla'],
  },

  // ── Bebidas: jugos ────────────────────────────────────────────────────
  { slug: 'bebidas-jugos', starts: ['jugo', 'nectar', 'néctar'] },
  { slug: 'bebidas-jugos', contains: ['jugo de ', 'nectar de ', 'néctar de '] },

  // ── Bebidas: aguas y saborizadas ─────────────────────────────────────
  {
    slug: 'bebidas-aguas',
    starts: ['agua ', 'bebida '],
  },
  {
    slug: 'bebidas-aguas',
    contains: ['agua saborizada', 'agua mineral', 'bebida saborizada',
               'bebida sin alcohol', 'bebida no alcoholica', 'refresco'],
  },

  // ── Confitería: alfajores (antes de chocolate) ────────────────────────
  { slug: 'confiteria-alfajores', contains: ['alfajor'] },
  { slug: 'confiteria-alfajores', contains: ['barra de cereal', 'barra cereal'] },

  // ── Confitería: dulce de leche (antes de lácteos) ─────────────────────
  { slug: 'confiteria-dulce-leche', contains: ['dulce de leche'] },

  // ── Confitería: chocolates ────────────────────────────────────────────
  {
    slug: 'confiteria-chocolates',
    starts: ['chocolate', 'bombón', 'bombones', 'cobertura', 'tableta'],
  },
  {
    slug: 'confiteria-chocolates',
    contains: [
      'tableta de chocolate', 'bano de reposteria', 'baño de repostería',
      'cobertura de chocolate', 'chocolate blanco', 'chocolate negro',
      'chocolate con leche', 'chocolate semiamargo', 'chocolate amargo',
    ],
  },

  // ── Confitería: caramelos y golosinas ────────────────────────────────
  {
    slug: 'confiteria-caramelos',
    starts: ['caramelo', 'caramelos', 'chicle', 'gomita', 'gomitas',
             'chupetin', 'chupetín', 'pirulin', 'pirulín', 'pastillas de'],
  },
  {
    slug: 'confiteria-caramelos',
    contains: ['goma de mascar', 'caramelos de ', 'pastillas sabor'],
  },

  // ── Lácteos: yogur (antes de leche) ───────────────────────────────────
  { slug: 'lacteos-yogur', contains: ['yogur', 'yoghurt', 'yogurt', 'kefir'] },

  // ── Lácteos: quesos ───────────────────────────────────────────────────
  {
    slug: 'lacteos-quesos',
    starts: [
      'queso', 'ricota', 'ricotta', 'muzarela', 'mozzarella', 'provolone',
      'reggianito', 'gruyere', 'gruyère', 'gouda', 'brie', 'camembert',
      'edam', 'parmesano', 'sardo', 'tybo', 'port salut', 'sbrinz',
      'fontina', 'emmental', 'roquefort', 'gorgonzola',
    ],
  },
  {
    slug: 'lacteos-quesos',
    contains: [
      'queso crema', 'queso untable', 'queso en barra', 'queso en hebras',
      'queso rallado', 'queso fresco', 'queso en polvo',
    ],
  },

  // ── Lácteos: crema y manteca (antes de leche) ─────────────────────────
  {
    slug: 'lacteos-crema',
    starts: ['manteca', 'mantequilla', 'crema de leche', 'crema doble',
             'crema batida', 'crema chantilly', 'nata '],
  },
  {
    slug: 'lacteos-crema',
    contains: ['crema de leche', 'manteca con sal', 'manteca sin sal'],
  },

  // ── Lácteos: leche ────────────────────────────────────────────────────
  { slug: 'lacteos-leche', starts: ['leche'] },
  {
    slug: 'lacteos-leche',
    contains: [
      'leche en polvo', 'leche entera', 'leche descremada', 'leche condensada',
      'leche evaporada', 'leche uht', 'leche parcialmente descremada',
    ],
  },

  // ── Helados y postres (antes de harinas para "mezcla para postre") ─────
  {
    slug: 'helados-postres',
    starts: ['helado', 'helados', 'postre', 'postres', 'flan', 'mousse',
             'budin', 'budín', 'panna', 'creme brulee'],
  },
  {
    slug: 'helados-postres',
    contains: [
      'mezcla para postre', 'preparado para postre', 'postre de ',
      'creme brulee', 'panna cotta',
    ],
  },

  // ── Cereales: arroz ───────────────────────────────────────────────────
  { slug: 'cereales-arroz', starts: ['arroz'] },

  // ── Cereales: otros ───────────────────────────────────────────────────
  {
    slug: 'cereales-otros',
    starts: [
      'quinoa', 'quínoa', 'mijo', 'sorgo', 'amaranto', 'trigo sarraceno',
      'avena', 'granola', 'muesli', 'cereal', 'cereales', 'copos de',
      'semillas de', 'semilla de',
    ],
  },
  {
    slug: 'cereales-otros',
    contains: ['copos de arroz', 'copos de maiz', 'granos de ', 'semillas de '],
  },

  // ── Aceites, aderezos y salsas ────────────────────────────────────────
  {
    slug: 'aceites-salsas',
    starts: ['aceite', 'vinagre', 'aderezo', 'mayonesa', 'mostaza',
             'ketchup', 'salsa ', 'chimichurri', 'aliño'],
  },
  {
    slug: 'aceites-salsas',
    contains: [
      'aceite de ', 'vinagre de ', 'aderezo de ', 'salsa de ',
      'salsa para ', 'aceite de oliva', 'aceite de girasol',
    ],
  },

  // ── Dulces: mermeladas ────────────────────────────────────────────────
  { slug: 'dulces-mermeladas', starts: ['mermelada', 'confitura', 'compota', 'jalea'] },
  { slug: 'dulces-mermeladas', contains: ['mermelada de ', 'confitura de ', 'compota de '] },

  // ── Dulces: conservas ─────────────────────────────────────────────────
  {
    slug: 'dulces-conservas',
    starts: [
      'aceitunas', 'conserva', 'conservas', 'tomate', 'tomates', 'pepino',
      'pickles', 'encurtido', 'zucchini', 'berenjena', 'champiñones',
      'champinones', 'morron', 'morrón', 'pimiento', 'alcaparras',
      'palmito', 'palmitos',
    ],
  },
  {
    slug: 'dulces-conservas',
    contains: [
      'en conserva', 'al natural', 'al escabeche', 'pulpa de tomate',
      'pure de tomate', 'puré de tomate', 'tomate triturado',
      'tomates perita', 'aceitunas en',
    ],
  },

  // ── Carnes: fiambres y embutidos ──────────────────────────────────────
  {
    slug: 'carnes-fiambres',
    starts: [
      'jamon', 'jamón', 'salame', 'salami', 'fiambre', 'mortadela',
      'chorizo', 'salchicha', 'longaniza', 'leberwurst', 'pastron', 'pastrón',
      'bresaola', 'bondiola',
    ],
  },

  // ── Carnes: frescas, aves, congelados ─────────────────────────────────
  {
    slug: 'carnes-frescas',
    starts: [
      'carne', 'medallon', 'medallón', 'medallones', 'hamburguesa',
      'hamburguesas', 'milanesa', 'milanesas', 'bife', 'pollo', 'cerdo',
      'vacuna', 'ternera', 'cordero', 'conejo', 'trucha', 'salmon',
      'salmón', 'atun', 'atún', 'merluza', 'langostinos',
    ],
  },
  {
    slug: 'carnes-frescas',
    contains: [
      'carne vacuna', 'carne de res', 'hamburguesa de ', 'medallón de ',
      'milanesa de ', 'empanada ', 'empanadas ', 'nuggets',
      'marineras', 'rebozadas', 'sorrentinos', 'canelones',
    ],
  },

  // ── Snacks: frutos secos ──────────────────────────────────────────────
  {
    slug: 'snacks-frutos',
    starts: [
      'mani', 'maní', 'almendra', 'almendras', 'nuez', 'nueces',
      'castana', 'castaña', 'pistacho', 'pistachos', 'avellana', 'avellanas',
      'semillas',
    ],
  },
  {
    slug: 'snacks-frutos',
    contains: [
      'frutos secos', 'mix de nueces', 'mix de frutos', 'mix de semillas',
      'nueces sin cascara', 'almendras sin cascara',
    ],
  },

  // ── Snacks: papas y salados ───────────────────────────────────────────
  {
    slug: 'snacks-papas',
    starts: [
      'papas', 'papa fritas', 'snack', 'snacks', 'nachos', 'palitos',
      'chizitos', 'chicharron', 'chicharrones', 'panchitos',
    ],
  },
  { slug: 'snacks-papas', contains: ['papas fritas', 'chips de'] },

  // ── Panadería: galletitas ─────────────────────────────────────────────
  {
    slug: 'panaderia-galletitas',
    starts: [
      'galletita', 'galletitas', 'galleta', 'galletas', 'cracker', 'crackers',
      'bizcocho', 'bizcochos', 'vainilla ', 'vainillas', 'wafer', 'barquillo',
      'oblea', 'obleas',
    ],
  },

  // ── Panadería: pan y masas ────────────────────────────────────────────
  {
    slug: 'panaderia-pan',
    starts: [
      'pan ', 'panes', 'tostada', 'tostadas', 'bollo', 'bollos',
      'medialuna', 'medialunas', 'croissant', 'muffin', 'wafle', 'waffle',
      'scone', 'tarta', 'tartas', 'bizcochuelo', 'torta ', 'tortas',
      'facturas', 'panqueque', 'panqueca', 'prepizza', 'pizza',
    ],
  },
  {
    slug: 'panaderia-pan',
    contains: ['masa de ', 'masa para ', 'tapa de empanada', 'tapas de tarta'],
  },

  // ── Panadería: harinas y premezclas ───────────────────────────────────
  {
    slug: 'panaderia-harinas',
    starts: ['harina', 'harinas', 'premezcla', 'premezclas', 'almidon', 'fecula', 'rebozador'],
  },
  {
    slug: 'panaderia-harinas',
    contains: ['mezcla para pan', 'mezcla para galletitas', 'mezcla para tarta',
               'mezcla de harinas', 'premezcla para', 'harina de ',
               'almidon de maiz', 'fecula de mandioca'],
  },
  // "mezcla" genérica → harinas (último recurso dentro de panadería)
  { slug: 'panaderia-harinas', starts: ['mezcla'] },

  // ── Panadería: pastas ─────────────────────────────────────────────────
  {
    slug: 'panaderia-pastas',
    starts: [
      'pasta', 'pastas', 'fideo', 'fideos', 'tallarin', 'tallarín',
      'spaghetti', 'spaguetti', 'linguini', 'penne', 'rigatoni',
      'noqui', 'ñoqui', 'ñoquis', 'raviole', 'ravioles',
      'capeletti', 'capelletti', 'fetuccini', 'fettuccine',
    ],
  },
  {
    slug: 'panaderia-pastas',
    contains: ['pastas frescas', 'pastas rellenas', 'pastas secas'],
  },

  // ── Dulces: "dulce de X" que no es dulce de leche ────────────────────
  {
    slug: 'dulces-mermeladas',
    starts: ['dulce de', 'dulce batata', 'dulce membrillo', 'dulce cayote',
             'dulce citrico', 'dulce zapallo'],
  },
  { slug: 'dulces-mermeladas', starts: ['miel'] },
  { slug: 'dulces-mermeladas', contains: ['miel de abeja'] },

  // ── Dulces: frutas y verduras en conserva (por nombre de fruta) ───────
  {
    slug: 'dulces-conservas',
    starts: [
      'duraznos', 'peras', 'arvejas', 'porotos', 'choclo', 'choclos',
      'lentejas', 'garbanzos', 'habas', 'espinaca', 'espinacas',
      'brocoli', 'brócoli', 'coliflor', 'acelga', 'acelgas',
      'remolacha', 'remolachas', 'champinones', 'hongos', 'lenteja',
      'zanahoria', 'zanahorias', 'poroto', 'cebolla', 'cebollas',
      'alcaucil', 'alcauciles', 'ajo', 'ajos', 'pulpa', 'pure',
    ],
  },
  {
    slug: 'dulces-conservas',
    contains: [
      'en salmuera', 'al natural', 'al escabeche', 'en aceite',
      'pulpa de ', 'pure de tomate', 'pure de papa',
    ],
  },
  // Verduras congeladas / supercongeladas
  { slug: 'dulces-conservas', contains: ['supercongelad', 'sobre congelad'] },

  // ── Aceites y condimentos: aceto, azúcar, sal, edulcorantes ──────────
  {
    slug: 'aceites-salsas',
    starts: [
      'aceto', 'azucar', 'sal ', 'sales ', 'edulcorante', 'edulcorantes',
      'endulzante', 'endulzantes', 'colorante', 'saborizante', 'aromatizante',
      'extracto', 'levadura',
    ],
  },
  { slug: 'aceites-salsas', contains: ['aceto balsamico', 'aceto balsámico'] },

  // ── Cereales: maíz y otros granos ────────────────────────────────────
  {
    slug: 'cereales-otros',
    starts: [
      'maiz', 'granos', 'cebada', 'lino', 'chia', 'chía',
      'extrudado', 'expandido', 'popcorn',
    ],
  },
  { slug: 'cereales-otros', contains: ['granos de ', 'maiz inflado'] },

  // ── Carnes: embutidos y fiambres adicionales ──────────────────────────
  {
    slug: 'carnes-fiambres',
    starts: ['panceta', 'tocino', 'butifarra', 'morcilla', 'salchichon',
             'prosciutto', 'coppa'],
  },

  // ── Carnes: cortes y otros ────────────────────────────────────────────
  {
    slug: 'carnes-frescas',
    starts: [
      'lomo', 'asado', 'tira de asado', 'costilla', 'matambre', 'nalga',
      'cuadril', 'peceto', 'paleta', 'palomita', 'roast beef',
      'pechuga', 'muslo', 'pato', 'liebre', 'ciervo', 'jabalí',
      'surimi', 'calamar', 'calamares', 'mejillones', 'vieiras',
    ],
  },

  // ── Aceites, salsas: residual y sopas ────────────────────────────────
  { slug: 'aceites-salsas', starts: ['salsa', 'sopa', 'sopas', 'caldo', 'caldos',
                                      'jarabe', 'jarabes'] },

  // ── Confitería: turrón y figuras de chocolate ─────────────────────────
  { slug: 'confiteria-caramelos', starts: ['turron', 'turrón', 'mazapan', 'mazapán'] },
  { slug: 'confiteria-chocolates', starts: ['figura', 'huevo de pascua', 'huevo pascua'] },
  { slug: 'confiteria-chocolates', contains: ['figura de chocolate', 'huevo de pascua'] },

  // ── Snacks: pasas y otros frutos secos ───────────────────────────────
  { slug: 'snacks-frutos', starts: ['pasas', 'pasa de', 'coco rallado', 'datiles',
                                     'higos', 'ciruela', 'ciruelas', 'damasco',
                                     'damascos', 'arandanos', 'arandano'] },

  // ── Conservas: peces y mariscos enlatados ────────────────────────────
  { slug: 'dulces-conservas', starts: ['sardinas', 'sardina', 'caballa', 'anchoa',
                                        'anchoas', 'mejillones', 'ostras'] },
  { slug: 'dulces-conservas', contains: ['en lata', 'en aceite de oliva', 'atun en'] },

  // ── Carnes: fiambres adicionales ──────────────────────────────────────
  { slug: 'carnes-fiambres', starts: ['morcilla', 'morcillas', 'queso de cerdo',
                                       'queso de cabeza'] },

  // ── Lácteos: ricotta (ortografía alternativa) ─────────────────────────
  { slug: 'lacteos-quesos', starts: ['ricotta'] },

  // ── Carnes: comidas preparadas / platos ───────────────────────────────
  { slug: 'carnes-frescas', starts: ['comida', 'plato', 'preparacion', 'preparación'] },
  { slug: 'carnes-frescas', contains: ['comida preparada', 'plato preparado',
                                        'sobrecongelad', 'cocido congelado'] },
];

// ── Helpers ────────────────────────────────────────────────────────────────

// Pre-normalizar los patrones UNA vez al cargar (evita re-normalizar en cada comparación).
const RULES_NORM: Array<{ slug: string; starts?: string[]; contains?: string[] }> =
  RULES.map(r => ({
    slug: r.slug,
    starts:   r.starts?.map(norm),
    contains: r.contains?.map(norm),
  }));

function classify(nombreProducto: string): string {
  const n = norm(nombreProducto);
  for (const rule of RULES_NORM) {
    if (rule.starts?.some(p => n.startsWith(p))) return rule.slug;
    if (rule.contains?.some(p => n.includes(p))) return rule.slug;
  }
  return 'otros';
}

// ── Main ──────────────────────────────────────────────────────────────────

function main(): void {
  const isApply = process.argv.includes('--apply');
  const isReset = process.argv.includes('--reset');
  if (!isApply) log.warn('Modo DRY-RUN. Pasá --apply para aplicar.');

  const { sqlite, kysely } = createDb();
  void kysely;

  // ── Paso 1: insertar categorías ──────────────────────────────────────

  // Construir mapa slug → id para referencias cruzadas.
  const slugToId = new Map<string, number>();

  if (isApply) {
    if (isReset) {
      sqlite.prepare(`UPDATE productos SET id_categoria = NULL`).run();
      sqlite.prepare(`DELETE FROM categorias`).run();
      log.info('Categorías y asignaciones previas eliminadas.');
    }

    const insertCat = sqlite.prepare(
      `INSERT OR IGNORE INTO categorias (id_padre, nombre, slug, orden)
       VALUES (?, ?, ?, ?)`,
    );

    for (const cat of TAXONOMIA) {
      const r = insertCat.run(null, cat.nombre, cat.slug, cat.orden);
      const id = r.lastInsertRowid
        ? Number(r.lastInsertRowid)
        : (sqlite.prepare(`SELECT id_categoria FROM categorias WHERE slug = ?`).get(cat.slug) as { id_categoria: number }).id_categoria;
      slugToId.set(cat.slug, id);

      for (const hijo of cat.hijos ?? []) {
        const r2 = insertCat.run(id, hijo.nombre, hijo.slug, hijo.orden);
        const id2 = r2.lastInsertRowid
          ? Number(r2.lastInsertRowid)
          : (sqlite.prepare(`SELECT id_categoria FROM categorias WHERE slug = ?`).get(hijo.slug) as { id_categoria: number }).id_categoria;
        slugToId.set(hijo.slug, id2);
      }
    }
    log.info(`Categorías insertadas: ${slugToId.size}`);
  } else {
    // Dry-run: construir mapa con IDs ficticios para estadísticas.
    let fakeId = 1;
    for (const cat of TAXONOMIA) {
      slugToId.set(cat.slug, fakeId++);
      for (const hijo of cat.hijos ?? []) slugToId.set(hijo.slug, fakeId++);
    }
  }

  // ── Paso 2: resolver slugs hoja → slug padre para asignación ────────

  // Los productos se asignan al HIJO (categoría hoja).
  // Si un slug no tiene hijos (es hoja o categoría plana), es el destino final.
  const leafSlugs = new Set<string>();
  for (const cat of TAXONOMIA) {
    if (!cat.hijos || cat.hijos.length === 0) {
      leafSlugs.add(cat.slug);
    } else {
      for (const h of cat.hijos) leafSlugs.add(h.slug);
    }
  }

  // ── Paso 3: clasificar productos ─────────────────────────────────────

  const productos = sqlite.prepare(
    `SELECT id_producto, nombre_producto FROM productos`,
  ).all() as { id_producto: number; nombre_producto: string }[];

  log.info(`Clasificando ${productos.length} productos...`);

  const assignment = new Map<number, string>(); // id_producto → slug
  const slugCount = new Map<string, number>();

  for (const p of productos) {
    const slug = classify(p.nombre_producto);
    assignment.set(p.id_producto, slug);
    slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1);
  }

  // ── Paso 4: resumen ───────────────────────────────────────────────────

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RESUMEN DE CATEGORIZACIÓN                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Agrupar slugs por padre para mostrar jerárquicamente.
  for (const cat of TAXONOMIA) {
    const hijos = cat.hijos ?? [];
    if (hijos.length === 0) {
      const cnt = slugCount.get(cat.slug) ?? 0;
      console.log(`  ${cat.nombre.padEnd(35)} ${cnt}`);
    } else {
      const totalCat = hijos.reduce((s, h) => s + (slugCount.get(h.slug) ?? 0), 0);
      console.log(`\n  ${cat.nombre.toUpperCase()} (${totalCat})`);
      for (const h of hijos) {
        const cnt = slugCount.get(h.slug) ?? 0;
        console.log(`    ${h.nombre.padEnd(33)} ${cnt}`);
      }
    }
  }

  const totalCategorized = productos.length - (slugCount.get('otros') ?? 0);
  const pct = ((totalCategorized / productos.length) * 100).toFixed(1);
  console.log(`\n  Total categorizado: ${totalCategorized} / ${productos.length} (${pct}%)`);
  console.log(`  Sin categoría (otros): ${slugCount.get('otros') ?? 0}`);

  if (!isApply) {
    log.info('\nDRY-RUN completo. Pasá --apply para aplicar.');
    sqlite.close();
    return;
  }

  // ── Paso 5: aplicar asignaciones ─────────────────────────────────────

  const updateProd = sqlite.prepare(
    `UPDATE productos SET id_categoria = ? WHERE id_producto = ?`,
  );

  const run = sqlite.transaction(() => {
    for (const [id_producto, slug] of assignment) {
      const id_cat = slugToId.get(slug);
      if (!id_cat) continue; // 'otros' puede no tener ID si no fue insertado aún
      updateProd.run(id_cat, id_producto);
    }
  });

  run();

  const asignados = sqlite.prepare(
    `SELECT COUNT(*) AS c FROM productos WHERE id_categoria IS NOT NULL`,
  ).get() as { c: number };
  log.info(`\nAsignaciones completadas: ${asignados.c} productos con categoría`);

  sqlite.close();
}

main();
