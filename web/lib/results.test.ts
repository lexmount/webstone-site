import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sortProviders, selectEntry, formatMetric, sumCategoryPasses, type Provider, type Snapshot } from "./results.ts";

const snapshot: Snapshot = JSON.parse(readFileSync(new URL("../../results/webfetch-summary/2026-11-10/report.json", import.meta.url), "utf8"));
const providers = snapshot.benchmarks[0].providers;
const search: Snapshot = JSON.parse(readFileSync(new URL("../../results/websearch-summary/2026-11-10/report.json", import.meta.url), "utf8"));

test("unpublished scores stay last in either sort direction", () => {
  const sample: Provider[] = [
    { ...providers[0], id: "high", scores: { requestRate: 90 } },
    { ...providers[0], id: "unpublished", scores: { requestRate: null } },
    { ...providers[0], id: "low", scores: { requestRate: 40 } },
  ];
  assert.deepEqual(sortProviders(sample, "requestRate", "desc").map(p => p.id), ["high", "low", "unpublished"]);
  assert.deepEqual(sortProviders(sample, "requestRate", "asc").map(p => p.id), ["low", "high", "unpublished"]);
});

test("an empty date never falls back to another day's result", () => {
  const entries = [{ id: "one", date: "2026-11-10", file: "one.json", benchmarks: [{ id: "lexbench-webfetch", name: "Fetch" }] }];
  assert.equal(selectEntry(entries, "2026-11-09", "lexbench-webfetch"), null);
  assert.equal(selectEntry(entries, "2026-11-10", "webmainbench"), null);
  assert.equal(selectEntry(entries, "2026-11-10", "lexbench-webfetch")?.id, "one");
});

test("seed totals and percentages match the report, without invented cells", () => {
  const moli = providers.find(p => p.id === "moli");
  assert.ok(moli && moli.passed !== null);
  assert.equal(Number((moli.passed / 430 * 100).toFixed(1)), moli.scores.passRate);
  assert.equal(snapshot.measuredAt, null);
  assert.equal(snapshot.dateKind, "imported");
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
  assert.deepEqual(benchmark.providers.map(provider => sumCategoryPasses(provider, categories)), [386, 234, 228, 223, 192]);
});

test("request success precedes task success in the table", () => {
  assert.deepEqual(snapshot.benchmarks[0].metrics.map(metric => metric.id), ["requestRate", "passRate"]);
});

test("all five chart dimensions match the supplied image at its displayed precision", () => {
  const benchmark = snapshot.benchmarks.find(item => item.id === "webmainbench")!;
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
  const expected: Record<string, [number, number]> = {
    moli: [89.8, 39.27],
    chromium: [54.4, 27.02],
    lightpanda: [53.0, 35.00],
    obscura: [51.9, 31.03],
    kitesurf: [44.7, 33.43],
  };
  const extraction = snapshot.benchmarks.find(item => item.id === "webmainbench")!;
  for (const provider of providers) {
    assert.equal(provider.scores.passRate, expected[provider.id][0]);
    assert.equal(extraction.providers.find(item => item.id === provider.id)?.scores.overall, expected[provider.id][1]);
  }
  assert.deepEqual(sortProviders(providers, "passRate", "desc").map(item => item.id), ["moli", "chromium", "lightpanda", "obscura", "kitesurf"]);
  assert.deepEqual(sortProviders(extraction.providers, "overall", "desc").map(item => item.id), ["moli", "lightpanda", "kitesurf", "obscura", "chromium"]);
  assert.equal(providers.find(item => item.id === "lightpanda")?.passed, 228);
});

test("search datasets keep their own quality metrics and exact image values", () => {
  const [scene, qa] = search.benchmarks;
  assert.equal(scene.taskCount, 149);
  assert.equal(qa.taskCount, 773);
  assert.deepEqual(scene.metrics.map(metric => metric.id), ["responseTime", "pricePerThousand", "ndcg5", "precision5", "success5"]);
  assert.deepEqual(qa.metrics.map(metric => metric.id), ["responseTime", "pricePerThousand", "hit5", "mrr5", "answerMatch5"]);
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
  assert.equal(search.source.versionId, null);
});
