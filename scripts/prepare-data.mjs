import { readFile, readdir, mkdir, writeFile, lstat, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";

import { canonicalVersion, isSemanticVersion, versionParts } from "../web/lib/result-version.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalogPath = path.join(root, "benchmarks/catalog.json");
const resultRoot = path.join(root, "results");
const outputRoot = path.join(root, "web/public/results");

function metricMaximum(metric) {
  if (metric?.chartRange) return metric.chartRange[1];
  if (metric?.unit === "ratio") return 1;
  if (["percent", "score", "points"].includes(metric?.unit)) return 100;
  return Infinity;
}

function uniqueIds(items, label) {
  if (!Array.isArray(items) || !items.length || items.some(item => typeof item.id !== "string" || !item.id)) throw new Error(`Invalid ${label}`);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error(`Duplicate ${label} id`);
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export function publicEvidenceUrl(value) {
  if (!httpsUrl(value)) return false;
  const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  // Evidence is linked, never fetched by the validator. Reviewers still verify access.
  return host.includes(".") && !host.includes(":") && !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
    !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateTranslations(value) {
  if (value === undefined) return;
  if (!record(value) || Object.entries(value).some(([language, messages]) =>
    !["en", "zh"].includes(language) || !record(messages) || Object.entries(messages).some(([key, text]) => !key || typeof text !== "string" || !text.trim()))) throw new Error("Invalid display translations");
}

export function validateCatalog(catalog) {
  validateTranslations(catalog.translations);
  if (catalog.schemaVersion !== 1) throw new Error("Invalid benchmark catalog");
  if (!catalog.providerUrls || typeof catalog.providerUrls !== "object" || Array.isArray(catalog.providerUrls) || !Object.keys(catalog.providerUrls).length || !Object.values(catalog.providerUrls).every(httpsUrl)) throw new Error("Missing or invalid provider project URL");
  if (catalog.pricingSources !== undefined && (!record(catalog.pricingSources) || Object.entries(catalog.pricingSources).some(([id, sources]) =>
    !Object.hasOwn(catalog.providerUrls, id) || !Array.isArray(sources) || sources.length === 0 || sources.some(source =>
      !record(source) || typeof source.label !== "string" || !source.label.trim() || !publicEvidenceUrl(source.url))))) throw new Error("Invalid official pricing sources");
  uniqueIds(catalog.tracks, "track");
  uniqueIds(catalog.benchmarks, "benchmark");
  if (catalog.navigationGroups !== undefined) {
    uniqueIds(catalog.navigationGroups, "navigation group");
    const upcoming = [];
    for (const group of catalog.navigationGroups) {
      if (![group.name, group.description].every(value => typeof value === "string" && value.trim())) throw new Error("Missing navigation group information");
      if (group.upcoming !== undefined && !Array.isArray(group.upcoming)) throw new Error("Invalid upcoming tracks");
      for (const item of group.upcoming ?? []) {
        if (!record(item) || ![item.name, item.description].every(value => typeof value === "string" && value.trim()) || catalog.tracks.some(track => track.id === item.id)) throw new Error("An upcoming track must be separate from published tracks");
        upcoming.push(item);
      }
    }
    if (upcoming.length) uniqueIds(upcoming, "upcoming track");
    if (catalog.tracks.some(track => !catalog.navigationGroups.some(group => group.id === track.groupId))) throw new Error("Unknown track navigation group");
  }

  for (const track of catalog.tracks) {
    if (track.url !== undefined && !httpsUrl(track.url)) throw new Error("Invalid external track URL");
    const hasBenchmarks = catalog.benchmarks.some(benchmark => benchmark.trackId === track.id);
    if (track.url ? hasBenchmarks : !hasBenchmarks) throw new Error("A track must have either local benchmarks or an external URL");
  }
  for (const benchmark of catalog.benchmarks) {
    if (!catalog.tracks.some(track => track.id === benchmark.trackId)) throw new Error("Unknown benchmark track");
    if (![benchmark.name, benchmark.datasetName, benchmark.description, benchmark.providerLabel].every(value => typeof value === "string" && value)) throw new Error("Missing benchmark information");
    if (![benchmark.datasetUrl, benchmark.reportUrl].every(httpsUrl)) throw new Error("Missing or invalid benchmark resource URL");
    if (benchmark.datasetUrl === benchmark.reportUrl) throw new Error("Dataset and report must have separate URLs");
    if (new URL(benchmark.datasetUrl).pathname.split("/").filter(Boolean).at(-1) !== benchmark.datasetName) throw new Error("Dataset name must match its URL");
    if (benchmark.example !== undefined) {
      const example = benchmark.example;
      if (!record(example) || ![example.taskId, example.input, example.outputLabel, example.output, example.check].every(value => typeof value === "string" && value.trim())
        || !publicEvidenceUrl(example.sourceUrl) || (example.referenceUrl !== undefined && !publicEvidenceUrl(example.referenceUrl))
        || !Array.isArray(example.steps) || example.steps.length < 2 || example.steps.some(step => typeof step !== "string" || !step.trim())) throw new Error("Invalid benchmark example");
      if (example.recording !== undefined && (!record(example.recording)
        || typeof example.recording.provider !== "string" || !example.recording.provider.trim()
        || !publicEvidenceUrl(example.recording.reportUrl)
        || typeof example.recording.file !== "string" || !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.json$/.test(example.recording.file)
        || !/^[a-f0-9]{64}$/.test(example.recording.sha256))) throw new Error("Invalid recorded example provenance");
    }
    uniqueIds(benchmark.definitions, "definition");
    for (const definition of benchmark.definitions) {
      if (definition.rankable !== undefined && typeof definition.rankable !== "boolean") throw new Error("Invalid ranking presentation");
      uniqueIds(definition.metrics, "metric");
      if (!definition.metrics.some(metric => metric.id === definition.primaryMetric)) throw new Error("Unknown primary metric");
      if (!Array.isArray(definition.keyMetricIds) || definition.keyMetricIds[0] !== definition.primaryMetric
        || new Set(definition.keyMetricIds).size !== definition.keyMetricIds.length
        || definition.keyMetricIds.some(id => !definition.metrics.some(metric => metric.id === id))) throw new Error("Invalid key metric presentation");
      if (definition.leadingMetricIds && (new Set(definition.leadingMetricIds).size !== definition.leadingMetricIds.length || definition.leadingMetricIds.some(id => !definition.metrics.some(metric => metric.id === id)))) throw new Error("Unknown or duplicate leading metric");
      if (definition.categories) uniqueIds(definition.categories, "category");
      for (const metric of definition.metrics) {
        if (!["percent", "score", "seconds", "usd", "ratio", "ms", "mib", "points", "count", "characters"].includes(metric.unit)) throw new Error("Invalid metric unit");
        if (!["asc", "desc"].includes(metric.direction)) throw new Error("Invalid metric direction");
        if (metric.highlightBest !== undefined && typeof metric.highlightBest !== "boolean") throw new Error("Invalid metric highlight rule");
        if (metric.chartRange !== undefined && (!Array.isArray(metric.chartRange) || metric.chartRange.length !== 2 || metric.chartRange[0] !== 0 || !Number.isFinite(metric.chartRange[1]) || metric.chartRange[1] <= 0)) throw new Error("Invalid metric chart range");
        if (metric.signed !== undefined && typeof metric.signed !== "boolean") throw new Error("Invalid metric sign");
        if (metric.decimals !== undefined && (!Number.isInteger(metric.decimals) || metric.decimals < 0 || metric.decimals > 6)) throw new Error("Invalid metric display precision");
        if ("sampleCount" in metric || "scope" in metric) throw new Error("Metric samples belong in the result file");
      }
    }
  }
}

export function parseReportFile(benchmarkId, name) {
  const match = /^([a-z0-9-]+)-(v[1-9]\d*(?:\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))?)-report\.json(?![\s\S])/.exec(name);
  if (!match || match[1] !== benchmarkId) throw new Error("Expected <benchmark>-vX.Y.Z-report.json (or historical vN) directly inside its benchmark directory");
  return { benchmarkId, version: match[2] };
}

export function validateSnapshot(snapshot, entry, catalog) {
  if (!record(snapshot) || !record(snapshot.source) || (snapshot.source.kind !== undefined && (typeof snapshot.source.kind !== "string" || !snapshot.source.kind))) throw new Error("Missing result source provenance");
  validateTranslations(snapshot.translations);
  if ("schemaVersion" in snapshot || "measuredAt" in snapshot || ("source" in snapshot && "versionId" in snapshot.source)) throw new Error("Results must not contain a format or source version");
  if (typeof snapshot.id !== "string" || !snapshot.id || snapshot.id !== `${entry.benchmarkId}-${entry.version}`) throw new Error("Result identity does not match its filename");
  if (snapshot.version !== entry.version) throw new Error("Result version does not match its filename");
  if (isSemanticVersion(snapshot.version) || snapshot.release !== undefined) {
    const release = snapshot.release;
    if (!record(release) || !["protocol", "results", "metadata"].includes(release.kind) || typeof release.summary !== "string" || !release.summary.trim() || !/[A-Za-z]/.test(release.summary) || /\p{Script=Han}/u.test(release.summary)) throw new Error("A semantic result version requires an English release summary and kind");
    if (typeof release.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(release.date) || !Number.isFinite(Date.parse(release.date)) || new Date(release.date).toISOString().slice(0, 10) !== release.date || release.date > new Date().toISOString().slice(0, 10)) throw new Error("Invalid result release date; use an actual UTC calendar date, not a future date");
    if (release.previous !== null) versionParts(release.previous);
  }
  if (typeof snapshot.datasetDifference !== "string" || !snapshot.datasetDifference.trim() || !/[A-Za-z]/.test(snapshot.datasetDifference) || /\p{Script=Han}/u.test(snapshot.datasetDifference)) throw new Error("Missing or non-English dataset difference");
  if (snapshot.source.kind === "user-provided-text") {
    if (!snapshot.source.method || !snapshot.source.scope) throw new Error("Missing user-provided text provenance");
  } else {
    const source = new URL(snapshot.source.url);
    if (!publicEvidenceUrl(snapshot.source.url)) {
      throw new Error("Source provenance requires a public HTTPS DNS hostname");
    }
    if (snapshot.source.kind === "user-provided-image") {
      if (!/^[a-f0-9]{64}$/.test(snapshot.source.sha256 ?? "")) throw new Error("Invalid image source provenance");
    }
  }
  if (!Array.isArray(snapshot.benchmarks) || snapshot.benchmarks.length !== 1) throw new Error("Each result file must contain exactly one benchmark");
  for (const benchmark of snapshot.benchmarks) {
    const allowed = ["id", "definitionId", "taskCount", "categoryTotals", "metricSamples", "otherBest", "notes", "reportUrl", "providers", "sourceMatches"];
    if (Object.keys(benchmark).some(key => !allowed.includes(key))) throw new Error("Unexpected result field; put benchmark and page definitions in the catalog");
    if (!Array.isArray(benchmark.notes) || benchmark.notes.some(note => typeof note !== "string" || !note.trim())) throw new Error("Invalid result notes");
    for (const field of ["categoryTotals", "metricSamples", "sourceMatches", "otherBest"]) {
      if (benchmark[field] !== undefined && !record(benchmark[field])) throw new Error(`Invalid ${field} mapping`);
    }
    if (entry.benchmarkId !== benchmark.id || (benchmark.taskCount !== null && (!Number.isInteger(benchmark.taskCount) || benchmark.taskCount < 1))) {
      throw new Error("Unexpected benchmark or task count");
    }
    const definition = catalog.benchmarks.find(item => item.id === benchmark.id)?.definitions.find(item => item.id === benchmark.definitionId);
    if (!definition) throw new Error("Unknown benchmark or evaluation definition");
    if (benchmark.reportUrl != null && !httpsUrl(benchmark.reportUrl)) throw new Error("Invalid evaluation report URL");
    const categories = definition.categories ?? [];
    const totals = benchmark.categoryTotals ?? {};
    if (Object.keys(totals).length !== categories.length || categories.some(category => !Number.isInteger(totals[category.id]) || totals[category.id] < 0) || (categories.length && Object.values(totals).reduce((sum, value) => sum + value, 0) !== benchmark.taskCount)) throw new Error("Category totals must match the definition and task count");
    for (const [id, sample] of Object.entries(benchmark.metricSamples ?? {})) {
      if (!definition.metrics.some(metric => metric.id === id)) throw new Error("Unknown metric sample reference");
      if (sample.sampleCount !== undefined && (!Number.isInteger(sample.sampleCount) || sample.sampleCount < 0)) throw new Error("Invalid metric sample count");
      if (sample.scope !== undefined && typeof sample.scope !== "string") throw new Error("Invalid metric sample scope");
      if (sample.note !== undefined && (typeof sample.note !== "string" || !sample.note.trim() || !/[A-Za-z]/.test(sample.note) || /\p{Script=Han}/u.test(sample.note))) throw new Error("Invalid or non-English metric sample note");
    }
    uniqueIds(benchmark.providers, "provider");
    if (benchmark.sourceMatches !== undefined) {
      if (!benchmark.sourceMatches || Object.keys(benchmark.sourceMatches).length !== benchmark.providers.length) throw new Error("Invalid source match population");
      for (const provider of benchmark.providers) {
        const match = benchmark.sourceMatches[provider.id];
        const counts = match && [match.original, match.equivalent, match.replica, match.missing];
        if (!Array.isArray(counts) || counts.length !== 4 || counts.some(value => !Number.isInteger(value) || value < 0) || counts.reduce((a, b) => a + b, 0) !== benchmark.taskCount) throw new Error("Invalid source match population");
      }
    }
    for (const provider of benchmark.providers) {
      if (![provider.name, provider.description, provider.mode].every(value => typeof value === "string" && value.trim()) || !record(provider.scores)) throw new Error("Missing or invalid method configuration or scores");
      for (const field of ["counts", "confidenceIntervals", "categoryPassed"]) {
        if (provider[field] !== undefined && !record(provider[field])) throw new Error(`Invalid method ${field} mapping`);
      }
      if (!httpsUrl(catalog.providerUrls?.[provider.id])) throw new Error(`Missing or invalid provider project URL: ${provider.id}`);
      if ("color" in provider || "categories" in provider) throw new Error("Unexpected provider presentation field in result file");
      if (Object.keys(provider.scores).some(id => !definition.metrics.some(metric => metric.id === id))) throw new Error("Unknown metric score reference");
      for (const metric of definition.metrics) {
        const value = provider.scores[metric.id];
        const maximum = metricMaximum(metric);
        const minimum = metric.signed ? -maximum : 0;
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)) {
          throw new Error("Invalid or fabricated metric value");
        }
        if (metric.unit === "count" && value !== null && (benchmark.taskCount === null || !Number.isInteger(value) || value > benchmark.taskCount)) throw new Error("Invalid metric count");
      }
      for (const [id, detail] of Object.entries(provider.counts ?? {})) {
        const metric = definition.metrics.find(item => item.id === id);
        if (!metric || !["percent", "count"].includes(metric.unit) || !detail ||
          !Number.isInteger(detail.count) || !Number.isInteger(detail.total) || detail.count < 0 ||
          detail.total < 1 || detail.count > detail.total || benchmark.taskCount === null || detail.total > benchmark.taskCount) throw new Error("Invalid count breakdown");
        const value = metric.unit === "count" ? detail.count : Number((detail.count / detail.total * 100).toFixed(metric.decimals ?? 1));
        if (provider.scores[id] !== value || (benchmark.metricSamples?.[id]?.sampleCount != null && benchmark.metricSamples[id].sampleCount !== detail.total)) throw new Error("Inconsistent count breakdown");
      }
      for (const [id, interval] of Object.entries(provider.confidenceIntervals ?? {})) {
        const score = provider.scores[id];
        const metric = definition.metrics.find(item => item.id === id);
        const maximum = metricMaximum(metric);
        if (!metric || score == null || !interval || ![interval.lower, interval.upper, interval.level].every(Number.isFinite) ||
          interval.lower > score || interval.upper < score || (!metric.signed && interval.lower < 0) || interval.upper > maximum || interval.level <= 0 || interval.level >= 1) throw new Error("Invalid confidence interval");
      }
      if (provider.pricing !== undefined) {
        const pricing = provider.pricing;
        const disclosed = pricing && [pricing.min, pricing.max].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0);
        if (!pricing || ((pricing.min !== null || pricing.max !== null) && (!disclosed || pricing.min > pricing.max)) ||
          typeof pricing.description !== "string" || !pricing.description.trim() || /\p{Script=Han}/u.test(pricing.description) ||
          (pricing.approximate !== undefined && typeof pricing.approximate !== "boolean") ||
          (pricing.softwareCost !== undefined && (typeof pricing.softwareCost !== "number" || !Number.isFinite(pricing.softwareCost) || pricing.softwareCost < 0))) throw new Error("Invalid pricing range or description");
      }
      if (provider.passed !== null && (benchmark.taskCount === null || !Number.isInteger(provider.passed) || provider.passed < 0 || provider.passed > benchmark.taskCount)) {
        throw new Error("Invalid passed count");
      }
      for (const [id, value] of Object.entries(provider.categoryPassed ?? {})) {
        const category = categories.find(item => item.id === id);
        if (!category || !Number.isInteger(value) || value < 0 || value > totals[id]) throw new Error("Invalid category pass count");
      }
      if (categories.some(category => !Number.isInteger(provider.categoryPassed?.[category.id]))) throw new Error("Missing category pass count");
      if (categories.length && provider.passed !== null && categories.reduce((sum, category) => sum + provider.categoryPassed[category.id], 0) !== provider.passed) throw new Error("Category pass counts do not match the passed count");
    }
  }
}

