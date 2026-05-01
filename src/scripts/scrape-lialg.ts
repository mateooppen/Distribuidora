/**
 * Etapa 4.A.4 — Scraping de listadoalg.anmat.gob.ar
 *
 * Descarga todos los productos del listado LIALG actual de ANMAT y los guarda
 * en data/lialg-actual.json para su posterior sincronización con la base de datos.
 *
 * El sitio es ASP.NET WebForms con VIEWSTATE. Usamos POST sin ASYNCPOST para
 * recibir HTML completo (más simple que parsear UpdatePanel).
 *
 * Uso:
 *   npm run db:scrape              → dry-run: descarga pero no guarda
 *   npm run db:scrape -- --save    → descarga y guarda data/lialg-actual.json
 *   npm run db:scrape -- --force   → re-scrapea aunque ya exista el JSON
 *   npm run db:scrape -- --verbose → log extendido (snippets de HTML)
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, '..', '..', 'data', 'lialg-actual.json');
const PROGRESS_PATH = `${OUTPUT_PATH}.progress`;
const BASE_HOST = 'listadoalg.anmat.gob.ar';
const DELAY_MS = 600; // ms entre requests

export interface ProductoLialg {
  rnpa: string;
  marca: string;
  nombre_fantasia: string;
  denominacion: string;
  estado: string;
}

interface SessionState {
  cookie: string;
  viewstate: string;
  viewstateGen: string;
  eventVal: string;
}

interface HttpResult {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function encodeForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function httpsRequest(
  method: 'GET' | 'POST',
  urlPath: string,
  body: string | null,
  extraHeaders: Record<string, string>,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity', // sin compresión — easier to parse
      'Connection': 'keep-alive',
      ...extraHeaders,
    };

    if (body !== null) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      headers['Content-Length'] = Buffer.byteLength(body, 'utf8').toString();
    }

    const req = https.request(
      { hostname: BASE_HOST, port: 443, path: urlPath, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[]>,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('Request timeout')));
    if (body !== null) req.write(body, 'utf8');
    req.end();
  });
}

// Merge cookies: new values override existing ones by cookie name.
function mergeCookies(existing: string, fresh: string): string {
  if (!fresh) return existing;
  if (!existing) return fresh;
  const map = new Map<string, string>();
  for (const part of [...existing.split('; '), ...fresh.split('; ')]) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractSetCookie(headers: Record<string, string | string[]>): string {
  const raw = headers['set-cookie'];
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(c => (c.split(';')[0] ?? '')).filter(Boolean).join('; ');
}

// Extracts value of a hidden ASP.NET field (handles any attribute ordering).
function extractHiddenField(html: string, name: string): string {
  const patterns = [
    new RegExp(`<input[^>]+name="${name}"[^>]*value="([^"]*)"`, 'i'),
    new RegExp(`<input[^>]*value="([^"]*)"[^>]*name="${name}"`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1] !== undefined) return m[1];
  }
  return '';
}

function parseFormState(html: string): Pick<SessionState, 'viewstate' | 'viewstateGen' | 'eventVal'> {
  return {
    viewstate:    extractHiddenField(html, '__VIEWSTATE'),
    viewstateGen: extractHiddenField(html, '__VIEWSTATEGENERATOR'),
    eventVal:     extractHiddenField(html, '__EVENTVALIDATION'),
  };
}

// ASP.NET UpdatePanel partial-postback response parser.
// Format: length|type|id|content|  (length is byte count of content).
function parseUpdatePanel(text: string): {
  panels: Record<string, string>;
  hidden: Record<string, string>;
} {
  const panels: Record<string, string> = {};
  const hidden: Record<string, string> = {};
  let pos = 0;
  while (pos < text.length) {
    const p1 = text.indexOf('|', pos);
    if (p1 === -1) break;
    const len = parseInt(text.slice(pos, p1), 10);
    if (isNaN(len) || len < 0) break;
    const p2 = text.indexOf('|', p1 + 1);
    if (p2 === -1) break;
    const type = text.slice(p1 + 1, p2);
    const p3 = text.indexOf('|', p2 + 1);
    if (p3 === -1) break;
    const id = text.slice(p2 + 1, p3);
    const cs = p3 + 1;
    if (cs + len > text.length) break;
    const content = text.slice(cs, cs + len);
    pos = cs + len + 1;
    if (type === 'updatePanel') panels[id] = content;
    else if (type === 'hiddenField') hidden[id] = content;
  }
  return { panels, hidden };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).trim();
}

// Extracts product rows from a GridView table HTML.
function parseGridView(html: string, verbose: boolean): ProductoLialg[] {
  const products: ProductoLialg[] = [];

  // Locate the GridView table (try by ID first, then largest table fallback).
  const byId = html.match(
    /<table[^>]+id="ctl00_ContentPlaceHolder1_GridView1"[^>]*>([\s\S]*?)<\/table>/i,
  );

  let tableBody: string;
  if (byId) {
    tableBody = byId[1] ?? '';
  } else {
    if (verbose) log.debug('GridView ID no encontrado; buscando tabla más grande');
    // Fallback: pick the first table that has >2 rows (avoid nav tables).
    const allTables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
    const best = allTables
      .map(m => ({ body: m[1] ?? '', rows: (m[1]?.match(/<tr[\s>]/gi) ?? []).length }))
      .sort((a, b) => b.rows - a.rows)[0];
    tableBody = best?.body ?? '';
  }

  if (!tableBody) {
    if (verbose) log.debug('No se encontró tabla de resultados en el HTML');
    return products;
  }

  // Split into rows.
  const trMatches = [...tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  // Detect column mapping from header row.
  let colRnpa = 0, colMarca = 1, colFantasia = 2, colDenominacion = 3, colEstado = 4;
  let headerFound = false;

  for (const trm of trMatches) {
    const rowHtml = trm[1] ?? '';
    // Header row: has <th> elements.
    if (/<th[\s>]/i.test(rowHtml)) {
      const thVals = [...rowHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
        .map(m => cellText(m[1] ?? '').toLowerCase());
      // Try to map known column names.
      thVals.forEach((h, i) => {
        if (/rnpa|n[°º].?registro|registro/.test(h)) colRnpa = i;
        else if (/marca/.test(h) && !/fantasi/.test(h)) colMarca = i;
        else if (/fantas/.test(h)) colFantasia = i;
        else if (/denomin/.test(h)) colDenominacion = i;
        else if (/estado/.test(h)) colEstado = i;
      });
      headerFound = true;
      if (verbose) log.debug(`Columnas detectadas: ${JSON.stringify(thVals)}`);
      continue;
    }

    // Skip pager rows (contain Page$ links or have no real text).
    if (/Page\$\d+|__doPostBack/.test(rowHtml)) continue;

    // Extract data cells.
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => cellText(m[1] ?? ''));

    if (cells.length < 2) continue;

    products.push({
      rnpa:           cells[colRnpa]          ?? '',
      marca:          cells[colMarca]         ?? '',
      nombre_fantasia: cells[colFantasia]     ?? '',
      denominacion:   cells[colDenominacion]  ?? '',
      estado:         cells[colEstado]        ?? '',
    });
  }

  if (!headerFound && verbose) log.debug('Fila de encabezado no detectada; usando columnas por defecto');
  return products;
}

// Returns the highest page number visible in the GridView pager (Page$N links).
function maxPageInPager(html: string): number {
  const matches = [...html.matchAll(/Page\$(\d+)/g)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map(m => parseInt(m[1]!, 10)));
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function initialGet(): Promise<SessionState> {
  const res = await httpsRequest('GET', '/Home', null, {});
  if (res.status !== 200 && res.status !== 302)
    throw new Error(`GET /Home devolvió ${res.status}`);
  const cookie = extractSetCookie(res.headers);
  return { cookie, ...parseFormState(res.body) };
}

// Base form fields (common to all POSTs).
function baseFormBody(state: SessionState, extra: Record<string, string>): string {
  return encodeForm({
    '__EVENTTARGET':  '',
    '__EVENTARGUMENT': '',
    '__VIEWSTATE':    state.viewstate,
    '__VIEWSTATEGENERATOR': state.viewstateGen,
    '__EVENTVALIDATION': state.eventVal,
    'ctl00$ContentPlaceHolder1$txtRNPA':          '',
    'ctl00$ContentPlaceHolder1$txtMarcaFantasia':  '',
    'ctl00$ContentPlaceHolder1$ddEstado':          '-1', // Todos
    'ctl00$ContentPlaceHolder1$txtDenominacion':   '',
    ...extra,
  });
}

function postHeaders(state: SessionState, isAsync: boolean): Record<string, string> {
  const h: Record<string, string> = {
    'Cookie':  state.cookie,
    'Referer': `https://${BASE_HOST}/Home`,
    'Cache-Control': 'no-cache',
  };
  if (isAsync) {
    h['X-MicrosoftAjax'] = 'Delta=true';
    h['X-Requested-With'] = 'XMLHttpRequest';
  }
  return h;
}

// Extracts products + new state from an HTTP response.
// Handles both full HTML and ASP.NET UpdatePanel partial responses.
function processResponse(
  res: HttpResult,
  prevState: SessionState,
  verbose: boolean,
): { products: ProductoLialg[]; state: SessionState; maxPage: number } {
  const newCookie = mergeCookies(prevState.cookie, extractSetCookie(res.headers));
  const ct = (res.headers['content-type'] as string | undefined) ?? '';

  let html: string;
  let viewstate    = prevState.viewstate;
  let viewstateGen = prevState.viewstateGen;
  let eventVal     = prevState.eventVal;

  // UpdatePanel partial response (text/plain; charset=utf-8 with Delta=true).
  if (ct.includes('text/plain') || res.body.startsWith('1|') || res.body.match(/^\d+\|/)) {
    const { panels, hidden } = parseUpdatePanel(res.body);
    html = panels['ctl00_ContentPlaceHolder1_UpdatePanel1'] ?? '';
    if (!html && verbose) log.debug(`Paneles recibidos: ${Object.keys(panels).join(', ') || '(ninguno)'}`);
    if (hidden['__VIEWSTATE'])            viewstate    = hidden['__VIEWSTATE'];
    if (hidden['__VIEWSTATEGENERATOR'])   viewstateGen = hidden['__VIEWSTATEGENERATOR'];
    if (hidden['__EVENTVALIDATION'])      eventVal     = hidden['__EVENTVALIDATION'];
    // Supplement with hidden fields from UpdatePanel body if any.
    const supplement = parseFormState(html);
    if (supplement.viewstate)    viewstate    = supplement.viewstate;
    if (supplement.viewstateGen) viewstateGen = supplement.viewstateGen;
    if (supplement.eventVal)     eventVal     = supplement.eventVal;
  } else {
    // Full HTML page.
    html = res.body;
    const fs = parseFormState(html);
    if (fs.viewstate)    viewstate    = fs.viewstate;
    if (fs.viewstateGen) viewstateGen = fs.viewstateGen;
    if (fs.eventVal)     eventVal     = fs.eventVal;
  }

  if (verbose) log.debug(`HTML snippet (500 chars): ${html.slice(0, 500)}`);

  const products = parseGridView(html, verbose);
  const maxPage  = maxPageInPager(html);

  return {
    products,
    maxPage,
    state: { cookie: newCookie, viewstate, viewstateGen, eventVal },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isSave    = process.argv.includes('--save');
  const isForce   = process.argv.includes('--force');
  const isVerbose = process.argv.includes('--verbose');

  if (!isForce && fs.existsSync(OUTPUT_PATH)) {
    const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')) as ProductoLialg[];
    log.info(`Ya existe data/lialg-actual.json con ${data.length} productos.`);
    log.info('Usá --force para re-scrapear o npm run db:sync para sincronizar.');
    return;
  }

  log.info('Paso 1: GET inicial para obtener session + VIEWSTATE...');
  let state = await initialGet();
  log.debug(`Session: ${state.cookie.slice(0, 60)}...`);
  log.debug(`VIEWSTATE length: ${state.viewstate.length}`);

  if (!state.viewstate) {
    log.error('No se pudo obtener VIEWSTATE. Verificar la URL del sitio.');
    process.exit(1);
  }

  // ── Estrategia 1: POST sin ASYNCPOST (respuesta HTML completa) ────────────
  log.info('Paso 2: Búsqueda inicial (todos los productos, página 1)...');

  const searchBody = baseFormBody(state, {
    'ctl00$ContentPlaceHolder1$cmdBuscar': 'Buscar',
  });

  let res = await httpsRequest('POST', '/Home', searchBody, postHeaders(state, false));

  let { products, state: newState, maxPage } = processResponse(res, state, isVerbose);
  state = newState;

  // ── Estrategia 2: si no hubo productos, intentar con ASYNCPOST ────────────
  if (products.length === 0) {
    log.warn('Respuesta HTML sin productos. Intentando con UpdatePanel (ASYNCPOST)...');

    const asyncBody = baseFormBody(state, {
      'ctl00$ScriptManager1':
        'ctl00$ContentPlaceHolder1$UpdatePanel1|ctl00$ContentPlaceHolder1$cmdBuscar',
      'ctl00$ContentPlaceHolder1$cmdBuscar': 'Buscar',
      '__ASYNCPOST': 'true',
    });

    res = await httpsRequest('POST', '/Home', asyncBody, postHeaders(state, true));
    const r2 = processResponse(res, state, isVerbose);
    products = r2.products;
    state    = r2.state;
    maxPage  = r2.maxPage;
  }

  if (products.length === 0) {
    log.error('La primera página no devolvió productos.');
    log.error('Posibles causas: cambio en la estructura del sitio, campo de formulario distinto.');
    log.error('Ejecutá con --verbose para ver el HTML recibido.');
    process.exit(1);
  }

  log.info(`Página 1: ${products.length} productos. Máx página visible en pager: ${maxPage}`);

  const allProducts: ProductoLialg[] = [...products];
  let page = 2;

  // ── Paginación ────────────────────────────────────────────────────────────
  while (true) {
    await delay(DELAY_MS);

    const pageBody = baseFormBody(state, {
      '__EVENTTARGET':  'ctl00$ContentPlaceHolder1$GridView1',
      '__EVENTARGUMENT': `Page$${page}`,
    });

    res = await httpsRequest('POST', '/Home', pageBody, postHeaders(state, false));

    if (res.status !== 200) {
      log.warn(`Página ${page}: status ${res.status}. Deteniendo paginación.`);
      break;
    }

    const r = processResponse(res, state, isVerbose);
    state = r.state;

    if (r.products.length === 0) {
      log.info(`Página ${page}: sin productos → fin del scraping.`);
      break;
    }

    allProducts.push(...r.products);

    const total = allProducts.length;
    if (page % 20 === 0) {
      log.info(`Progreso: página ${page}, ${total} productos acumulados`);
      if (isSave) {
        fs.writeFileSync(PROGRESS_PATH, JSON.stringify(allProducts, null, 2), 'utf8');
      }
    }

    page++;
    if (page > 3000) {
      log.warn('Límite de seguridad: 3000 páginas. Deteniendo.');
      break;
    }
  }

  log.info(`\nTotal scrapeado: ${allProducts.length} productos en ${page - 1} páginas`);

  // Eliminar duplicados por RNPA (por si alguna paginación devolvió solapamiento).
  const seen = new Set<string>();
  const deduped = allProducts.filter(p => {
    if (!p.rnpa || seen.has(p.rnpa)) return false;
    seen.add(p.rnpa);
    return true;
  });
  if (deduped.length < allProducts.length) {
    log.info(`Deduplicados por RNPA: ${allProducts.length - deduped.length} registros removidos`);
  }

  // Resumen de estados.
  const byEstado = new Map<string, number>();
  for (const p of deduped) {
    byEstado.set(p.estado, (byEstado.get(p.estado) ?? 0) + 1);
  }
  log.info('Distribución de estados:');
  for (const [est, cnt] of byEstado) {
    log.info(`  ${est || '(vacío)'}: ${cnt}`);
  }

  if (isSave) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deduped, null, 2), 'utf8');
    // Borrar archivo de progreso si existía.
    if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
    log.info(`Guardado en data/lialg-actual.json`);
  } else {
    log.info('DRY-RUN: no se guardó el archivo. Usá --save para guardar.');
  }
}

main().catch(err => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
