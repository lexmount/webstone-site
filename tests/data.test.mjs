import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareData, validateSnapshot } from "../scripts/prepare-data.mjs";

test("only indexed result snapshots are published and their declared provenance is validated", async () => {
  const summary = await prepareData({ write: false });
  assert.equal(summary.files, 2);
  assert.equal(summary.benchmarks, 4);
});

const snapshot = JSON.parse(readFileSync(new URL("../results/webfetch-summary/2026-11-10/report.json", import.meta.url), "utf8"));
const entry = JSON.parse(readFileSync(new URL("../results/index.json", import.meta.url), "utf8")).entries[0];

test("invalid scores, unbound dates and invented measurement dates are rejected", () => {
  const invalidScore = structuredClone(snapshot);
  invalidScore.benchmarks[0].providers[0].scores.passRate = 101;
  assert.throws(() => validateSnapshot(invalidScore, entry), /metric/);
  assert.throws(() => validateSnapshot({ ...snapshot, snapshotDate: "2026-11-09" }, entry), /date/);
  assert.throws(() => validateSnapshot({ ...snapshot, measuredAt: "2026-11-10" }, entry), /measurement date/);
  const invalidPrecision = structuredClone(snapshot);
  invalidPrecision.benchmarks[0].metrics[0].decimals = 101;
  assert.throws(() => validateSnapshot(invalidPrecision, entry), /precision/);
});

test("category pass counts stay within their totals and the totals match the task count", () => {
  const overflow = structuredClone(snapshot);
  overflow.benchmarks[0].providers[0].categoryPassed.static = 101;
  assert.throws(() => validateSnapshot(overflow, entry), /category pass count/);
  const unknown = structuredClone(snapshot);
  unknown.benchmarks[0].providers[0].categoryPassed.video = 1;
  assert.throws(() => validateSnapshot(unknown, entry), /category pass count/);
  const drift = structuredClone(snapshot);
  drift.benchmarks[0].categories[0].total = 90;
  assert.throws(() => validateSnapshot(drift, entry), /Category totals/);
});

test("image provenance, monetary values, latency and ratio limits are validated", () => {
  const search = JSON.parse(readFileSync(new URL("../results/websearch-summary/2026-11-10/report.json", import.meta.url), "utf8"));
  const searchEntry = JSON.parse(readFileSync(new URL("../results/index.json", import.meta.url), "utf8")).entries[1];
  const longRequest = structuredClone(search);
  longRequest.benchmarks[0].providers[0].scores.responseTime = 146.41;
  assert.doesNotThrow(() => validateSnapshot(longRequest, searchEntry));
  const badImage = structuredClone(search);
  badImage.source.sha256 = "unknown";
  assert.throws(() => validateSnapshot(badImage, searchEntry), /image source/);
  const badRatio = structuredClone(search);
  badRatio.benchmarks[1].providers[0].scores.mrr5 = 1.01;
  assert.throws(() => validateSnapshot(badRatio, searchEntry), /metric/);
  const negativePrice = structuredClone(search);
  negativePrice.benchmarks[0].providers[0].scores.pricePerThousand = -1;
  assert.throws(() => validateSnapshot(negativePrice, searchEntry), /metric/);
  assert.equal(search.benchmarks[0].metrics[0].sampleCount, 980);
  assert.equal(search.benchmarks[1].metrics[0].sampleCount, 980);
});
