import { canonicalVersion, compareVersions, releaseDate } from "./result-version.mjs";
export { canonicalVersion, compareVersions } from "./result-version.mjs";

export type Metric = { id: string; label: string; unit: string; direction: "asc" | "desc"; decimals?: number; description?: string; signed?: boolean; highlightBest?: boolean; chartRange?: [number, number] };
export type CategoryDefinition = { id: string; name: string; criterion: string };
export type Category = CategoryDefinition & { total: number };
export type Provider = {
  id: string; name: string; description: string; mode: string;
  scores: Record<string, number | null>; passed: number | null;
  passedDerivation?: string | null; categoryPassed?: Record<string, number>;
  samples?: Record<string, number>;
  counts?: Record<string, { count: number; total: number }>;
  pricing?: Pricing;
  billingDescription?: string;
  confidenceIntervals?: Record<string, { lower: number; upper: number; level: number }>;
};
export type Pricing = { min: number | null; max: number | null; approximate?: boolean; softwareCost?: number; description: string };
export type Definition = {
  id: string; primaryMetric: string; metrics: Metric[]; rankable?: boolean;
  categories?: CategoryDefinition[]; leadingMetricIds?: string[];
};
export type BenchmarkExample = { taskId: string; sourceUrl: string; referenceUrl?: string; input: string; steps: string[]; outputLabel: string; output: string; check: string };
export type BenchmarkInfo = {
  example?: BenchmarkExample;
  id: string; trackId: string; name: string; datasetName: string; description: string;
  datasetUrl: string; reportUrl: string; providerLabel: string;
  searchGroup?: "scenarios" | "facts"; outputLayer?: "L1" | "L2" | "L3";
  definitions: Definition[];
};
export type Catalog = {
  schemaVersion: number;
  translations?: { zh: Record<string, string>; en?: Record<string, string> };
  providerUrls: Record<string, string>;
  pricingSources?: Record<string, { label: string; url: string }[]>;
  navigationGroups?: { id: string; name: string; description: string; upcoming?: { id: string; name: string; description: string }[] }[];
  tracks: { id: string; name: string; description: string; url?: string; groupId?: string }[];
  benchmarks: BenchmarkInfo[];
};
export type BenchmarkResult = {
  id: string; definitionId: string; taskCount: number; providers: Provider[];
  categoryTotals?: Record<string, number>;
  metricSamples?: Record<string, { sampleCount?: number; scope?: string; note?: string }>;
  notes: string[]; reportUrl: string | null;
  otherBest?: Record<string, number>;
  sourceMatches?: Record<string, { original: number; equivalent: number; replica: number; missing: number }>;
};
export type Benchmark = Omit<BenchmarkInfo, "definitions"> & Omit<Definition, "id" | "categories"> & Omit<BenchmarkResult, "reportUrl"> & {
  categories: Category[]; providerCount: number;
};
export type Entry = {
  id: string; version: string; file: string;
  benchmarks: string[];
  date?: string | null; dateKind?: string;
};
export type Snapshot = {
  id: string; version: string; datasetDifference: string;
  release?: { date: string; kind: "protocol" | "results" | "metadata"; previous: string | null; summary: string };
  translations?: { zh: Record<string, string>; en?: Record<string, string> };
  source: { url: string; title: string; kind?: string; sha256?: string; linkLabel?: string; importedAt: string; method: string; scope: string; dateNote: string };
  benchmarks: BenchmarkResult[];
  evidence: { id: string; section: string; text: string }[];
};
export type ReportFile = { file: string; report: Snapshot };

export function reportEntries(files: ReportFile[]): Entry[] {
  return files.map(({ file, report }) => ({
    file, id: report.id, version: report.version, date: releaseDate(report).date, dateKind: releaseDate(report).kind,
    benchmarks: report.benchmarks.map(benchmark => benchmark.id),
  }));
}

export function resolveBenchmark(catalog: Catalog, result: BenchmarkResult): Benchmark {
  const info = catalog.benchmarks.find(item => item.id === result.id);
  const definition = info?.definitions.find(item => item.id === result.definitionId);
  if (!info || !definition) throw new Error("Unknown benchmark or evaluation definition");
  const { definitions: _, ...details } = info;
  return {
    ...details, ...definition, ...result,
    reportUrl: result.reportUrl ?? info.reportUrl,
    metrics: definition.metrics.map(metric => {
      const sample = result.metricSamples?.[metric.id];
      const context = [sample?.sampleCount == null ? "" : `${sample.sampleCount} samples.`,
        sample?.scope === "all-search-calls" ? "Shared across both query sets." : "", sample?.note].filter(Boolean).join(" ");
      return context ? { ...metric, description: `${metric.description ?? ""} ${context}`.trim() } : metric;
    }),
    categories: (definition.categories ?? []).map(category => ({ ...category, total: result.categoryTotals![category.id] })),
    providerCount: result.providers.length,
  };
}

export function benchmarkEntries(entries: Entry[], benchmark: string) {
  return entries
    .filter(entry => entry.benchmarks.includes(benchmark))
    .sort((left, right) => compareVersions(left.version, right.version));
}

export function selectEntry(entries: Entry[], version: string, benchmark: string) {
  try { return entries.find(entry => canonicalVersion(entry.version) === canonicalVersion(version) && entry.benchmarks.includes(benchmark)) ?? null; } catch { return null; }
}

export function latestEntry(entries: Entry[], benchmark: string) {
  return benchmarkEntries(entries, benchmark).at(-1) ?? null;
}

export function sortProviders(providers: Provider[], metric: string, direction: "asc" | "desc") {
  return [...providers].sort((a, b) => {
    const left = a.scores[metric], right = b.scores[metric];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return direction === "asc" ? left - right : right - left;
  });
}

export function bestValue(values: (number | null | undefined)[], direction: "asc" | "desc") {
  const valid = values.filter((value): value is number => value != null);
  if (valid.length < 2) return null;
  const best = direction === "asc" ? Math.min(...valid) : Math.max(...valid);
  if (valid.every(value => value === best)) return null;
  return best;
}

export function isBestValue(value: number | null | undefined, best: number | null) {
  return value != null && best != null && value === best;
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

export function formatMetric(value: number | null | undefined, unit: string, decimals = unit === "percent" ? 1 : 2, signed = false, counts?: { count: number; total: number }, presentation: "compact" | "source" = "compact") {
  if (value === null || value === undefined) return "—";
  const sign = signed && value > 0 ? "+" : "";
  if (unit === "count" && counts) return `${counts.count} / ${counts.total}`;
  if (presentation === "compact" && unit === "ratio") return `${sign}${(value * 100).toFixed(Math.max(0, decimals - 2))}%`;
  if (presentation === "compact" && (unit === "ms" || unit === "seconds")) {
    const seconds = unit === "ms" ? value / 1000 : value;
    const precision = unit === "ms" ? Math.min(6, decimals + 3) : Math.max(3, decimals);
    return `${sign}${seconds.toFixed(precision)} s`;
  }
  const suffix = ({ percent: "%", mib: " MiB", points: " pp", ms: " ms", seconds: " s" } as Record<string, string>)[unit] ?? "";
  return `${sign}${unit === "usd" ? "$" : ""}${value.toFixed(decimals)}${suffix}`;
}

export function formatPricing(pricing: Pricing) {
  if (pricing.min == null || pricing.max == null) return pricing.softwareCost == null ? "—" : `Software $${pricing.softwareCost} + model`;
  const range = pricing.min === pricing.max ? `$${pricing.min}` : `$${pricing.min}–${pricing.max}`;
  return `${pricing.approximate ? "≈ " : ""}${range}`;
}