export async function discoverResults(inputRoot, catalog) {
  const files = [];
  const ids = new Set();
  for (const directory of (await readdir(inputRoot)).filter(name => !name.startsWith(".")).sort()) {
    const folder = path.join(inputRoot, directory);
    const stat = await lstat(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Results must be stored in benchmark directories, without an index or symbolic links");
    if (!catalog.benchmarks.some(benchmark => benchmark.id === directory)) throw new Error(`Unknown benchmark directory: ${directory}`);
    for (const name of (await readdir(folder)).filter(name => !name.startsWith(".")).sort()) {
      const input = path.join(folder, name);
      const info = await lstat(input);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error("Result reports must be direct files, not nested directories or symbolic links");
      const entry = parseReportFile(directory, name);
      const report = JSON.parse(await readFile(input, "utf8"));
      validateSnapshot(report, entry, catalog);
      const identity = `${directory}-${canonicalVersion(report.version)}`;
      if (ids.has(identity)) throw new Error("Duplicate result id or equivalent version");
      ids.add(identity);
      files.push({ file: `${directory}/${name}`, report });
    }
  }
  return files;
}

export async function releaseFingerprint(files, sourceRoot = root) {
  const hash = createHash("sha256");
  async function add(relative) {
    hash.update(relative).update("\0").update(await readFile(path.join(sourceRoot, relative))).update("\0");
  }
  async function visit(relative) {
    for (const name of (await readdir(path.join(sourceRoot, relative))).sort()) {
      if (name === "release.generated.ts" || /\.test\./.test(name)) continue;
      if (relative === "web/public" && ["benchmarks", "results", "release.json"].includes(name)) continue;
      const child = path.join(relative, name);
      if ((await lstat(path.join(sourceRoot, child))).isDirectory()) await visit(child);
      else await add(child);
    }
  }
  for (const folder of ["web/app", "web/components", "web/lib", "web/public"]) await visit(folder);
  for (const file of ["benchmarks/catalog.json", "reports/metadata.json", "web/next.config.ts", "web/package.json", "package-lock.json"]) await add(file);
  for (const file of files) await add(`results/${file.file}`);
  return hash.digest("hex");
}

export async function prepareData({ write = true } = {}) {
  const catalogBytes = await readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes);
  validateCatalog(catalog);
  const files = await discoverResults(resultRoot, catalog);
  const release = await releaseFingerprint(files);
  if (write) {
    const builtAt = new Date().toISOString();
    await mkdir(path.join(root, "web/public"), { recursive: true });
    await writeFile(path.join(root, "web/public/release.json"), JSON.stringify({ release, builtAt }) + "\n");
    await writeFile(path.join(root, "web/lib/release.generated.ts"), `// Generated by prepare:data.\nexport const RELEASE = "${release}";\nexport const BUILT_AT = "${builtAt}";\n`);
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    await mkdir(path.join(root, "web/public/benchmarks"), { recursive: true });
    await writeFile(path.join(root, "web/public/benchmarks/catalog.json"), catalogBytes);
    await writeFile(path.join(outputRoot, "reports.json"), JSON.stringify(files) + "\n");
    for (const file of files) {
      const target = path.join(outputRoot, file.file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(resultRoot, file.file), target);
    }
  }
  return { files: files.length, benchmarks: new Set(files.flatMap(item => item.report.benchmarks.map(benchmark => benchmark.id))).size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await prepareData();
  console.log(`Prepared ${summary.files} result versions with ${summary.benchmarks} benchmark views.`);
}
