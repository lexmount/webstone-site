import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { benchmarkEntries, bestValue, compareVersions, isBestValue, latestEntry, selectEntry, reportEntries, formatMetric, sumCategoryPasses, resolveBenchmark, sortProviders, type Catalog, type Provider, type Snapshot } from "./results.ts";

const catalog: Catalog = JSON.parse(readFileSync(new URL("../../benchmarks/catalog.json", import.meta.url), "utf8"));
function readSnapshot(file: string) {
  const record: Snapshot = JSON.parse(readFileSync(new URL(`../../results/${file}`, import.meta.url), "utf8"));
  return { ...record, benchmarks: record.benchmarks.map(result => resolveBenchmark(catalog, result)) };
}
const fetchSnapshot = readSnapshot("lexbench-webfetch/lexbench-webfetch-v1-report.json");
const snapshot = { ...fetchSnapshot, benchmarks: [...fetchSnapshot.benchmarks, ...readSnapshot("webmainbench/webmainbench-v1-report.json").benchmarks] };
const providers = snapshot.benchmarks[0].providers;
const searchSnapshot = readSnapshot("lexbench-websearch/lexbench-websearch-v1-report.json");
const search = { ...searchSnapshot, benchmarks: [...searchSnapshot.benchmarks, ...readSnapshot("simpleqa-verified/simpleqa-verified-v1-report.json").benchmarks] };

test("each result resolves its exact definition without changing raw measurements", () => {
  const only = snapshot.benchmarks[0];
  assert.equal(only.definitionId, "split-media");
  assert.deepEqual(only.categories!.map(category => category.id), ["static", "dynamic", "popular", "antibot", "document", "embeddedMedia", "directMedia"]);
  assert.deepEqual(only.categories!.slice(-2).map(category => [category.id, category.total]), [["embeddedMedia", 17], ["directMedia", 3]]);
  const raw: Snapshot = JSON.parse(readFileSync(new URL("../../results/lexbench-webfetch/lexbench-webfetch-v1-report.json", import.meta.url), "utf8"));
  const unchanged = structuredClone(raw);
  const renamed = structuredClone(catalog);
  renamed.benchmarks[0].description = "Updated benchmark introduction";
  assert.equal(resolveBenchmark(renamed, raw.benchmarks[0]).description, "Updated benchmark introduction");
  const runReport = "https://example.com/reports/this-run";
  assert.equal(resolveBenchmark(catalog, { ...raw.benchmarks[0], reportUrl: runReport }).reportUrl, runReport);
  assert.equal(resolveBenchmark(catalog, raw.benchmarks[0]).reportUrl, catalog.benchmarks[0].reportUrl);
  assert.deepEqual(raw, unchanged);
  assert.throws(() => resolveBenchmark(catalog, { ...raw.benchmarks[0], definitionId: "missing" }), /definition/);
  assert.equal(search.benchmarks[0].metricSamples?.responseTime.sampleCount, 980);
  assert.equal(search.benchmarks[1].metricSamples?.responseTime.scope, "all-search-calls");
});

test("the v1 WebFetch table preserves every supplied result", () => {
  const record = readSnapshot("lexbench-webfetch/lexbench-webfetch-v1-report.json");
  const benchmark = record.benchmarks[0];
  assert.equal(record.version, "v1");
  assert.equal(record.source.kind, "user-provided-text");
  assert.match(record.datasetDifference, /430-task/);
  assert.equal(benchmark.providerCount, 6);
  assert.deepEqual(benchmark.metrics.map(item => item.id), ["passRate", "requestRate", "totalMean", "totalP50", "totalP95"]);
  assert.deepEqual(benchmark.categories!.map(item => item.total), [100, 100, 100, 100, 10, 17, 3]);
  const expected: Record<string, number[]> = {
    "moli-1-1-17": [96.3, 89.5, 97, 89, 90, 89, 1, 16, 3, 14174, 9868, 40656],
    "moli-1-1-15": [97.4, 85.3, 96, 84, 84, 85, 1, 14, 3, 12666, 9159, 40608],
    chromium: [96.7, 54.2, 99, 57, 58, 5, 1, 12, 1, 8211, 4367, 25054],
    lightpanda: [87.4, 52.8, 92, 44, 37, 37, 1, 13, 3, 6477, 6722, 8131],
    obscura: [89.3, 51.6, 94, 42, 53, 16, 1, 13, 3, 13873, 9599, 36418],
    kitesurf: [84.2, 45.1, 90, 44, 40, 10, 1, 9, 0, 13408, 6004, 77304],
  };
  for (const provider of benchmark.providers) {
    assert.deepEqual([provider.scores.requestRate, provider.scores.passRate,
      ...benchmark.categories!.map(category => provider.categoryPassed![category.id]),
      provider.scores.totalMean, provider.scores.totalP50, provider.scores.totalP95,
    ], expected[provider.id]);
    assert.equal(provider.passed, sumCategoryPasses(provider, benchmark.categories!));
    assert.equal(Number((provider.passed! / 430 * 100).toFixed(1)), provider.scores.passRate);
    assert.ok(provider.passedDerivation);
  }
  assert.deepEqual(benchmark.providers.map(item => item.passed), [385, 367, 233, 227, 222, 194]);
  assert.equal(benchmark.providers.find(item => item.id === "kitesurf")?.name, "Kitesurf Beta");
  assert.equal(benchmark.providers.find(item => item.id === "kitesurf")?.description, "Kitesurf Beta");
  assert.equal(formatMetric(14174, "ms", 0), "14174 ms");
  assert.equal(sortProviders(benchmark.providers, "totalP95", "asc")[0].id, "lightpanda");
});

