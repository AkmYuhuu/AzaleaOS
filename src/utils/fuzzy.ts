// honey: O(n*m) fine <1k items; no index needed. Simple substring + char-order fallback.
export function score(query: string, label: string): number {
  const q = query.trim().toLowerCase();
  const l = label.toLowerCase();
  if (!q) return 0;
  if (l === q) return 100;
  // exact substring - higher score for earlier position and tighter fit
  const idx = l.indexOf(q);
  if (idx !== -1) {
    // 80 base + bonus for prefix + penalty for offset + ratio bonus
    const prefixBonus = idx === 0 ? 10 : 0;
    const ratioBonus = (q.length / l.length) * 10;
    return 80 + prefixBonus + ratioBonus - idx * 0.5;
  }
  // sequential char order (fuzzy): all chars of q appear in order in l
  let qi = 0;
  let li = 0;
  let gaps = 0;
  let lastMatch = -1;
  let consecutive = 0;
  let maxConsecutive = 0;
  while (qi < q.length && li < l.length) {
    if (q[qi] === l[li]) {
      if (lastMatch !== -1) gaps += li - lastMatch - 1;
      if (lastMatch !== -1 && li === lastMatch + 1) consecutive++;
      else consecutive = 1;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
      lastMatch = li;
      qi++;
    }
    li++;
  }
  if (qi !== q.length) return 0;
  // partial sequential match - lower tier but still visible
  // bonus for word boundaries (space, '/', '-', '_')
  let boundaryBonus = 0;
  qi = 0;
  li = 0;
  while (qi < q.length && li < l.length) {
    if (q[qi] === l[li]) {
      const prev = li > 0 ? l[li - 1] : " ";
      if (prev === " " || prev === "/" || prev === "-" || prev === "_" || prev === ".") boundaryBonus += 2;
      qi++;
    }
    li++;
  }
  return 40 + maxConsecutive * 2 + boundaryBonus - gaps * 0.8 - (l.length - q.length) * 0.05;
}

export function filterAndSort<T extends { label: string }>(items: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return items;
  const scored = items
    .map((it) => ({ item: it, s: score(q, it.label) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.item);
}
