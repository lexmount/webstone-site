import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareData, discoverResults, parseReportFile, validateSnapshot, validateCatalog } from "../scripts/prepare-data.mjs";

const catalog = JSON.parse(readFileSync(new URL("../benchmarks/catalog.json", import.meta.url), "utf8"));
const files = await discoverResults(fileURLToPath(new URL("../results/", import.meta.url)), catalog);
const snapshot = files.find(item => item.file === "lexbench-webfetch/lexbench-webfetch-v1-report.json").report;
const entry = { benchmarkId: "lexbench-webfetch", version: "v1" };

test("result records are versioned files without a hand-maintained index or format version", () => {
  assert.equal(existsSync(new URL("../results/index.json", import.meta.url)), false);
  assert.equal(Object.hasOwn(snapshot, "schemaVersion"), false);
  assert.equal(Object.hasOwn(snapshot, "snapshotDate"), false);
  assert.equal(Object.hasOwn(snapshot, "dateKind"), false);
  assert.equal(snapshot.version, "v1");
  for (const { file, report } of files) {
    const match = /^([a-z0-9-]+)-(v[1-9]\d*)-report\.json$/.exec(path.basename(file));
    assert.ok(match, file);
    assert.equal(report.version, match[2]);
    assert.equal(report.id, `${match[1]}-${match[2]}`);
    assert.equal(Object.hasOwn(report, "measuredAt"), false);
    assert.equal(Object.hasOwn(report.source, "versionId"), false);
  }
});

test("report directories are discovered and their declared provenance is validated", async () => {
  const summary = await prepareData({ write: false });
  assert.equal(summary.files, 8);
  assert.equal(summary.benchmarks, 8);
});