test("the published Web Fetch version is discovered without an index", () => {
  const files = ["lexbench-webfetch/lexbench-webfetch-v1-report.json", "webmainbench/webmainbench-v1-report.json"];
  const entries = reportEntries(files.map(file => ({ file, report: JSON.parse(readFileSync(new URL(`../../results/${file}`, import.meta.url), "utf8")) })));
  assert.equal(selectEntry(entries, "v1", "lexbench-webfetch")?.id, "lexbench-webfetch-v1");
  assert.equal(selectEntry(entries, "v2", "lexbench-webfetch"), null);
  assert.equal(selectEntry(entries, "v1", "webmainbench")?.id, "webmainbench-v1");
  assert.deepEqual(benchmarkEntries(entries, "lexbench-webfetch").map(entry => entry.version), ["v1"]);
  assert.equal(latestEntry(entries, "lexbench-webfetch")?.version, "v1");
});

test("versions compare numerically and are independent per benchmark", () => {
  const entries = [
    { id: "a-v10", version: "v10", file: "a-v10.json", benchmarks: ["a"] },
    { id: "a-v2", version: "v2", file: "a-v2.json", benchmarks: ["a"] },
    { id: "a-v1", version: "v1", file: "a-v1.json", benchmarks: ["a"] },
    { id: "b-v1", version: "v1", file: "b-v1.json", benchmarks: ["b"] },
  ];
  assert.deepEqual(benchmarkEntries(entries, "a").map(entry => entry.version), ["v1", "v2", "v10"]);
  assert.equal(latestEntry(entries, "a")?.version, "v10");
  assert.equal(latestEntry(entries, "b")?.version, "v1");
  assert.equal(selectEntry(entries, "v9", "a"), null);
  assert.ok(compareVersions("v10", "v2") > 0);
  assert.throws(() => compareVersions("1", "v2"), /version/);
});

test("unpublished scores stay last in either sort direction", () => {
  const sample: Provider[] = [
    { ...providers[0], id: "high", scores: { requestRate: 90 } },
    { ...providers[0], id: "unpublished", scores: { requestRate: null } },
    { ...providers[0], id: "low", scores: { requestRate: 40 } },
  ];
  assert.deepEqual(sortProviders(sample, "requestRate", "desc").map(p => p.id), ["high", "low", "unpublished"]);
  assert.deepEqual(sortProviders(sample, "requestRate", "asc").map(p => p.id), ["low", "high", "unpublished"]);
});

test("a missing version never falls back to another version", () => {
  const entries = [{ id: "one", version: "v1", file: "one.json", benchmarks: ["lexbench-webfetch"] }];
  assert.equal(selectEntry(entries, "v2", "lexbench-webfetch"), null);
  assert.equal(selectEntry(entries, "v1", "webmainbench"), null);
  assert.equal(selectEntry(entries, "v1", "lexbench-webfetch")?.id, "one");
});

test("seed totals and percentages match the report, without invented cells", () => {
  const moli = providers.find(p => p.id === "moli-1-1-17");
  assert.ok(moli && moli.passed !== null);
  assert.equal(Number((moli.passed / 430 * 100).toFixed(1)), moli.scores.passRate);
  assert.equal(snapshot.version, "v1");
  assert.equal(formatMetric(null, "percent"), "—");
  assert.equal(formatMetric(39.27, "score"), "39.27");
});

