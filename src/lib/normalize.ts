// Funciones de normalización de strings provenientes del CSV de ANMAT.
//
// Heurísticas en `normalizeMarca`:
//   - trim + colapso de espacios internos.
//   - Title Case por palabra, respetando siglas societarias argentinas conocidas
//     en mayúsculas (S.A., S.R.L., SRL, etc.) y conectores en minúsculas.

const SIGLAS_PRESERVAR = new Set([
  'S.A.', 'S.R.L.', 'S.A.S.', 'S.C.A.', 'S.C.S.', 'S.H.', 'S.A.U.',
  'S.A.C.I.F.', 'S.A.C.I.', 'S.A.C.I.F.I.A.', 'S.A.I.C.', 'S.A.I.C.F.',
  'I.C.S.A.', 'I.C.', 'C.I.', 'S.A.I.', 'S.A.I.C.A.',
  'SA', 'SRL', 'SAS', 'SCA', 'SCS', 'SH', 'SAU',
  'SACIF', 'SACI', 'SAIC', 'SAICF', 'ICSA',
]);

const CONECTORES_LOWER = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en']);

function titleCaseWord(word: string, isFirst: boolean): string {
  if (word.length === 0) return word;
  const upper = word.toUpperCase();
  if (SIGLAS_PRESERVAR.has(upper)) return upper;
  const lower = word.toLowerCase();
  if (!isFirst && CONECTORES_LOWER.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeMarca(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = collapseSpaces(raw);
  if (cleaned.length === 0) return '';
  return cleaned
    .split(' ')
    .map((token, idx) => {
      if (token.includes('-')) {
        return token.split('-').map((p, i) => titleCaseWord(p, idx === 0 && i === 0)).join('-');
      }
      return titleCaseWord(token, idx === 0);
    })
    .join(' ');
}

export function slugify(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/ç/gi, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function nullifyEmpty(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const t = raw.trim();
  return t.length === 0 ? null : t;
}

export function cleanText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const c = collapseSpaces(raw);
  return c.length === 0 ? null : c;
}