test("adding and removing a version file needs no index update", async t => {
  const folder = await mkdtemp(path.join(tmpdir(), "browser-eval-reports-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const benchmarkFolder = path.join(folder, "lexbench-webfetch");
  await mkdir(benchmarkFolder);
  const firstFile = path.join(benchmarkFolder, "lexbench-webfetch-v1-report.json");
  const nextFile = path.join(benchmarkFolder, "lexbench-webfetch-v2-report.json");
  const next = { ...snapshot, id: "lexbench-webfetch-v2", version: "v2" };
  await writeFile(firstFile, JSON.stringify(snapshot));
  assert.deepEqual((await discoverResults(folder, catalog)).map(item => item.report.version), ["v1"]);
  await writeFile(nextFile, JSON.stringify(next));
  assert.deepEqual((await discoverResults(folder, catalog)).map(item => item.report.version), ["v1", "v2"]);
  await rm(nextFile);
  assert.equal((await discoverResults(folder, catalog)).length, 1);
  const nested = path.join(benchmarkFolder, "nested");
  await mkdir(nested);
  await assert.rejects(discoverResults(folder, catalog), /nested directories/);
  await rm(nested, { recursive: true });
  await symlink(firstFile, nextFile);
  await assert.rejects(discoverResults(folder, catalog), /symbolic links/);
});

test("filenames must match their benchmark and contain a positive version", () => {
  assert.deepEqual(parseReportFile("lexbench-webfetch", "lexbench-webfetch-v12-report.json"), { benchmarkId: "lexbench-webfetch", version: "v12" });
  assert.deepEqual(parseReportFile("lexbench-webfetch", "lexbench-webfetch-v1-report.json"), { benchmarkId: "lexbench-webfetch", version: "v1" });
  assert.throws(() => parseReportFile("lexbench-webfetch", "lexbench-webfetch-v0-report.json"), /Expected/);
  assert.throws(() => parseReportFile("lexbench-webfetch", "lexbench-webfetch-v01-report.json"), /Expected/);
  assert.throws(() => parseReportFile("lexbench-webfetch", "lexbench-webfetch-20261112-report.json"), /Expected/);
  assert.throws(() => parseReportFile("webmainbench", "lexbench-webfetch-v2-report.json"), /Expected/);
  assert.throws(() => parseReportFile("webmainbench", "../webmainbench-v2-report.json"), /Expected/);
  assert.throws(() => parseReportFile("webmainbench", "v2-report.json"), /Expected/);
  assert.throws(() => validateSnapshot({ ...snapshot, schemaVersion: 2 }, entry, catalog), /format or source version/);
  assert.throws(() => validateSnapshot({ ...snapshot, measuredAt: "2026-11-10T00:00:00Z" }, entry, catalog), /format or source version/);
  assert.throws(() => validateSnapshot({ ...snapshot, source: { ...snapshot.source, versionId: "1" } }, entry, catalog), /format or source version/);
});

test("version and identity must match the filename and dataset difference must be English", () => {
  assert.throws(() => validateSnapshot({ ...snapshot, id: "lexbench-webfetch-v2", version: "v1" }, { ...entry, version: "v2" }, catalog), /version does not match/);
  assert.throws(() => validateSnapshot({ ...snapshot, id: "lexbench-webfetch-v2" }, entry, catalog), /identity does not match/);
  assert.throws(() => validateSnapshot({ ...snapshot, datasetDifference: "" }, entry, catalog), /dataset difference/);
  assert.throws(() => validateSnapshot({ ...snapshot, datasetDifference: "   " }, entry, catalog), /dataset difference/);
  assert.throws(() => validateSnapshot({ ...snapshot, datasetDifference: "仅包含中文说明" }, entry, catalog), /dataset difference/);
  assert.doesNotThrow(() => validateSnapshot(snapshot, entry, catalog));
});

test("result files contain measurements and references, not benchmark or page definitions", () => {
  for (const item of files) {
    const record = item.report;
    for (const benchmark of record.benchmarks) {
      for (const key of ["name", "datasetName", "description", "eyebrow", "datasetUrl", "providerLabel", "primaryMetric", "metrics", "categories", "providerCount"]) {
        assert.equal(Object.hasOwn(benchmark, key), false, `${item.file}: ${key} belongs in the benchmark catalog`);
      }
      assert.equal(typeof benchmark.definitionId, "string");
      for (const provider of benchmark.providers) assert.equal(Object.hasOwn(provider, "color"), false);
    }
    assert.equal(record.benchmarks.length, 1);
    assert.doesNotMatch(item.file, /\/\d{4}-\d{2}-\d{2}\//);
  }
});

test("published page labels, descriptions and dataset differences use English", () => {
  const labels = [...catalog.tracks.flatMap(track => [track.name, track.description]),
    ...catalog.benchmarks.flatMap(benchmark => [benchmark.name, benchmark.datasetName, benchmark.description, benchmark.providerLabel,
      ...benchmark.definitions.flatMap(definition => [
        ...definition.metrics.flatMap(metric => [metric.label, metric.description]),
        ...(definition.categories ?? []).flatMap(category => [category.name, category.criterion]),
      ]),
    ]),
  ].filter(Boolean).join("\n");
  assert.doesNotMatch(labels, /\p{Script=Han}/u);
  for (const item of files) {
    const record = item.report;
    assert.match(record.datasetDifference, /[A-Za-z]/);
    assert.doesNotMatch(record.datasetDifference, /\p{Script=Han}/u, `${item.file} has untranslated dataset difference`);
    for (const benchmark of record.benchmarks) {
      const text = benchmark.providers.flatMap(provider => [provider.name, provider.passedDerivation]).filter(Boolean).join("\n");
      assert.doesNotMatch(text, /\p{Script=Han}/u, `${benchmark.id} has untranslated page text`);
    }
  }
});

test("benchmarks require separate dataset and report HTTPS links with matching dataset names", () => {
  const missing = structuredClone(catalog);
  delete missing.benchmarks[0].datasetUrl;
  assert.throws(() => validateCatalog(missing), /benchmark resource URL/);
  const unsafe = structuredClone(catalog);
  unsafe.benchmarks[0].reportUrl = "javascript:alert(1)";
  assert.throws(() => validateCatalog(unsafe), /benchmark resource URL/);
  const duplicate = structuredClone(catalog);
  duplicate.benchmarks[0].datasetUrl = "https://example.com/dataset";
  duplicate.benchmarks[0].reportUrl = duplicate.benchmarks[0].datasetUrl;
  assert.throws(() => validateCatalog(duplicate), /separate URLs/);
  const mismatched = structuredClone(catalog);
  mismatched.benchmarks[0].datasetName = "Another-Name";
  assert.throws(() => validateCatalog(mismatched), /Dataset name/);
  const unsafeRun = structuredClone(snapshot);
  unsafeRun.benchmarks[0].reportUrl = "javascript:alert(1)";
  assert.throws(() => validateSnapshot(unsafeRun, entry, catalog), /evaluation report URL/);
});

test("unknown definitions and duplicate catalog IDs fail validation", () => {
  const unknown = structuredClone(snapshot);
  unknown.benchmarks[0].definitionId = "missing";
  assert.throws(() => validateSnapshot(unknown, entry, catalog), /definition/);
  const stale = structuredClone(snapshot);
  stale.benchmarks[0].definitionId = "combined-media";
  assert.throws(() => validateSnapshot(stale, entry, catalog), /Category totals/);
  const duplicate = structuredClone(catalog);
  duplicate.benchmarks[0].definitions.push(duplicate.benchmarks[0].definitions[0]);
  assert.throws(() => validateCatalog(duplicate), /Duplicate definition/);
  const unknownTrack = structuredClone(catalog);
  unknownTrack.benchmarks[0].trackId = "missing";
  assert.throws(() => validateCatalog(unknownTrack), /track/);
  const invalidPrecision = structuredClone(catalog);
  invalidPrecision.benchmarks[0].definitions[0].metrics[0].decimals = 101;
  assert.throws(() => validateCatalog(invalidPrecision), /precision/);
  const unknownMetric = structuredClone(snapshot);
  unknownMetric.benchmarks[0].providers[0].scores.invented = 50;
  assert.throws(() => validateSnapshot(unknownMetric, entry, catalog), /metric score reference/);
  const unknownSamples = structuredClone(snapshot);
  unknownSamples.benchmarks[0].metricSamples = { invented: { sampleCount: 10 } };
  assert.throws(() => validateSnapshot(unknownSamples, entry, catalog), /metric sample reference/);
});

const arena = files.find(item => item.file === "webarena-verified/webarena-verified-v1-report.json").report;
const arenaEntry = { benchmarkId: "webarena-verified", version: "v1" };

test("WebArena pass counts agree with the published success rates and need provenance", () => {
  const benchmark = arena.benchmarks[0];
  assert.equal(benchmark.taskCount, 812);
  for (const provider of benchmark.providers) {
    assert.equal(Number((provider.passed / benchmark.taskCount * 100).toFixed(1)), provider.scores.successRate);
  }
  assert.doesNotThrow(() => validateSnapshot(arena, arenaEntry, catalog));
  const unprovenanced = structuredClone(arena);
  unprovenanced.source.scope = "";
  assert.throws(() => validateSnapshot(unprovenanced, arenaEntry, catalog), /provenance/);
});

test("invalid scores, mismatched versions and misplaced page fields are rejected", () => {
  const invalidScore = structuredClone(snapshot);
  invalidScore.benchmarks[0].providers[0].scores.passRate = 101;
  assert.throws(() => validateSnapshot(invalidScore, entry, catalog), /metric/);
  assert.throws(() => validateSnapshot({ ...snapshot, id: "lexbench-webfetch-v2" }, { ...entry, version: "v2" }, catalog), /version does not match/);
  const pageInfo = structuredClone(snapshot);
  pageInfo.benchmarks[0].description = "Misplaced introduction";
  assert.throws(() => validateSnapshot(pageInfo, entry, catalog), /result field/);
  const color = structuredClone(snapshot);
  color.benchmarks[0].providers[0].color = "#16876b";
  assert.throws(() => validateSnapshot(color, entry, catalog), /presentation field/);
});

test("category pass counts stay within their totals and the totals match the task count", () => {
  const overflow = structuredClone(snapshot);
  overflow.benchmarks[0].providers[0].categoryPassed.static = 101;
  assert.throws(() => validateSnapshot(overflow, entry, catalog), /category pass count/);
  const unknown = structuredClone(snapshot);
  unknown.benchmarks[0].providers[0].categoryPassed.video = 1;
  assert.throws(() => validateSnapshot(unknown, entry, catalog), /category pass count/);
  const drift = structuredClone(snapshot);
  drift.benchmarks[0].categoryTotals.static = 90;
  assert.throws(() => validateSnapshot(drift, entry, catalog), /Category totals/);
});

test("image provenance, monetary values, latency and ratio limits are validated", () => {
  const search = files.find(item => item.file === "lexbench-websearch/lexbench-websearch-v1-report.json").report;
  const qa = files.find(item => item.file === "simpleqa-verified/simpleqa-verified-v1-report.json").report;
  const searchEntry = { benchmarkId: "lexbench-websearch", version: "v1" };
  const qaEntry = { benchmarkId: "simpleqa-verified", version: "v1" };
  const longRequest = structuredClone(search);
  longRequest.benchmarks[0].providers[0].scores.responseTime = 146.41;
  assert.doesNotThrow(() => validateSnapshot(longRequest, searchEntry, catalog));
  const badImage = structuredClone(search);
  badImage.source.sha256 = "unknown";
  assert.throws(() => validateSnapshot(badImage, searchEntry, catalog), /image source/);
  const badRatio = structuredClone(qa);
  badRatio.benchmarks[0].providers[0].scores.mrr5 = 1.01;
  assert.throws(() => validateSnapshot(badRatio, qaEntry, catalog), /metric/);
  const negativePrice = structuredClone(search);
  negativePrice.benchmarks[0].providers[0].scores.pricePerThousand = -1;
  assert.throws(() => validateSnapshot(negativePrice, searchEntry, catalog), /metric/);
  assert.equal(search.benchmarks[0].metricSamples.responseTime.sampleCount, 980);
  assert.equal(qa.benchmarks[0].metricSamples.responseTime.sampleCount, 980);
});

test("SWDE preserves all supplied quality, timing, count and pricing measurements", () => {
  const report = files.find(item => item.report.id === "lexbench-swde-v1")?.report;
  assert.ok(report, "SWDE v1 must be discoverable");
  const benchmark = report.benchmarks[0];
  assert.equal(benchmark.taskCount, 800);
  assert.equal(benchmark.providers.length, 10);
  assert.equal(benchmark.metricSamples.pageExact.sampleCount, 740);
  assert.equal(benchmark.metricSamples.nullAccuracy.sampleCount, 25);
  // Values are transcribed from the two user-supplied tables in their original order.
  const expected = [
    [800, .807, .705, 68.18, 226, 30.54, 0, 0, 3.184, 2.899, 4.870, 1.502, 5.069],
    [800, .783, .697, 68.76, 208, 28.11, 19, 76, 2.666, 2.416, 4.259, 2.995, 19],
    [798, .824, .745, 73.54, 257, 34.73, 17, 68, 5.014, 4.049, 9.590, 2.833, 10],
    [791, .840, .758, 73.57, 279, 37.70, 14, 56, 5.120, 4.747, 8.087, 3.75, 4],
    [750, .756, .677, 65.96, 206, 27.84, 17, 68, 9.043, 5.198, 62.136, .865, 5.73],
    [789, .817, .733, 72.48, 242, 32.70, 20, 80, 2.064, 1.894, 2.689, 4, 4],
    [799, .805, .741, 73.47, 251, 33.92, 20, 80, 23.645, 19.827, 47.326, null, null],
    [800, .810, .737, 73.89, 243, 32.84, 21, 84, 13.728, 9.268, 34.662, null, null],
    [799, .845, .771, 75.29, 271, 36.62, 13, 52, 10.719, 8.786, 20.974, null, null],
    [800, .827, .752, 74.84, 263, 35.54, 18, 72, 5.629, 3.830, 14.745, null, null],
  ];
  benchmark.providers.forEach((provider, i) => {
    assert.deepEqual([provider.scores.pagesWithFields, provider.scores.pageMacroF1, provider.scores.valueMicroF1,
      provider.scores.fieldSetExact, provider.counts.pageExact.count, provider.scores.pageExact,
      provider.counts.nullAccuracy.count, provider.scores.nullAccuracy,
      provider.scores.meanTime, provider.scores.p50Time, provider.scores.p95Time,
      provider.pricing.min, provider.pricing.max], expected[i]);
    assert.deepEqual(provider.counts.executedPages, { count: 800, total: 800 });
    assert.equal(provider.counts.pageExact.total, 740);
    assert.equal(provider.counts.nullAccuracy.total, 25);
    assert.equal(provider.scores.timedPages, 800);
    assert.equal(provider.scores.untimedPages, 0);
    assert.equal(provider.passed, null, "740 eligible pages must not use the 800-task pass denominator");
  });
  assert.deepEqual(benchmark.providers.map(p => p.pricing.approximate), [true, false, false, false, true, false, false, false, false, false]);
  assert.match(report.datasetDifference, /60 pages/);
});

test("count breakdowns and price ranges reject inconsistent or fabricated values", () => {
  const invalid = structuredClone(snapshot);
  invalid.benchmarks[0].providers[0].counts = { passRate: { count: 431, total: 430 } };
  assert.throws(() => validateSnapshot(invalid, entry, catalog), /count breakdown/);
  invalid.benchmarks[0].providers[0].counts = { passRate: { count: 1, total: 430 } };
  assert.throws(() => validateSnapshot(invalid, entry, catalog), /count breakdown/);
  delete invalid.benchmarks[0].providers[0].counts;
  for (const [min, max] of [[5, 1], [-1, 1], [0, null], [0, Infinity]]) {
    invalid.benchmarks[0].providers[0].pricing = { min, max, description: "Published price range." };
    assert.throws(() => validateSnapshot(invalid, entry, catalog), /pricing/);
  }
});

test("version-specific sample notes must be nonempty English", () => {
  const record = structuredClone(snapshot);
  record.benchmarks[0].metricSamples = { passRate: { sampleCount: 430, note: "430 evaluated cases." } };
  assert.doesNotThrow(() => validateSnapshot(record, entry, catalog));
  for (const note of ["", "   ", "有值 134 / 空 6", 140]) {
    record.benchmarks[0].metricSamples.passRate.note = note;
    assert.throws(() => validateSnapshot(record, entry, catalog), /sample note/);
  }
});
