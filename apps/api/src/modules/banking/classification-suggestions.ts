import type { BankClassificationSuggestion } from '@church/shared';

const uncategorizedIds = new Set([
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
]);

/** Keep identifying numbers; only complete dates are treated as variable text. */
export function classificationPattern(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/.]\d{2}[-/.]\d{4})\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function historicalSuggestion(
  values: ({ id: string; name: string } | null)[],
): BankClassificationSuggestion | null {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const value of values) {
    if (!value || uncategorizedIds.has(value.id)) continue;
    const previous = counts.get(value.id);
    counts.set(value.id, { ...value, count: (previous?.count ?? 0) + 1 });
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  // Missing values and conflicting choices count against agreement independently.
  if (!best || best.count < 3 || best.count / values.length < 0.8) return null;
  return {
    id: best.id,
    name: best.name,
    support: best.count,
    sampleSize: values.length,
    agreement: Math.round((best.count / values.length) * 100),
  };
}
