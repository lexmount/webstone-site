import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseFingerprint, prepareData, discoverResults, parseReportFile, validateSnapshot, validateCatalog } from "../scripts/prepare-data.mjs";

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
    const parsed = parseReportFile(path.dirname(file), path.basename(file));
    assert.equal(report.version, parsed.version);
    assert.equal(report.id, `${parsed.benchmarkId}-${parsed.version}`);
    assert.equal(Object.hasOwn(report, "measuredAt"), false);
    assert.equal(Object.hasOwn(report.source, "versionId"), false);
  }
});

test("report directories are discovered and their declared provenance is validated", async () => {
  const summary = await prepareData({ write: false });
  assert.equal(summary.files, files.length);
  assert.equal(summary.benchmarks, new Set(files.flatMap(item => item.report.benchmarks.map(benchmark => benchmark.id))).size);
  assert.ok(summary.benchmarks <= catalog.benchmarks.length);
});

test("external tracks use safe HTTPS links and cannot own local benchmark tables", () => {
  for (const track of catalog.tracks.filter(track => track.url)) {
    const destination = new URL(track.url);
    assert.equal(destination.protocol, "https:");
    assert.equal(destination.username + destination.password, "");
  }
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:password@example.com", ""]) {
    const invalid = structuredClone(catalog);
    invalid.tracks.find(track => track.id === "browserarena").url = url;
    assert.throws(() => validateCatalog(invalid), /external track URL/);
  }
  const mixed = structuredClone(catalog);
  mixed.tracks[0].url = "https://example.com/";
  assert.throws(() => validateCatalog(mixed), /either local benchmarks or an external URL/);
  const empty = structuredClone(catalog);
  delete empty.tracks.find(track => track.id === "browserarena").url;
  assert.throws(() => validateCatalog(empty), /either local benchmarks or an external URL/);
});

test("every participant has a reusable HTTPS project link outside the result files", () => {
  const ids = new Set(files.flatMap(({ report }) => report.benchmarks.flatMap(benchmark => benchmark.providers.map(provider => provider.id))));
  for (const id of ids) {
    assert.ok(catalog.providerUrls?.[id], `Missing project link for ${id}`);
    assert.equal(new URL(catalog.providerUrls[id]).protocol, "https:");
  }
  const missing = structuredClone(catalog);
  delete missing.providerUrls?.[snapshot.benchmarks[0].providers[0].id];
  assert.throws(() => validateSnapshot(snapshot, entry, missing), /provider project URL/);
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:password@example.com"]) {
    const unsafe = structuredClone(catalog);
    unsafe.providerUrls = { ...unsafe.providerUrls, moli: url };
    assert.throws(() => validateCatalog(unsafe), /provider project URL/);
  }
});