test("search measurements retain seconds, dollar pricing and MRR precision", () => {
  assert.equal(formatMetric(1.46, "seconds"), "1.46 s");
  assert.equal(formatMetric(0.75, "usd"), "$0.75");
  assert.equal(formatMetric(0.720, "ratio", 3), "0.720");
});

test("category pass counts are published per provider against a 430-case split", () => {
  const benchmark = snapshot.benchmarks[0];
  const categories = benchmark.categories!;
  assert.equal(categories.reduce((total, category) => total + category.total, 0), benchmark.taskCount);
  assert.equal(categories.find(category => category.id === "document")?.total, 10);
  assert.deepEqual(benchmark.providers.map(provider => sumCategoryPasses(provider, categories)), [385, 367, 233, 227, 222, 194]);
});

test("signed deltas and memory or millisecond units format with direction", () => {
  assert.equal(formatMetric(4.3, "percent", 2, true), "+4.30%");
  assert.equal(formatMetric(-0.15, "percent", 2, true), "-0.15%");
  assert.equal(formatMetric(0, "points", 2, true), "0.00 pp");
  assert.equal(formatMetric(80.54, "mib", 2), "80.54 MiB");
  assert.equal(formatMetric(21.41, "ms", 2), "21.41 ms");
  assert.equal(formatMetric(1, "percent"), "1.0%");
});

test("task success precedes request success in the Web Fetch table", () => {
  assert.deepEqual(snapshot.benchmarks[0].metrics.map(metric => metric.id), ["passRate", "requestRate", "totalMean", "totalP50", "totalP95"]);
});

test("each benchmark lists its default ranking metric first", () => {
  for (const benchmark of catalog.benchmarks) {
    for (const definition of benchmark.definitions) {
      assert.equal(definition.metrics[0].id, definition.primaryMetric, `${benchmark.id}/${definition.id}`);
    }
  }
});

test("best values follow each column direction and ignore missing cells", () => {
  assert.equal(bestValue([80, 90, 90, null], "desc"), 90);
  assert.equal(isBestValue(90, 90), true);
  assert.equal(isBestValue(80, 90), false);
  assert.equal(isBestValue(null, 90), false);
  assert.equal(bestValue([10, 4, 7], "asc"), 4);
  assert.equal(bestValue([5, 5], "desc"), null);
  assert.equal(bestValue([5], "desc"), null);
  assert.equal(bestValue([null, null], "desc"), null);
  assert.equal(bestValue([0, 1], "asc"), 0);
  assert.equal(bestValue([-2, -5, 1], "asc"), -5);
  assert.equal(bestValue([-2, -5, 1], "desc"), 1);
});

test("benchmark titles, dataset names and links follow the public dataset catalog", () => {
  const expected: Record<string, { name: string; datasetName: string }> = {
    "lexbench-webfetch": { name: "LexBench Web Fetch", datasetName: "LexBench-Web-Fetch" },
    webmainbench: { name: "LexBench WebMainBench", datasetName: "LexBench-WebMainBench" },
    "lexbench-websearch": { name: "LexBench Web Search", datasetName: "LexBench-Web-Search" },
    "simpleqa-verified": { name: "LexBench SimpleQA Verified", datasetName: "LexBench-SimpleQA-Verified" },
    "lexbench-headless-372": { name: "LexBench Headless Browser", datasetName: "LexBench-Headless-Browser" },
    "webarena-verified": { name: "LexBench WebArena Replay", datasetName: "LexBench-WebArena-Replay" },
  };
  assert.deepEqual(catalog.tracks.map(track => track.name), ["Web Fetch", "Web Search", "Trajectory Replay"]);
  for (const benchmark of catalog.benchmarks) {
    assert.equal(benchmark.name, expected[benchmark.id].name);
    assert.equal(benchmark.datasetName, expected[benchmark.id].datasetName);
    assert.equal(benchmark.datasetUrl, `https://huggingface.co/datasets/Lexmount/${benchmark.datasetName}`);
  }
});

