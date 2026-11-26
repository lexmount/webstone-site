import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog, validateSnapshot, parseReportFile, publicEvidenceUrl } from "./prepare-data.mjs";

import { canonicalVersion, compareVersions, isSemanticVersion, nextVersion } from "../web/lib/result-version.mjs";

const reportPattern = /^results\/([a-z0-9-]+)\/([a-z0-9-]+-v[1-9]\d*(?:\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))?-report\.json)(?![\s\S])/;
const maximumBytes = 1024 * 1024;

function rejectCredentials(value) {
  if (typeof value === "string") {
    if (/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})/.test(value)) throw new Error("A submission contains a credential-like value. Remove credentials before submitting.");
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) { rejectCredentials(key); rejectCredentials(child); }
  }
}

function parsePublicJSON(raw) {
  // Inspect every string token, including values hidden by duplicate JSON keys.
  for (const [token] of raw.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    let value;
    try { value = JSON.parse(token); } catch { throw new Error("Invalid JSON string"); }
    rejectCredentials(value);
  }
  try { return JSON.parse(raw); } catch { throw new Error("Invalid JSON document"); }
}

function submissionChanges(changes) {
  const reports = changes.filter(change => change.path.startsWith("results/"));
  if (reports.some(change => change.status !== "A")) throw new Error("Published reports are immutable. Add a new version; do not edit, delete or rename an existing report.");
  if (reports.length > 20) throw new Error("Split submissions into at most 20 report files per pull request.");
  if (reports.length && changes.some(change => change.path !== "benchmarks/catalog.json" && !reportPattern.test(change.path))) throw new Error("Submit results separately from code, definitions and website changes; invalid result report paths are not allowed.");
  return reports;
}

export function checkResultChange(baseCatalog, catalog, changes, publishedPaths, publishedReports = new Map()) {
  const resultChanges = submissionChanges(changes);
  if (!resultChanges.length) return { reports: 0 };
  const { providerUrls: originalUrls, ...originalDefinitions } = baseCatalog;
  const { providerUrls, ...definitions } = catalog;
  if (!isDeepStrictEqual(originalDefinitions, definitions)) throw new Error("A result submission may only add participant project URLs to the catalog. Definition changes need a separate pull request.");
  if (Object.entries(originalUrls).some(([id, url]) => providerUrls?.[id] !== url)) throw new Error("Existing participant URLs cannot be changed by a result submission.");
  validateCatalog(catalog);
  rejectCredentials(providerUrls);
  const reportsByPath = new Map(publishedReports);
  const latest = new Map();
  for (const published of publishedPaths) {
    const match = reportPattern.exec(published);
    if (!match) continue;
    const { version } = parseReportFile(match[1], match[2]);
    if (!latest.has(match[1]) || compareVersions(version, latest.get(match[1]).version) > 0) latest.set(match[1], { version, path: published });
  }
  const reports = resultChanges.map(change => {
    const match = reportPattern.exec(change.path);
    if (!match || change.mode !== "100644") throw new Error("Reports must be regular JSON files in a benchmark directory.");
    if (Buffer.byteLength(change.content, "utf8") > maximumBytes) throw new Error("A report exceeds 1 MiB. Keep raw logs and large evidence outside Git.");
    const entry = parseReportFile(match[1], match[2]);
    if (!isSemanticVersion(entry.version)) throw new Error("New result submissions must use semantic versions vX.Y.Z.");
    const report = parsePublicJSON(change.content);
    rejectCredentials(report);
    if (!publicEvidenceUrl(report.source?.url)) throw new Error("New submissions require a public HTTPS source URL with a DNS hostname and no credentials.");
    validateSnapshot(report, entry, catalog);
    if (report.release.kind !== "metadata") validateBrowserCohort(catalog, report.benchmarks[0]);
    return { entry, report };
  }).sort((a, b) => a.entry.benchmarkId.localeCompare(b.entry.benchmarkId) || compareVersions(a.entry.version, b.entry.version));
  const participants = new Set(reports.flatMap(({ report }) => report.benchmarks[0].providers.map(provider => provider.id)));
  for (const id of Object.keys(providerUrls)) {
    if (!Object.hasOwn(originalUrls, id) && !participants.has(id)) throw new Error("Only add project URLs used by this submission.");
  }
  for (const { entry, report } of reports) {
    const previous = latest.get(entry.benchmarkId);
    const next = nextVersion(previous?.version, report.release.kind);
    if (entry.version !== next) throw new Error(`Expected ${entry.benchmarkId} ${next}. Rebase the submission if another version was published first.`);
    if ((previous ? canonicalVersion(previous.version) : null) !== (report.release.previous === null ? null : canonicalVersion(report.release.previous))) throw new Error("The release must identify the latest previous result version.");
    const prior = previous && reportsByPath.get(previous.path);
    if (previous && !prior) throw new Error("The previous published result must be inspected before releasing an update.");
    if (prior) {
      if (prior.release?.date && report.release.date < prior.release.date) throw new Error("A result release cannot predate its previous release.");
      validateReleaseChange(prior, report);
    }
    latest.set(entry.benchmarkId, { version: entry.version, path: `${entry.benchmarkId}/${entry.version}` });
    reportsByPath.set(`${entry.benchmarkId}/${entry.version}`, report);
  }
  return { reports: reports.length };
}

