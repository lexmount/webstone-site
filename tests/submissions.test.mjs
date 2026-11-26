import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkResultChange as checkResultChangeRaw, checkGitChange, validateReleaseChange, validateBrowserCohort } from "../scripts/check-result-change.mjs";

const catalog = JSON.parse(readFileSync(new URL("../benchmarks/catalog.json", import.meta.url), "utf8"));
const original = JSON.parse(readFileSync(new URL("../results/lexbench-webfetch/lexbench-webfetch-v1-report.json", import.meta.url), "utf8"));
// The publication fixture contains one measured version per browser.
original.benchmarks[0].providers = original.benchmarks[0].providers.filter(provider => provider.id !== "moli-1-1-15");
const published = ["results/lexbench-webfetch/lexbench-webfetch-v1-report.json"];
const versionName = version => typeof version === "number" ? `v1.${version - 1}.0` : version;
const report = version => {
  const candidate = { ...structuredClone(original), source: { ...original.source, url: "https://example.com/evaluation" }, id: `lexbench-webfetch-${versionName(version)}`, version: versionName(version), release: { date: "2026-11-16", kind: "results", previous: typeof version === "number" && version > 2 ? `v1.${version - 2}.0` : "v1.0.0", summary: "Publish evaluation results." } };
  return candidate;
};
const addition = version => ({ path: `results/lexbench-webfetch/lexbench-webfetch-${versionName(version)}-report.json`, status: "A", mode: "100644", content: JSON.stringify(report(version)) });
const checkResultChange = (before, after, changes, paths, prior = new Map([[published[0], original]])) => checkResultChangeRaw(before, after, changes, paths, prior);

test("result submissions add the next version without changing definitions or history", () => {
  assert.deepEqual(checkResultChange(catalog, catalog, [addition(2)], published), { reports: 1 });
  assert.deepEqual(checkResultChange(catalog, catalog, [{ path: "README.md", status: "M" }], published), { reports: 0 });
  for (const status of ["M", "D", "T"]) assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), status }], published), /immutable/);
  assert.throws(() => checkResultChange(catalog, catalog, [addition(3)], published), /Expected lexbench-webfetch v1.1.0/);
  assert.throws(() => checkResultChange(catalog, catalog, [addition(2), { path: "web/app/page.tsx", status: "M" }], published), /separately from code/);
  const changed = structuredClone(catalog);
  changed.benchmarks[0].description = "Changed definition";
  assert.throws(() => checkResultChange(catalog, changed, [addition(2)], published), /separate pull request/);
  const previous = report("v10.9.0");
  const paths = ["results/lexbench-webfetch/lexbench-webfetch-v10.9.0-report.json"];
  const changes = ["v10.11.0", "v10.10.0"].map((version, index) => {
    const data = report(version); data.release.previous = index ? "v10.9.0" : "v10.10.0";
    return { ...addition(version), content: JSON.stringify(data) };
  });
  assert.deepEqual(checkResultChange(catalog, catalog, changes, paths, new Map([[paths[0], previous]])), { reports: 2 });
});

test("external submissions can add their own public project and evidence URLs", () => {
  const next = structuredClone(catalog);
  next.providerUrls["new-method"] = "https://example.com/product";
  const data = report(2);
  data.source.url = "https://example.com/evaluation";
  data.source.kind = "report-page";
  data.benchmarks[0].providers[0].id = "new-method";
  const change = { ...addition(2), content: JSON.stringify(data) };
  assert.deepEqual(checkResultChange(catalog, next, [change], published), { reports: 1 });
  next.providerUrls.moli = "https://example.com/replacement";
  assert.throws(() => checkResultChange(catalog, next, [change], published), /Existing participant URLs/);
  const invalid = report(2);
  invalid.source.url = "http://example.com/report";
  assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: JSON.stringify(invalid) }], published), /HTTPS source/);
});

test("untrusted result configuration, notes and translations must have display-safe types", () => {
  for (const mutate of [
    item => { item.benchmarks[0].providers[0].description = { unsafe: "object" }; },
    item => { item.benchmarks[0].notes = "not an array"; },
    item => { item.translations = { zh: { label: { unsafe: true } } }; },
    item => { item.benchmarks[0].providers[0].scores = []; },
  ]) {
    const data = report(2);
    mutate(data);
    assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: JSON.stringify(data) }], published), /Invalid|invalid/);
  }
});

