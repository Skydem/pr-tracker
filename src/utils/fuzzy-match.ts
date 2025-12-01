function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeName(str1);
  const norm2 = normalizeName(str2);

  if (norm1 === norm2) return 1.0;

  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const longer = Math.max(norm1.length, norm2.length);
    const shorter = Math.min(norm1.length, norm2.length);
    return shorter / longer;
  }

  const tokens1 = new Set(norm1.split(" ").filter((t) => t.length > 1));
  const tokens2 = new Set(norm2.split(" ").filter((t) => t.length > 1));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = [...tokens1].filter((t) => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;

  const tokenSimilarity = intersection / union;
  const levenshteinSim =
    1 - levenshteinDistance(norm1, norm2) / Math.max(norm1.length, norm2.length);

  return tokenSimilarity * 0.7 + levenshteinSim * 0.3;
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[n];
}

export interface FuzzyMatchResult<T> {
  item: T;
  score: number;
}

export function findBestMatch<T>(
  query: string,
  items: T[],
  getSearchField: (item: T) => string,
  minThreshold: number = 0.6
): FuzzyMatchResult<T> | null {
  let bestMatch: FuzzyMatchResult<T> | null = null;

  for (const item of items) {
    const score = calculateSimilarity(query, getSearchField(item));
    if (score >= minThreshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { item, score };
    }
  }

  return bestMatch;
}
