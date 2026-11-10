export type Metric = { id: string; label: string; unit: string; direction: "asc" | "desc"; decimals?: number; description?: string };
export type Category = { id: string; name: string; total: number; criterion: string };
export type Provider = {
  id: string; name: string; description: string; mode: string; color: string;
  scores: Record<string, number | null>; passed: number | null;
  passedDerivation?: string | null; categoryPassed?: Record<string, number>;
};
export type Benchmark = {
  id: string; name: string; eyebrow: string; description: string;
  taskCount: number; providerCount: number; primaryMetric: string; providerLabel?: string;
  metrics: Metric[]; providers: Provider[]; methodology: string[];
  categories?: Category[];
  otherBest?: Record<string, number>;
  dimensions?: { name: string; pages: number }[];
};
export type Entry = {
  id: string; date: string; dateKind?: string; file: string;
  benchmarks: { id: string; name: string }[];
};
export type Index = { schemaVersion: number; entries: Entry[] };
export type Snapshot = {
  schemaVersion: number; id: string; snapshotDate: string;
  measuredAt: string | null; dateKind: string;
  source: { url: string; title: string; versionId: string | null; kind?: string; sha256?: string; importedAt: string; method: string; scope: string; dateNote: string };
  benchmarks: Benchmark[];
  evidence: { id: string; section: string; text: string }[];
};

export function sortProviders(providers: Provider[], metric: string, direction: "asc" | "desc") {
  return [...providers].sort((a, b) => {
    const left = a.scores[metric], right = b.scores[metric];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return direction === "asc" ? left - right : right - left;
  });
}

export function selectEntry(entries: Entry[], date: string, benchmark: string) {
  return entries.find(entry => entry.date === date && entry.benchmarks.some(item => item.id === benchmark)) ?? null;
}

export function sumCategoryPasses(provider: Provider, categories: Category[]) {
  let total = 0;
  for (const category of categories) {
    const value = provider.categoryPassed?.[category.id];
    if (typeof value !== "number") return null;
    total += value;
  }
  return total;
}

export function formatMetric(value: number | null | undefined, unit: string, decimals = unit === "percent" ? 1 : 2) {
  if (value == null) return "—";
  return `${unit === "usd" ? "$" : ""}${value.toFixed(decimals)}${unit === "percent" ? "%" : unit === "seconds" ? " s" : ""}`;
}