test("public submissions reject local evidence, escaped credentials and unused inherited names", () => {
  for (const host of ["localhost", "127.0.0.1", "192.168.1.1", "[::1]", "[fd00::1]", "reports.local"]) {
    const data = report(2);
    data.source.url = `https://${host}/report`;
    assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: JSON.stringify(data) }], published), /public HTTPS/);
  }
  const data = report(2);
  data.benchmarks[0].notes.push("ghp_" + "x".repeat(36));
  const escaped = JSON.stringify(data).replace("ghp_", "\\u0067hp_");
  assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: escaped }], published), /credential-like/);
  const duplicate = addition(2).content.replace('"notes":', '"notes":["ghp_' + "x".repeat(36) + '"],"notes":');
  assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: duplicate }], published), /credential-like/);
  for (const header of ["-----BEGIN DSA PRIVATE KEY-----", "-----BEGIN ENCRYPTED PRIVATE KEY-----"]) {
    const hidden = addition(2).content.replace('"notes":', '"notes":[' + JSON.stringify(header) + '],"notes":');
    assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: hidden }], published), /credential-like/);
  }
  for (const prefix of ["\n", "\t"]) {
    data.benchmarks[0].notes = [prefix + "ghp_" + "x".repeat(36)];
    assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: JSON.stringify(data) }], published), /credential-like/);
  }
  data.benchmarks[0].notes = ["token_ghp_" + "x".repeat(36) + "_"];
  assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: JSON.stringify(data).replace("ghp_", "\\u0067hp_") }], published), /credential-like/);
  const next = structuredClone(catalog);
  next.providerUrls[data.benchmarks[0].providers[0].id] += "?token=ghp_" + "x".repeat(36);
  assert.throws(() => checkResultChange(next, next, [addition(2)], published), /credential-like/);
  for (const key of ["constructor", "toString"]) {
    const extra = structuredClone(catalog);
    extra.providerUrls[key] = "https://example.com/project";
    assert.throws(() => checkResultChange(catalog, extra, [addition(2)], published), /Only add project URLs/);
  }
});

test("the Git boundary rejects symlinks, mixed code changes and invalid paths", t => {
  const environment = ["GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL"].map(key => [key, process.env[key]]);
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  t.after(() => { for (const [key, value] of environment) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const directory = mkdtempSync(path.join(tmpdir(), "webstone-submission-git-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.com");
  mkdirSync(path.join(directory, "benchmarks"));
  mkdirSync(path.join(directory, "results/lexbench-webfetch"), { recursive: true });
  writeFileSync(path.join(directory, "benchmarks/catalog.json"), JSON.stringify(catalog));
  writeFileSync(path.join(directory, published[0]), JSON.stringify(original));
  git("add", "."); git("commit", "-m", "Base fixture");
  let base = git("rev-parse", "HEAD");
  const file = path.join(directory, addition(2).path);
  writeFileSync(file, addition(2).content);
  git("add", "."); git("commit", "-m", "Valid new report");
  assert.deepEqual(checkGitChangeFrom(directory, base, git("rev-parse", "HEAD")), { reports: 1 });
  const contributor = git("rev-parse", "HEAD");
  git("checkout", "-b", "advanced-main", base);
  writeFileSync(path.join(directory, "README.md"), "Unrelated upstream code change");
  git("add", "."); git("commit", "-m", "Main advanced independently");
  base = git("rev-parse", "HEAD");
  git("merge", "--no-edit", contributor);
  assert.deepEqual(checkGitChangeFrom(directory, base, git("rev-parse", "HEAD")), { reports: 1 });
  rmSync(file); symlinkSync("../../benchmarks/catalog.json", file);
  git("add", "."); git("commit", "-m", "Unsafe link");
  assert.throws(() => checkGitChangeFrom(directory, base, git("rev-parse", "HEAD")), /symbolic links/);
  for (const scenario of ["invalid-path", "newline-path", "executable", "oversized", "mixed-code", "catalog-duplicate", "catalog-mode"]) {
    git("reset", "--hard", base);
    let relative = addition(2).path;
    if (scenario === "invalid-path") relative = "results/lexbench-webfetch/not-a-report.json";
    if (scenario === "newline-path") relative += "\n";
    writeFileSync(path.join(directory, relative), scenario === "oversized" ? " ".repeat(1024 * 1024 + 1) : addition(2).content);
    if (scenario === "mixed-code") writeFileSync(path.join(directory, "README.md"), "Mixed application change");
    if (scenario === "catalog-duplicate") {
      const content = JSON.stringify(catalog).replace('"providerUrls":', '"discarded":"ghp_' + "x".repeat(36) + '","discarded":null,"providerUrls":');
      writeFileSync(path.join(directory, "benchmarks/catalog.json"), content);
    }
    git("add", ".");
    if (scenario === "executable") git("update-index", "--chmod=+x", relative);
    if (scenario === "catalog-mode") git("update-index", "--chmod=+x", "benchmarks/catalog.json");
    git("commit", "-m", scenario);
    assert.throws(() => checkGitChangeFrom(directory, base, git("rev-parse", "HEAD")), /Invalid result report path|symbolic links or executable|exceeds 1 MiB|separately from code|credential-like|non-executable/);
  }
  for (const scenario of ["modify", "delete", "rename"]) {
    git("reset", "--hard", base);
    const historical = path.join(directory, published[0]);
    if (scenario === "modify") writeFileSync(historical, JSON.stringify(original) + "\n");
    if (scenario === "delete") rmSync(historical);
    if (scenario === "rename") git("mv", published[0], "archived-report.json");
    git("add", "."); git("commit", "-m", scenario + " published history");
    assert.throws(() => checkGitChangeFrom(directory, base, git("rev-parse", "HEAD")), /immutable/);
  }
  git("reset", "--hard", base);
  for (let version = 2; version < 23; version++) {
    writeFileSync(path.join(directory, addition(version).path), version === 2 ? " ".repeat(1024 * 1024 + 1) : addition(version).content);
  }
  git("add", "."); git("commit", "-m", "Too many reports, including an oversized first blob");
  assert.throws(() => checkGitChangeFrom(directory, base, git("rev-parse", "HEAD")), /at most 20/);
});

function checkGitChangeFrom(directory, base, head) {
  const previous = process.cwd();
  try { process.chdir(directory); return checkGitChange(base, head); }
  finally { process.chdir(previous); }
}

test("semantic releases enforce major/minor/patch changes and immutable history", () => {
  const metadata = report("v1.0.1");
  metadata.release.kind = "metadata";
  metadata.benchmarks[0].notes.push("Clarify the published evidence.");
  assert.deepEqual(checkResultChange(catalog, catalog, [{ ...addition("v1.0.1"), content: JSON.stringify(metadata) }], published), { reports: 1 });
  metadata.benchmarks[0].providers[0].scores.passRate = 1;
  assert.throws(() => validateReleaseChange(original, metadata), /cannot change measurements/);
  const results = report(2);
  results.benchmarks[0].taskCount++;
  assert.throws(() => validateReleaseChange(original, results), /protocol release/);
  results.release.kind = "protocol";
  assert.doesNotThrow(() => validateReleaseChange(original, results));
  const mismatch = report(2);
  mismatch.release.previous = "v2.0.0";
  assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: JSON.stringify(mismatch) }], published), /latest previous/);
  assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), path: published[0], content: JSON.stringify(original) }], published), /semantic versions/);
});

