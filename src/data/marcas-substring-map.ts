/**
 * Tabla de correspondencia substring → marca para productos ANMAT con marca "No Registra".
 *
 * ANMAT omite el campo marca en ~1.600 productos. En muchos casos la marca real
 * aparece dentro de nombre_fantasia o nombre_producto como substring reconocible.
 * Este archivo centraliza ese conocimiento para que sea fácil de mantener y auditar.
 *
 * Formato de cada entrada: [substring_a_buscar, nombre_marca_normalizado]
 *
 * Reglas de uso (ver fix-marcas-no-registra.ts):
 *   - La búsqueda es case-insensitive sobre nombre_fantasia + nombre_producto.
 *   - El PRIMER match de la lista gana → el orden importa para evitar solapamientos.
 *     Ejemplo: "IRON BAR" debe ir ANTES que "GENTECH" porque "Iron Bar Menta" no
 *     contiene "GENTECH"; si el orden fuera inverso, ese producto no matchearía nada.
 *   - Los typos del dataset se mapean al mismo nombre normalizado que la variante correcta.
 *   - Cuando varias líneas de producto (sub-marcas) pertenecen a la misma empresa,
 *     todas apuntan al mismo nombre_marca_normalizado (ej: IRON BAR, IRON GEL → Gentech).
 *
 * Para agregar una nueva marca:
 *   1. Identificar el substring más específico que la identifique sin ambigüedad.
 *   2. Agregar la entrada en la sección temática correspondiente.
 *   3. Si hay typos conocidos en el dataset, agregar entradas adicionales comentadas.
 *   4. Actualizar CLAUDE.md con el nuevo entry en la sección SUBSTRING_MARCAS.
 */

