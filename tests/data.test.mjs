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
const snapshot = files.find(item => item.file === "lexbench-webfetch/lexbench-webfetch-20261110-report.json").report;
const entry = { date: "2026-11-10", benchmarkId: "lexbench-webfetch" };

test("daily records are named files without a hand-maintained index or schema version", () => {
  assert.equal(existsSync(new URL("../results/index.json", import.meta.url)), false);
  assert.equal(Object.hasOwn(snapshot, "schemaVersion"), false);
  for (const { report } of files) {
    assert.equal(Object.hasOwn(report, "measuredAt"), false);
    assert.equal(Object.hasOwn(report.source, "versionId"), false);
  }
});

test("report directories are discovered and their declared provenance is validated", async () => {
  const summary = await prepareData({ write: false });
  assert.equal(summary.files, 7);
  assert.equal(summary.benchmarks, 7);
});

test("adding and removing a daily file needs no index update", async t => {
  const folder = await mkdtemp(path.join(tmpdir(), "browser-eval-reports-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const benchmarkFolder = path.join(folder, "lexbench-webfetch");
  await mkdir(benchmarkFolder);
  const oldFile = path.join(benchmarkFolder, "lexbench-webfetch-20261110-report.json");
  const nextFile = path.join(benchmarkFolder, "lexbench-webfetch-20261112-report.json");
  const next = { ...snapshot, id: "next-day", snapshotDate: "2026-11-12" };
  await writeFile(oldFile, JSON.stringify(snapshot));
  assert.equal((await discoverResults(folder, catalog)).length, 1);
  await writeFile(nextFile, JSON.stringify(next));
  assert.deepEqual((await discoverResults(folder, catalog)).map(item => item.report.snapshotDate), ["2026-11-10", "2026-11-12"]);
  await rm(nextFile);
  assert.equal((await discoverResults(folder, catalog)).length, 1);
  await symlink(oldFile, nextFile);
  await assert.rejects(discoverResults(folder, catalog), /symbolic links/);
});

test("filenames must match their benchmark and contain a real calendar date", () => {
  assert.deepEqual(parseReportFile("lexbench-webfetch", "lexbench-webfetch-20261112-report.json"), { benchmarkId: "lexbench-webfetch", date: "2026-11-12" });
  assert.throws(() => parseReportFile("lexbench-webfetch", "lexbench-webfetch-20260230-report.json"), /date/);
  assert.throws(() => parseReportFile("webmainbench", "lexbench-webfetch-20261112-report.json"), /Expected/);
  assert.throws(() => parseReportFile("webmainbench", "../webmainbench-20261112-report.json"), /Expected/);
  assert.throws(() => parseReportFile("webmainbench", "2026-11-12-report.json"), /Expected/);
  assert.throws(() => validateSnapshot({ ...snapshot, schemaVersion: 2 }, entry, catalog), /format version/);
});


test("daily results contain measurements and references, not benchmark or page definitions", () => {
  for (const item of files) {
    const record = item.report;
    for (const benchmark of record.benchmarks) {
      for (const key of ["name", "description", "eyebrow", "datasetUrl", "providerLabel", "primaryMetric", "metrics", "categories", "providerCount"]) {
        assert.equal(Object.hasOwn(benchmark, key), false, `${item.file}: ${key} belongs in the benchmark catalog`);
      }
      assert.equal(typeof benchmark.definitionId, "string");
      for (const provider of benchmark.providers) assert.equal(Object.hasOwn(provider, "color"), false);
    }
    assert.equal(record.benchmarks.length, 1);
    assert.doesNotMatch(item.file, /\/\d{4}-\d{2}-\d{2}\//);
  }
});

test("published page labels, descriptions and tooltips use English", () => {
  const labels = [...catalog.tracks.flatMap(track => [track.name, track.description]),
    ...catalog.benchmarks.flatMap(benchmark => [benchmark.name, benchmark.description, benchmark.providerLabel,
      ...benchmark.definitions.flatMap(definition => [
        ...definition.metrics.flatMap(metric => [metric.label, metric.description]),
        ...(definition.categories ?? []).flatMap(category => [category.name, category.criterion]),
      ]),
    ]),
  ].filter(Boolean).join("\n");
  assert.doesNotMatch(labels, /\p{Script=Han}/u);
  for (const item of files) {
    const record = item.report;
    for (const benchmark of record.benchmarks) {
      const text = benchmark.providers.flatMap(provider => [provider.name, provider.passedDerivation]).filter(Boolean).join("\n");
      assert.doesNotMatch(text, /\p{Script=Han}/u, `${benchmark.id} has untranslated page text`);
    }
  }
});

test("benchmarks require separate dataset and report HTTPS links", () => {
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
  const unsafeRun = structuredClone(snapshot);
  unsafeRun.benchmarks[0].reportUrl = "javascript:alert(1)";
  assert.throws(() => validateSnapshot(unsafeRun, entry, catalog), /evaluation report URL/);
});

test("unknown definitions and duplicate catalog IDs fail validation", () => {
  const unknown = structuredClone(snapshot);
  unknown.benchmarks[0].definitionId = "missing";
  assert.throws(() => validateSnapshot(unknown, entry, catalog), /definition/);
  const stale = structuredClone(snapshot);
  stale.benchmarks[0].definitionId = "split-media";
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

const arena = files.find(item => item.file === "webarena-verified/webarena-verified-20261110-report.json").report;
const arenaEntry = { date: "2026-11-10", benchmarkId: "webarena-verified" };

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

test("invalid scores, unbound dates and misplaced page fields are rejected", () => {
  const invalidScore = structuredClone(snapshot);
  invalidScore.benchmarks[0].providers[0].scores.passRate = 101;
  assert.throws(() => validateSnapshot(invalidScore, entry, catalog), /metric/);
  assert.throws(() => validateSnapshot({ ...snapshot, snapshotDate: "2026-11-09" }, entry, catalog), /date/);
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
  const search = files.find(item => item.file === "lexbench-websearch/lexbench-websearch-20261110-report.json").report;
  const qa = files.find(item => item.file === "simpleqa-verified/simpleqa-verified-20261110-report.json").report;
  const searchEntry = { date: "2026-11-10", benchmarkId: "lexbench-websearch" };
  const qaEntry = { date: "2026-11-10", benchmarkId: "simpleqa-verified" };
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
