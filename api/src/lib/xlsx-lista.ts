/**
 * Generación del Excel de la lista de pedido.
 *
 * El archivo lo abre un proveedor, no un sistema: por eso lleva encabezado con
 * título y fecha antes de la tabla, y los productos van agrupados por marca —
 * que es como el proveedor lee su propio catálogo.
 *
 * Estructura:
 *
 *   A1   LISTA DE PEDIDO — San Felipa      (merge A1:C1)
 *   A2   Fecha: 12/08/2026
 *   A3   34 productos · 7 marcas
 *   A4   (vacía)
 *   A5   MARCA | PRODUCTO | RNPA           (encabezado, fila congelada)
 *   A6…  filas, marca alfabética y producto alfabético dentro de cada marca
 *
 * Se genera con exceljs (única dependencia agregada por esta funcionalidad).
 * Va en la API y no en el frontend para no sumarle ~900KB al bundle.
 */

import ExcelJS from 'exceljs';
import { nombreVisible } from './nombre-producto.js';

export interface FilaPedido {
  nombre_marca: string;
  nombre_producto: string;
  nombre_fantasia: string | null;
  numero_registro: string | null;
}

const TITULO = 'LISTA DE PEDIDO — San Felipa';

/** Ancho de columna en "caracteres" de Excel. */
const ANCHOS = { marca: 22, producto: 60, rnpa: 18 } as const;

const GRIS_ENCABEZADO = 'FFEFEFEF';

/**
 * Ordena las filas como van a salir en el archivo: por marca y, dentro de cada
 * marca, por el nombre con el que se ve el producto. `localeCompare` con 'es'
 * para que los acentos no manden las marcas al final.
 */
function ordenar(filas: FilaPedido[]): FilaPedido[] {
  return filas.slice().sort((a, b) => {
    const marca = a.nombre_marca.localeCompare(b.nombre_marca, 'es');
    if (marca !== 0) return marca;
    return nombreVisible(a.nombre_fantasia, a.nombre_producto).localeCompare(
      nombreVisible(b.nombre_fantasia, b.nombre_producto),
      'es',
    );
  });
}

/** Nombre de archivo con la fecha, para que no se pisen dos pedidos distintos. */
export function nombreArchivo(fecha = new Date()): string {
  const iso = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
  return `lista-pedido-${iso}.xlsx`;
}

export async function generarXlsxPedido(
  filas: FilaPedido[],
  fecha = new Date(),
): Promise<Buffer> {
  const ordenadas = ordenar(filas);
  const marcas = new Set(ordenadas.map((f) => f.nombre_marca));

  const wb = new ExcelJS.Workbook();
  wb.created = fecha;
  const ws = wb.addWorksheet('Pedido');

  ws.columns = [
    { key: 'marca', width: ANCHOS.marca },
    { key: 'producto', width: ANCHOS.producto },
    { key: 'rnpa', width: ANCHOS.rnpa },
  ];

  // ── Encabezado ──────────────────────────────────────────────────────────
  ws.mergeCells('A1:C1');
  const celdaTitulo = ws.getCell('A1');
  celdaTitulo.value = TITULO;
  celdaTitulo.font = { bold: true, size: 14 };

  ws.getCell('A2').value = `Fecha: ${fecha.toLocaleDateString('es-AR')}`;
  ws.getCell('A3').value =
    `${ordenadas.length} producto${ordenadas.length === 1 ? '' : 's'} · ` +
    `${marcas.size} marca${marcas.size === 1 ? '' : 's'}`;

  // A4 queda vacía a propósito: separa el encabezado de la tabla.

  // ── Encabezado de la tabla ──────────────────────────────────────────────
  const FILA_ENCABEZADO = 5;
  const encabezado = ws.getRow(FILA_ENCABEZADO);
  encabezado.values = ['MARCA', 'PRODUCTO', 'RNPA'];
  encabezado.font = { bold: true };
  encabezado.eachCell((celda) => {
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: GRIS_ENCABEZADO },
    };
    celda.border = { bottom: { style: 'thin' } };
  });

  // Congela todo lo de arriba del primer producto: al scrollear una lista larga
  // los títulos de columna siguen a la vista.
  ws.views = [{ state: 'frozen', ySplit: FILA_ENCABEZADO }];

  // ── Filas ───────────────────────────────────────────────────────────────
  for (const fila of ordenadas) {
    const agregada = ws.addRow({
      marca: fila.nombre_marca,
      producto: nombreVisible(fila.nombre_fantasia, fila.nombre_producto),
      // Como TEXTO y no como número: hay RNPA con ceros a la izquierda y con
      // guiones ("01-006162"), que Excel convertiría en 1006162 o en una fecha.
      rnpa: fila.numero_registro ?? '',
    });
    agregada.getCell('rnpa').numFmt = '@';
    agregada.getCell('producto').alignment = { wrapText: true, vertical: 'top' };
  }

  // exceljs tipa el retorno como su propio Buffer; en Node es un Buffer real.
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