// Standard browser comparisons publish one configuration per verified project.
// The historical Headless Browser protocol explicitly compares build/layout variants.
export function validateBrowserCohort(catalog, benchmark) {
  const info = catalog.benchmarks.find(item => item.id === benchmark.id);
  if (info?.trackId !== "webfetch" && benchmark.id !== "webarena-verified") return;
  const projects = new Set();
  for (const provider of benchmark.providers) {
    const url = new URL(catalog.providerUrls[provider.id]);
    url.hostname = url.hostname.replace(/\.$/, "");
    let project = url.origin + url.pathname.replace(/\/+$/, "");
    // A GitHub repository has one identity across case, clone URLs and subpaths.
    const parts = url.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part));
    if (url.hostname.replace(/^www\./, "") === "github.com" && parts.length >= 2) {
      project = `github:${parts[0].toLowerCase()}/${parts[1].replace(/\.git$/i, "").toLowerCase()}`;
    }
    if (projects.has(project)) throw new Error("Public comparisons allow one configuration per browser.");
    projects.add(project);
  }
}

function population(benchmark) {
  return {
    definitionId: benchmark.definitionId, taskCount: benchmark.taskCount,
    categoryTotals: benchmark.categoryTotals,
    metricSamples: Object.fromEntries(Object.entries(benchmark.metricSamples ?? {}).flatMap(([id, { note, ...sample }]) => Object.keys(sample).length ? [[id, sample]] : [])),
  };
}

function measurements(benchmark) {
  const { notes, reportUrl, metricSamples, ...data } = benchmark;
  return { ...data, metricSamples: population(benchmark).metricSamples,
    providers: data.providers.map(({ description, billingDescription, ...provider }) => {
      if (!provider.pricing) return provider;
      const { description: pricingDescription, ...pricing } = provider.pricing;
      return { ...provider, pricing };
    }) };
}

export function validateReleaseChange(previous, report) {
  const prior = previous.benchmarks[0], next = report.benchmarks[0];
  if (report.release.kind !== "protocol" && !isDeepStrictEqual(population(prior), population(next))) throw new Error("Population or evaluation definition changes require a protocol release.");
  if (report.release.kind === "metadata" && !isDeepStrictEqual(measurements(prior), measurements(next))) throw new Error("Metadata releases cannot change measurements or method configurations; use a results release.");
}

export function checkGitChange(base, head) {
  if (![base, head].every(sha => /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sha))) throw new Error("Use full commit hashes for the submission check.");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const read = (ref, file) => git("show", `${ref}:${file}`);
  const fields = git("diff", "--name-status", "--no-renames", "-z", base, head, "--").split("\0");
  const changes = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    const [status, file] = fields.slice(index, index + 2);
    changes.push({ status, path: file });
  }
  submissionChanges(changes);
  for (const record of changes) {
    const { status, path: file } = record;
    if (file === "benchmarks/catalog.json") {
      const info = git("ls-tree", head, "--", file).split(/\s+/);
      if (info[0] !== "100644" || info[1] !== "blob") throw new Error("The catalog must remain a regular non-executable JSON file.");
    }
    if (file?.startsWith("results/") && status === "A") {
      if (!reportPattern.test(file)) throw new Error("Invalid result report path.");
      const info = git("ls-tree", head, "--", file).split(/\s+/);
      if (info[0] !== "100644" || info[1] !== "blob") throw new Error("Result submissions cannot contain symbolic links or executable files.");
      if (Number(git("cat-file", "-s", `${head}:${file}`)) > maximumBytes) throw new Error("A report exceeds 1 MiB.");
      record.mode = info[0];
      record.content = read(head, file);
    }
  }
  const publishedPaths = git("ls-tree", "-r", "--name-only", "-z", base, "--", "results/").split("\0").filter(Boolean);
  const relevant = new Set(changes.filter(item => item.path.startsWith("results/")).map(item => reportPattern.exec(item.path)?.[1]));
  const previousPaths = new Map();
  for (const file of publishedPaths) {
    const match = reportPattern.exec(file);
    if (!match || !relevant.has(match[1])) continue;
    const entry = parseReportFile(match[1], match[2]);
    const current = previousPaths.get(match[1]);
    if (!current || compareVersions(entry.version, current.version) > 0) previousPaths.set(match[1], { version: entry.version, path: file });
  }
  const prior = new Map([...previousPaths.values()].map(entry => [entry.path, JSON.parse(read(base, entry.path))]));
  return checkResultChange(JSON.parse(read(base, "benchmarks/catalog.json")), parsePublicJSON(read(head, "benchmarks/catalog.json")), changes, publishedPaths, prior);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(checkGitChange(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
