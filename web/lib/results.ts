export type Metric = { id: string; label: string; unit: string; direction: "asc" | "desc"; decimals?: number; description?: string; signed?: boolean };
export type CategoryDefinition = { id: string; name: string; criterion: string };
export type Category = CategoryDefinition & { total: number };
export type Provider = {
  id: string; name: string; description: string; mode: string;
  scores: Record<string, number | null>; passed: number | null;
  passedDerivation?: string | null; categoryPassed?: Record<string, number>;
  samples?: Record<string, number>;
};
export type Definition = {
  id: string; primaryMetric: string; metrics: Metric[];
  categories?: CategoryDefinition[]; leadingMetricIds?: string[];
};
export type BenchmarkInfo = {
  id: string; trackId: string; name: string; description: string;
  datasetUrl: string; reportUrl: string; providerLabel: string;
  definitions: Definition[];
};
export type Catalog = {
  schemaVersion: number;
  tracks: { id: string; name: string; description: string }[];
  benchmarks: BenchmarkInfo[];
};
export type BenchmarkResult = {
  id: string; definitionId: string; taskCount: number; providers: Provider[];
  categoryTotals?: Record<string, number>;
  metricSamples?: Record<string, { sampleCount?: number; scope?: string }>;
  notes: string[]; reportUrl: string | null;
  otherBest?: Record<string, number>;
};
export type Benchmark = Omit<BenchmarkInfo, "definitions"> & Omit<Definition, "id" | "categories"> & Omit<BenchmarkResult, "reportUrl"> & {
  categories: Category[]; providerCount: number;
};
export type Entry = {
  id: string; date: string; dateKind?: string; file: string;
  benchmarks: string[];
};
export type Snapshot = {
  id: string; snapshotDate: string;
  dateKind: string;
  source: { url: string; title: string; kind?: string; sha256?: string; linkLabel?: string; importedAt: string; method: string; scope: string; dateNote: string };
  benchmarks: BenchmarkResult[];
  evidence: { id: string; section: string; text: string }[];
};
export type ReportFile = { file: string; report: Snapshot };

export function reportEntries(files: ReportFile[]): Entry[] {
  return files.map(({ file, report }) => ({
    file, id: report.id, date: report.snapshotDate, dateKind: report.dateKind,
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
        sample?.scope === "all-search-calls" ? "Shared across both query sets." : ""].filter(Boolean).join(" ");
      return context ? { ...metric, description: `${metric.description ?? ""} ${context}`.trim() } : metric;
    }),
    categories: (definition.categories ?? []).map(category => ({ ...category, total: result.categoryTotals![category.id] })),
    providerCount: result.providers.length,
  };
}

export function sortProviders(providers: Provider[], metric: string, direction: "asc" | "desc") {
  return [...providers].sort((a, b) => {
    const left = a.scores[metric], right = b.scores[metric];
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return direction === "asc" ? left - right : right - left;
  });
}

export function selectEntry(entries: Entry[], date: string, benchmark: string) {
  return entries.find(entry => entry.date === date && entry.benchmarks.includes(benchmark)) ?? null;
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

export function formatMetric(value: number | null | undefined, unit: string, decimals = unit === "percent" ? 1 : 2, signed = false) {
  if (value == null) return "—";
  const sign = signed && value > 0 ? "+" : "";
  const suffix = unit === "percent" ? "%" : unit === "seconds" ? " s" : unit === "ms" ? " ms" : unit === "mib" ? " MiB" : unit === "points" ? " pp" : "";
  return `${sign}${unit === "usd" ? "$" : ""}${value.toFixed(decimals)}${suffix}`;
}