test("adding and removing a version file needs no index update", async t => {
  const folder = await mkdtemp(path.join(tmpdir(), "webstone-reports-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const benchmarkFolder = path.join(folder, "lexbench-webfetch");
  await mkdir(benchmarkFolder);
  const firstFile = path.join(benchmarkFolder, "lexbench-webfetch-v1-report.json");
  const nextFile = path.join(benchmarkFolder, "lexbench-webfetch-v1.1.0-report.json");
  const next = { ...snapshot, id: "lexbench-webfetch-v1.1.0", version: "v1.1.0", release: { date: "2026-11-16", kind: "results", previous: "v1.0.0", summary: "Publish updated measurements." } };
  await writeFile(firstFile, JSON.stringify(snapshot));
  assert.deepEqual((await discoverResults(folder, catalog)).map(item => item.report.version), ["v1"]);
  await writeFile(nextFile, JSON.stringify(next));
  const discovered = await discoverResults(folder, catalog);
  assert.deepEqual(discovered.map(item => item.report.version), ["v1", "v1.1.0"]);
  for (const { file, report } of discovered) {
    const parsed = parseReportFile(path.dirname(file), path.basename(file));
    assert.equal(report.version, parsed.version);
    assert.equal(report.id, `${parsed.benchmarkId}-${parsed.version}`);
  }
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


test("benchmarks in each published Track share its summary blog", () => {
  const reportMetadata = JSON.parse(readFileSync(new URL("../reports/metadata.json", import.meta.url), "utf8"));
  const browserUseIds = new Set(catalog.benchmarks.filter(item => item.trackId === "browser-use").map(item => item.id));
  const browserUseReport = Object.values(reportMetadata.reports).find(report =>
    report.benchmarkIds?.some(id => browserUseIds.has(id)));
  assert.ok(browserUseReport, "browser-use track must reference published report metadata");
  const browserUseUrl = browserUseReport.urls?.[browserUseReport.originalLanguage ?? "zh"];
  assert.ok(browserUseUrl, "browser-use report metadata must provide a primary-language URL");
  const reports = {
    webfetch: "https://yours.lexmount.cn/artifact-site/s/sBygxmqjB5wc",
    websearch: "https://yours.lexmount.cn/artifact-site/s/-FtUMQm-NmQa",
    webextract: "https://yours.lexmount.cn/artifact-site/s/-eNSiFI3n7XX",
    "browser-use": browserUseUrl,
  };
  for (const [trackId, url] of Object.entries(reports)) {
    const benchmarks = catalog.benchmarks.filter(item => item.trackId === trackId);
    assert.ok(benchmarks.length >= 2);
    for (const benchmark of benchmarks) assert.equal(benchmark.reportUrl, url, benchmark.id);
  }
});

test("updated search layers preserve published scores and independent populations", () => {
  const get = id => files.find(item => item.report.id === id).report;
  const scenarios = get("lexbench-websearch-v2").benchmarks[0];
  const facts = get("simpleqa-verified-v2").benchmarks[0];
  assert.equal(scenarios.taskCount, 149);
  assert.equal(facts.taskCount, 773);
  assert.deepEqual(scenarios.providers.map(p => [p.id, p.scores.ndcg5, p.scores.precision5, p.scores.success5]), [
    ["yuanbao-standard", 56, 64.4, 63.8], ["yuanbao-lite", 55.5, 63.1, 63.1], ["serper", 51.8, 69.9, 50.3],
    ["lexmount", 49.7, 58.4, 59.7], ["deepseek-content", 48.3, 62.6, 51.7], ["browserbase", 39.9, 57, 14.1],
    ["bocha-ai", 29.3, 44.7, 17.4], ["brightdata", 21.8, 26.4, 20.8], ["bocha-summary", 17.7, 20.9, 12.8],
  ]);
  assert.deepEqual(facts.providers.map(p => [p.id, p.scores.mrr5, p.scores.hit5, p.scores.answerMatch5]), [
    ["serper", .723, 80.5, 68.8], ["lexmount", .658, 79.3, 71.4], ["browserbase", .547, 80.1, 20.4],
    ["brightdata", .268, 30.1, 27.7], ["yuanbao-lite", .180, 26, 64.6], ["deepseek-content", .173, 27.3, 73.1],
    ["yuanbao-standard", .151, 24.5, 64.6], ["bocha-ai", .117, 19.5, 15.7], ["bocha-summary", .004, .5, 3.6],
  ]);
  assert.equal(facts.metricSamples.mrr5.sampleCount, 773);
  assert.equal(facts.metricSamples.meanTime.sampleCount, 831);
  assert.match(get("simpleqa-verified-v2").datasetDifference, /58 questions with defective reference/);
  assert.deepEqual(facts.sourceMatches.lexmount, { original: 603, equivalent: 9, replica: 1, missing: 160 });
  assert.deepEqual(scenarios.providers[0].confidenceIntervals.ndcg5, { lower: 50.3, upper: 61.5, level: .95 });
  assert.equal(scenarios.providers[0].scores.meanChars, 3742.75);
  assert.equal(scenarios.providers[0].scores.meanTime, 702.91);
  assert.equal(scenarios.providers[0].scores.p95Time, 1049.71);
  assert.deepEqual(get("lexbench-websearch-excerpts-v1").benchmarks[0].providers.map(p => p.scores.ndcg5), [61.4, 58.5, 52.3, 24.4]);
  assert.deepEqual(get("simpleqa-verified-excerpts-v1").benchmarks[0].providers.map(p => p.scores.excerptMatch5), [73.4, 69.9, 51.2, 11.3]);
  assert.equal(get("lexbench-websearch-answers-v1").benchmarks[0].providers[0].scores.usefulness, 2.62);
  assert.equal(get("simpleqa-verified-answers-v1").benchmarks[0].providers[0].scores.answerAccuracy, 49.4);
  assert.equal(get("simpleqa-verified-answers-v1").benchmarks[0].metricSamples.citationSupport.sampleCount, undefined);
  assert.match(scenarios.providers[0].billingDescription, /successful searches/);
  assert.match(scenarios.providers.find(p => p.id === "lexmount").billingDescription, /requests/);
});

test("confidence intervals and source coverage reject invented or inconsistent values", () => {
  const report = files.find(item => item.report.id === "simpleqa-verified-v2").report;
  const entry = { benchmarkId: "simpleqa-verified", version: "v2" };
  for (const interval of [{ lower: .8, upper: .9, level: .95 }, { lower: 0, upper: 1.1, level: .95 }, { lower: 0, upper: 1, level: 1 }]) {
    const invalid = structuredClone(report);
    invalid.benchmarks[0].providers[0].confidenceIntervals.mrr5 = interval;
    assert.throws(() => validateSnapshot(invalid, entry, catalog), /confidence interval/);
  }
  const invalid = structuredClone(report);
  invalid.benchmarks[0].sourceMatches.lexmount.missing++;
  assert.throws(() => validateSnapshot(invalid, entry, catalog), /source match population/);
});

test("semantic result versions require an honest release date and summary", () => {
  const semantic = { ...structuredClone(snapshot), id: "lexbench-webfetch-v1.1.0", version: "v1.1.0", release: { date: "2026-11-16", kind: "results", previous: "v1.0.0", summary: "Publish updated measurements." } };
  const nextEntry = parseReportFile("lexbench-webfetch", "lexbench-webfetch-v1.1.0-report.json");
  assert.doesNotThrow(() => validateSnapshot(semantic, nextEntry, catalog));
  for (const date of ["2026-02-30", "2026-13-01", "2099-01-01", "2026-1-1", ""]) assert.throws(() => validateSnapshot({ ...semantic, release: { ...semantic.release, date } }, nextEntry, catalog), /release date/);
  assert.throws(() => validateSnapshot({ ...semantic, release: undefined }, nextEntry, catalog), /release summary/);
  for (const version of ["v1.01.0", "v0.1.0", "v1.0", "v1.0.0-beta", "v1.0.0\n"]) assert.throws(() => parseReportFile("lexbench-webfetch", `lexbench-webfetch-${version}-report.json`), /Expected/);
});

test("explicit metric ranges bound scores and confidence intervals", () => {
  const bounded = structuredClone(catalog);
  const metric = bounded.benchmarks[0].definitions.find(item => item.id === snapshot.benchmarks[0].definitionId).metrics.find(item => item.id === "passRate");
  metric.chartRange = [0, 95];
  const report = structuredClone(snapshot);
  report.benchmarks[0].providers[0].scores.passRate = 96;
  assert.throws(() => validateSnapshot(report, entry, bounded), /Invalid or fabricated metric/);
  report.benchmarks[0].providers[0].scores.passRate = 90;
  report.benchmarks[0].providers[0].confidenceIntervals = { passRate: { lower: 85, upper: 96, level: .95 } };
  assert.throws(() => validateSnapshot(report, entry, bounded), /Invalid confidence interval/);
});


test("navigation groups reject orphaned or duplicate placements and premature published tracks", () => {
  const invalid = structuredClone(catalog);
  invalid.tracks[0].groupId = "missing";
  assert.throws(() => validateCatalog(invalid), /Unknown track navigation group/);
  const duplicate = structuredClone(catalog);
  duplicate.navigationGroups[1].id = duplicate.navigationGroups[0].id;
  assert.throws(() => validateCatalog(duplicate), /Duplicate navigation group/);
  const malformed = structuredClone(catalog);
  malformed.navigationGroups[0].upcoming = [null];
  assert.throws(() => validateCatalog(malformed), /upcoming track/);
  const premature = structuredClone(catalog);
  premature.navigationGroups[0].upcoming[0].id = premature.tracks[0].id;
  assert.throws(() => validateCatalog(premature), /separate from published tracks/);
});


test("static brand changes update the release while generated delivery files do not", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "webstone-assets-"));
  try {
    for (const file of ["web/app/page.tsx", "web/components/card.tsx", "web/lib/labels.ts", "web/public/brand/webstone.png", "benchmarks/catalog.json", "reports/metadata.json", "web/next.config.ts", "web/package.json", "package-lock.json"]) {
      await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
      await writeFile(path.join(folder, file), "initial content");
    }
    const first = await releaseFingerprint([], folder);
    await writeFile(path.join(folder, "web/public/brand/webstone.png"), "updated brand image");
    const second = await releaseFingerprint([], folder);
    assert.notEqual(second, first);
    await mkdir(path.join(folder, "web/public/results"), { recursive: true });
    await writeFile(path.join(folder, "web/public/results/reports.json"), "generated data");
    await writeFile(path.join(folder, "web/public/release.json"), "generated release");
    assert.equal(await releaseFingerprint([], folder), second);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("official pricing links reject executable URLs, credentials, internal hosts and unknown methods", () => {
  for (const url of ["javascript:alert(1)", "http://example.com/pricing", "https://user:secret@example.com/pricing", "https://pricing.internal/", "https://127.0.0.1/pricing"]) {
    const invalid=structuredClone(catalog);
    invalid.pricingSources={"zyte-custom":[{label:"Pricing",url}]};
    assert.throws(()=>validateCatalog(invalid),/pricing sources/);
  }
  const invalid=structuredClone(catalog);
  invalid.pricingSources={unknown:[{label:"Pricing",url:"https://example.com/pricing"}]};
  assert.throws(()=>validateCatalog(invalid),/pricing sources/);
});

test("browser and touch icons are square at their declared sizes", () => {
  for (const size of [32,64,180,192]) {
    const png=readFileSync(new URL(`../web/public/brand/icon-${size}.png`,import.meta.url));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
});

test("example references must be public HTTPS and the task flow must be complete", () => {
  const invalidExamples = [
    { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://localhost/task' },
    { referenceUrl: 'https://internal/task' }, { steps: [] }, { steps: [''] },
    { outputLabel: '' }, { input: '' }, { output: '' }, { check: '' },
  ];
  for (const patch of invalidExamples) {
    const invalid = structuredClone(catalog);
    Object.assign(invalid.benchmarks[0].example, patch);
    assert.throws(() => validateCatalog(invalid), /Invalid benchmark example/);
  }
});

test("recorded examples require a provider and safe, traceable response provenance", () => {
  const recording = { provider: 'Search provider', reportUrl: 'https://example.com/evaluation', file: 'calls/response.json', sha256: 'a'.repeat(64) };
  const valid = structuredClone(catalog);
  valid.benchmarks[0].example.recording = recording;
  assert.doesNotThrow(() => validateCatalog(valid));
  for (const patch of [{provider: ''}, {reportUrl: 'javascript:alert(1)'}, {reportUrl: 'https://user:secret@example.com/'}, {file: '../credentials.json'}, {sha256: ''}]) {
    const invalid = structuredClone(valid);
    Object.assign(invalid.benchmarks[0].example.recording, patch);
    assert.throws(() => validateCatalog(invalid), /Invalid recorded example provenance/);
  }
});

test("key metrics name existing columns once and keep the ranking metric first", () => {
  for (const value of [[], ['unknown'], ['passRate', 'passRate'], ['requestRate', 'passRate']]) {
    const invalid = structuredClone(catalog);
    invalid.benchmarks.find(item => item.id === 'lexbench-webfetch').definitions[0].keyMetricIds = value;
    assert.throws(() => validateCatalog(invalid), /Invalid key metric presentation/);
  }
});