test("metadata releases may add or remove note-only sample entries", () => {
  const metadata = report("v1.0.1");
  metadata.release.kind = "metadata";
  metadata.benchmarks[0].metricSamples = { ...metadata.benchmarks[0].metricSamples, passRate: { note: "Clarify the published evidence." } };
  assert.deepEqual(checkResultChange(catalog, catalog, [{ ...addition("v1.0.1"), content: JSON.stringify(metadata) }], published), { reports: 1 });
  const withoutNote = structuredClone(metadata);
  delete withoutNote.benchmarks[0].metricSamples.passRate;
  assert.doesNotThrow(() => validateReleaseChange(metadata, withoutNote));
  const changedPopulation = structuredClone(metadata);
  changedPopulation.benchmarks[0].metricSamples.passRate.sampleCount = 1;
  assert.throws(() => validateReleaseChange(metadata, changedPopulation), /protocol release/);
});

test("metadata may correct pricing wording while preserving all numeric pricing fields", () => {
  const previous = JSON.parse(readFileSync(new URL("../results/lexbench-swde/lexbench-swde-v1-report.json", import.meta.url), "utf8"));
  const metadata = structuredClone(previous);
  metadata.id = "lexbench-swde-v1.0.1";
  metadata.version = "v1.0.1";
  metadata.source.url = "https://example.com/evaluation";
  metadata.release = { date: "2026-11-16", kind: "metadata", previous: "v1.0.0", summary: "Clarify the billing explanation." };
  const pricing = metadata.benchmarks[0].providers[0].pricing;
  pricing.description = "Clarify the billing explanation without changing charges.";
  const previousPath = "results/lexbench-swde/lexbench-swde-v1-report.json";
  const change = { path: "results/lexbench-swde/lexbench-swde-v1.0.1-report.json", status: "A", mode: "100644", content: JSON.stringify(metadata) };
  assert.deepEqual(checkResultChange(catalog, catalog, [change], [previousPath], new Map([[previousPath, previous]])), { reports: 1 });
  pricing.min += 1;
  assert.throws(() => validateReleaseChange(previous, metadata), /cannot change measurements/);
});


test("new browser comparisons reject multiple configurations of one project", () => {
  const candidate = report(2);
  const first = candidate.benchmarks[0].providers.find(provider => provider.id === "moli-1-1-17");
  assert.ok(first);
  candidate.benchmarks[0].providers.push({ ...structuredClone(first), id: "moli-1-1-15", name: "Moli other build" });
  assert.throws(() => checkResultChange(catalog, catalog, [{ ...addition(2), content: JSON.stringify(candidate) }], published), /one configuration per browser/i);
});


test("cohort policy keeps real service tiers and explicit Headless build comparisons", () => {
  for (const [id, version] of [["lexbench-headless-372", "v2.0.0"], ["lexbench-websearch", "v2"]]) {
    const snapshot = JSON.parse(readFileSync(new URL(`../results/${id}/${id}-${version}-report.json`, import.meta.url)));
    assert.doesNotThrow(() => validateBrowserCohort(catalog, snapshot.benchmarks[0]));
  }
});
