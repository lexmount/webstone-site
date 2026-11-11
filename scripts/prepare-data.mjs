import { readFile, readdir, mkdir, writeFile, lstat, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalogPath = path.join(root, "benchmarks/catalog.json");
const resultRoot = path.join(root, "results");
const outputRoot = path.join(root, "web/public/results");

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

export function validateCatalog(catalog) {
  if (catalog.schemaVersion !== 1) throw new Error("Invalid benchmark catalog");
  uniqueIds(catalog.tracks, "track");
  uniqueIds(catalog.benchmarks, "benchmark");
  for (const benchmark of catalog.benchmarks) {
    if (!catalog.tracks.some(track => track.id === benchmark.trackId)) throw new Error("Unknown benchmark track");
    if (![benchmark.name, benchmark.description, benchmark.providerLabel].every(value => typeof value === "string" && value)) throw new Error("Missing benchmark information");
    if (![benchmark.datasetUrl, benchmark.reportUrl].every(httpsUrl)) throw new Error("Missing or invalid benchmark resource URL");
    if (benchmark.datasetUrl === benchmark.reportUrl) throw new Error("Dataset and report must have separate URLs");
    uniqueIds(benchmark.definitions, "definition");
    for (const definition of benchmark.definitions) {
      uniqueIds(definition.metrics, "metric");
      if (!definition.metrics.some(metric => metric.id === definition.primaryMetric)) throw new Error("Unknown primary metric");
      if (definition.leadingMetricIds && (new Set(definition.leadingMetricIds).size !== definition.leadingMetricIds.length || definition.leadingMetricIds.some(id => !definition.metrics.some(metric => metric.id === id)))) throw new Error("Unknown or duplicate leading metric");
      if (definition.categories) uniqueIds(definition.categories, "category");
      for (const metric of definition.metrics) {
        if (!["percent", "score", "seconds", "usd", "ratio", "ms", "mib", "points"].includes(metric.unit)) throw new Error("Invalid metric unit");
        if (!["asc", "desc"].includes(metric.direction)) throw new Error("Invalid metric direction");
        if (metric.signed !== undefined && typeof metric.signed !== "boolean") throw new Error("Invalid metric sign");
        if (metric.decimals !== undefined && (!Number.isInteger(metric.decimals) || metric.decimals < 0 || metric.decimals > 6)) throw new Error("Invalid metric display precision");
        if ("sampleCount" in metric || "scope" in metric) throw new Error("Metric samples belong in the daily result");
      }
    }
  }
}

export function parseReportFile(benchmarkId, name) {
  const match = /^([a-z0-9-]+)-(\d{4})(\d{2})(\d{2})-report\.json$/.exec(name);
  if (!match || match[1] !== benchmarkId) throw new Error("Expected <benchmark>-YYYYMMDD-report.json directly inside its benchmark directory");
  const date = `${match[2]}-${match[3]}-${match[4]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid result filename date");
  return { date, benchmarkId };
}

export function validateSnapshot(snapshot, entry, catalog) {
  if ("schemaVersion" in snapshot || "version" in snapshot) throw new Error("Daily results must not contain a format version");
  if (typeof snapshot.id !== "string" || !snapshot.id || snapshot.snapshotDate !== entry.date) throw new Error("Result identity or date does not match its filename");
  if (snapshot.source.kind === "user-provided-text") {
    if (!snapshot.source.method || !snapshot.source.scope) throw new Error("Missing user-provided text provenance");
  } else {
    const source = new URL(snapshot.source.url);
    if (source.origin !== "https://yours.lexmount.cn" || !source.pathname.startsWith("/artifact-site/s/")) {
      throw new Error("Missing or unexpected source provenance");
    }
    if (snapshot.source.kind === "user-provided-image") {
      if (!/^[a-f0-9]{64}$/.test(snapshot.source.sha256 ?? "")) throw new Error("Invalid image source provenance");
    }
  }
  if (!Array.isArray(snapshot.benchmarks) || snapshot.benchmarks.length !== 1) throw new Error("Each daily report must contain exactly one benchmark");
  for (const benchmark of snapshot.benchmarks) {
    const allowed = ["id", "definitionId", "taskCount", "categoryTotals", "metricSamples", "otherBest", "notes", "reportUrl", "providers"];
    if (Object.keys(benchmark).some(key => !allowed.includes(key))) throw new Error("Unexpected daily result field; put benchmark and page definitions in the catalog");
    if (entry.benchmarkId !== benchmark.id || !Number.isInteger(benchmark.taskCount) || benchmark.taskCount < 1) {
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
    }
    uniqueIds(benchmark.providers, "provider");
    for (const provider of benchmark.providers) {
      if ("color" in provider || "categories" in provider) throw new Error("Unexpected provider presentation field in daily result");
      if (Object.keys(provider.scores).some(id => !definition.metrics.some(metric => metric.id === id))) throw new Error("Unknown metric score reference");
      for (const metric of definition.metrics) {
        const value = provider.scores[metric.id];
        const maximum = metric.unit === "ratio" ? 1 : ["percent", "score", "points"].includes(metric.unit) ? 100 : Infinity;
        const minimum = metric.signed ? -maximum : 0;
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)) {
          throw new Error("Invalid or fabricated metric value");
        }
      }
      if (provider.passed !== null && (!Number.isInteger(provider.passed) || provider.passed < 0 || provider.passed > benchmark.taskCount)) {
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
      if (info.isSymbolicLink() || !info.isFile()) throw new Error("Daily reports must be direct files, not nested directories or symbolic links");
      const entry = parseReportFile(directory, name);
      const report = JSON.parse(await readFile(input, "utf8"));
      validateSnapshot(report, entry, catalog);
      if (ids.has(report.id)) throw new Error("Duplicate result id");
      ids.add(report.id);
      files.push({ file: `${directory}/${name}`, report });
    }
  }
  return files;
}

export async function prepareData({ write = true } = {}) {
  const catalogBytes = await readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes);
  validateCatalog(catalog);
  const files = await discoverResults(resultRoot, catalog);
  if (write) {
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
  return { files: files.length, benchmarks: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await prepareData();
  console.log(`Prepared ${summary.files} result snapshot with ${summary.benchmarks} benchmark views.`);
}
