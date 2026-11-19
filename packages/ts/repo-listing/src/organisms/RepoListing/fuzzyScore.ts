/**
 * Subsequence fuzzy match with an adjacency-weighted score.
 *
 * - Empty query → 0 (neutral).
 * - Contiguous substring → high score (`1000 - index`), so exact hits rank first.
 * - Otherwise counts an in-order subsequence, rewarding adjacent characters.
 * - Returns -1 when the query is not a subsequence of the text (no match).
 */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 1000 - t.indexOf(q);

  let qi = 0;
  let score = 0;
  let last = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += last === ti - 1 ? 5 : 1;
      last = ti;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}