test("all five chart dimensions match the supplied image at its displayed precision", () => {
  const benchmark = snapshot.benchmarks.find(item => item.id === "webmainbench")!;
  assert.deepEqual(benchmark.metricSamples, {
    fullText: { sampleCount: 545 }, code: { sampleCount: 110 }, formula: { sampleCount: 257 },
    tableContent: { sampleCount: 179 }, tableStructure: { sampleCount: 179 },
  });
  const dimensions = ["fullText", "code", "formula", "tableContent", "tableStructure"];
  assert.deepEqual(benchmark.metrics.map(metric => metric.id), ["overall", ...dimensions]);
  const expected: Record<string, number[]> = {
    moli: [40.7, 91.1, 28.2, 22.6, 13.8],
    lightpanda: [41.5, 84.7, 13.0, 21.8, 14.0],
    kitesurf: [37.0, 80.7, 19.3, 18.3, 11.9],
    obscura: [41.9, 81.8, 31.4, 0.0, 0.0],
    chromium: [39.4, 35.9, 21.1, 25.0, 13.7],
  };
  for (const provider of benchmark.providers) {
    for (const [index, id] of dimensions.entries()) {
      assert.equal(formatMetric(provider.scores[id], "score", 1), expected[provider.id][index].toFixed(1));
    }
  }
});

test("task rates, overall scores and both rankings match the supplied comparison image", () => {
  const fetchRates: Record<string, number> = {
    "moli-1-1-17": 89.5,
    "moli-1-1-15": 85.3,
    chromium: 54.2,
    lightpanda: 52.8,
    obscura: 51.6,
    kitesurf: 45.1,
  };
  const overall: Record<string, number> = {
    moli: 39.27,
    chromium: 27.02,
    lightpanda: 35.00,
    obscura: 31.03,
    kitesurf: 33.43,
  };
  const extraction = snapshot.benchmarks.find(item => item.id === "webmainbench")!;
  for (const provider of providers) assert.equal(provider.scores.passRate, fetchRates[provider.id]);
  for (const provider of extraction.providers) assert.equal(provider.scores.overall, overall[provider.id]);
  assert.deepEqual(sortProviders(providers, "passRate", "desc").map(item => item.id), ["moli-1-1-17", "moli-1-1-15", "chromium", "lightpanda", "obscura", "kitesurf"]);
  assert.deepEqual(sortProviders(extraction.providers, "overall", "desc").map(item => item.id), ["moli", "lightpanda", "kitesurf", "obscura", "chromium"]);
  assert.equal(providers.find(item => item.id === "lightpanda")?.passed, 227);
});

test("search datasets keep their own quality metrics and exact image values", () => {
  const [scene, qa] = search.benchmarks;
  assert.equal(scene.taskCount, 149);
  assert.equal(qa.taskCount, 773);
  assert.deepEqual(scene.metrics.map(metric => metric.id), ["ndcg5", "responseTime", "pricePerThousand", "precision5", "success5"]);
  assert.deepEqual(qa.metrics.map(metric => metric.id), ["hit5", "responseTime", "pricePerThousand", "mrr5", "answerMatch5"]);
  const expected: Record<string, number[]> = {
    lexmount: [1.46, 0.75, 64.0, 62.7, 77.2, 78.0, 0.645, 72.1],
    serper: [2.26, 1.00, 64.4, 71.9, 74.5, 80.2, 0.720, 69.0],
    browserbase: [3.97, 5.00, 58.8, 62.4, 71.1, 76.3, 0.513, 20.8],
    brightdata: [46.41, 1.50, 23.2, 25.8, 25.5, 30.1, 0.267, 27.7],
  };
  for (const provider of scene.providers) {
    const pair = qa.providers.find(item => item.id === provider.id)!;
    assert.deepEqual([
      provider.scores.responseTime, provider.scores.pricePerThousand, provider.scores.ndcg5,
      provider.scores.precision5, provider.scores.success5, pair.scores.hit5,
      pair.scores.mrr5, pair.scores.answerMatch5,
    ], expected[provider.id]);
    assert.equal(pair.scores.responseTime, provider.scores.responseTime);
    assert.equal(pair.scores.pricePerThousand, provider.scores.pricePerThousand);
  }
  assert.deepEqual(sortProviders(scene.providers, "responseTime", "asc").map(item => item.id), ["lexmount", "serper", "browserbase", "brightdata"]);
  assert.equal(sortProviders(scene.providers, "ndcg5", "desc")[0].id, "serper");
  assert.equal(sortProviders(qa.providers, "hit5", "desc")[0].id, "serper");
});
