// Wagner-Fischer: distancia de edición entre dos strings.
// Optimizado con una sola fila de DP (O(min(m,n)) espacio).
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Trabajamos siempre con `a` como la más corta para ahorrar memoria.
  if (a.length > b.length) [a, b] = [b, a];

  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array<number>(m + 1);

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        (prev[i] ?? i) + 1,     // delete
        (curr[i - 1] ?? j) + 1, // insert
        (prev[i - 1] ?? i - 1) + cost,  // replace
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m] ?? m;
}