export const MARCAS_SUBSTRING_MAP: [string, string][] = [

  // ── Suplementos deportivos y nutrición ────────────────────────────────────────

  // Gentech: Iron Bar / Iron Gel son líneas de producto de la misma marca.
  // Deben ir ANTES de 'GENTECH' para que matcheen aunque la fantasía no diga "Gentech".
  ['IRON BAR',             'Gentech'],
  ['IRON GEL',             'Gentech'],
  ['IRON ISOTONIC',        'Gentech'],
  ['IRON FULL RECOVERY',   'Gentech'],
  ['GEN TECH',             'Gentech'],
  ['GENTECH',              'Gentech'],

  ['GENERATION FIT',       'Generation Fit'],
  ['AMERICAN FORCE',       'American Force'],
  ['AMPK',                 'AMPK'],
  ['INSULOW',              'Insulow'],
  ['PULVER',               'Pulver'],
  ['QUALIVITS',            'Qualivits'],
  ['QUELAT',               'Quelat'],

  ['PLACER FITNESS',       'Placer Fitness'],
  ['PLACER FIRTNESS',      'Placer Fitness'],  // typo en dataset
  ['PLACER FIT',           'Placer Fitness'],

  ['STALLION',             'Stallion'],
  ['DYNOVANCE',            'Dynovance'],
  ['BENELETA',             'Benelta'],
  ['BENELTA',              'Benelta'],
  ['SATIAL',               'Satial'],
  ['SEMECPRO',             'Semecpro'],
  ['BODY ADVANCE',         'Body Advance'],
  ['RAD 60',               'RAD 60'],
  ['RECUPERAT-ION',        'Recuperat-ion'],
  ['RECUPERATION',         'Recuperat-ion'],   // variante sin guión
  ['4S FOURSPORT',         '4S Foursport'],
  ['2GOOD',                '2Good'],
  ['HD HAPPY DRINK',       'HD Happy Drink'],
  ['GLASSUP',              'Glassup'],
  ['GIOVEGEN',             'Giovegen'],
  ['SUPPLER',              'Suppler'],          // sub-marcas: ADVANCE/BALANCE/CARE/RECOVERY BY SUPPLER
  ['WPN',                  'WPN'],

  // Research+MD: empresa con múltiples líneas registradas bajo nombres distintos.
  // MANACOR, MENACOR y FLORAGUT son sub-líneas de la misma empresa.
  ['RESEARCH + MD',        'Research+MD'],
  ['RESERACH+MD',          'Research+MD'],      // typo frecuente en dataset
  ['RESEARCH+MD',          'Research+MD'],
  ['MANACOR',              'Research+MD'],
  ['MENACOR',              'Research+MD'],
  ['FLORAGUT',             'Research+MD'],

  ['VITAMET',              'Vitamet'],
  ['METASITOL',            'Metasitol'],
  ['NUTRI 100',            'Nutri 100'],
  ['NUTRI100',             'Nutri 100'],
  ['IO NATURALE',          'IO Naturale'],
  ['INCAICO',              'Incaico'],

  ['EMM FOODS',            'EMM Foods'],
  ['EMM FOOS',             'EMM Foods'],        // typo en dataset

  // ── Infusiones y suplementos naturales ───────────────────────────────────────

  // Hierbas del Oasis tiene +60 productos; aparece como prefijo o sufijo según el tipo.
  ['HIERBAS DEL OASIS',    'Hierbas del Oasis'],

  // ── Alimentos, bebidas y productos de consumo ────────────────────────────────

  ['LA TRANQUILINA',       'La Tranquilina'],
  ['LA DELFINA',           'La Delfina'],
  ['LEDEVIT',              'Ledevit'],
  ['BASSO',                'Basso'],
  ['IL FRUTTO',            'Il Frutto'],

  ['BIGGYS',               "Biggy's Snacks"],
  ["BIGGY'S",              "Biggy's Snacks"],

  ['BONYUZZ',              'Bonyuzz'],
  ['CAMPOBRAVO',           'Campobravo'],

  ['EL SECRETO DEL CHAMAN','El Secreto del Chamán'],
  ['EL SECRETO DE CHAMAN', 'El Secreto del Chamán'],  // variante sin "del"

  ['CHOCOLATE COLONIAL',   'Chocolate Colonial'],
  ['DEK SOM',              'Dek Som Boom'],
  ['PACARI',               'Pacari'],
  ['RAW BAR',              'Raw Bar'],

  // Pehuenut (cremas de frutos secos) es una marca distinta a Peh Food (salsas/syropes).
  ['PEHUENUT',             'Pehuenut'],
  ['PEHFOOD',              'Peh Food'],
  ['PEH FOOD',             'Peh Food'],

  ['EL CASTAÑO',           'El Castaño'],
  ['ELCASTAÑO',            'El Castaño'],       // sin espacio, typo en dataset

  ['GREATING',             'Greating'],

  ["CURT'S CLASSIC",       "Curt's Classic"],
  ["CURT´S CLASSIC",       "Curt's Classic"],   // acento diferente en dataset

  ['DIA - SIN GLUTEN',     'Dia'],
  ['LA INGLESA',           'La Inglesa'],
  ['LENNYS',               'Lennys'],
  ['MINA GINGER',          'Mina'],
  ['SIPAN',                'Sipán'],

  // Mama: fideos/arroz instantáneo tailandés; aparece con sub-líneas diversas.
  ['MAMA GLUTEN FREE',     'Mama'],
  ['MAMA HAIDI',           'Mama'],
  ['MAMA HANDI',           'Mama'],
  ['MAMA INSTANT',         'Mama'],
  ['MAMA SINGAPORE',       'Mama'],
  ['MAMA MEAL',            'Mama'],
  ['MAMA RICE',            'Mama'],

  ['HENDEL',               'Hendel'],
  ['NAT/DELUXE',           'NAT'],
  ['FRAMINGHAM',           'Framingham'],
  ['PERLIVIT',             'Perlivit'],

  // ── Marcas identificadas en revisiones anteriores ────────────────────────────

  ['SCHAR',                'Schär'],
  ['SMAMS',                'Smams'],
  ['ONE FORCE',            'One Force'],
  ['SANTA QUINA',          'Santa Quina'],
  ['CRUDENCIO',            'Crudencio'],
  ['MERLIN BAR',           'Merlin Bar'],
  ['NATURAL SEED',         'Natural Seed'],
  ['YIN YANG',             'Yin Yang'],
  ['ETOSHA',               'Etosha'],
  ['CARREFOUR',            'Carrefour'],
  ['IVESS',                'Ivess'],
  ['BONSAI',               'Bonsai'],
  ['OZGANIC',              'Ozganic'],
  ['PURE WELLNESS',        'Pure Wellness'],
  ['PURE WELNESS',         'Pure Wellness'],     // typo en dataset
  ['TRUSTEIN',             'Trustein'],
  ['SINTAXIS',             'Sintaxis'],
  ['SINTAXIX',             'Sintaxis'],           // typo en dataset
  ['FLORIDA GRAND',        'Florida Grand Mixers'],
  ['ALPES',                'Alpes'],
  ['BIOMAC',               'Biomac Be Natural'],
  ['STELLE',               'Stelle'],
  ['ARGENFRUT',            'Argenfrut'],
];
