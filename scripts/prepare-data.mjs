import { readFile, mkdir, writeFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const resultRoot = path.join(root, "results");
const outputRoot = path.join(root, "web/public/results");

export function validateSnapshot(snapshot, entry) {
  if (snapshot.schemaVersion !== 1 || snapshot.id !== entry.id || snapshot.snapshotDate !== entry.date) {
    throw new Error("Snapshot identity or date does not match the index");
  }
  const source = new URL(snapshot.source.url);
  if (source.origin !== "https://yours.lexmount.cn" || !source.pathname.startsWith("/artifact-site/s/")) {
    throw new Error("Missing or unexpected source provenance");
  }
  if (snapshot.source.kind === "user-provided-image") {
    if (!/^[a-f0-9]{64}$/.test(snapshot.source.sha256 ?? "") || snapshot.source.versionId !== null) throw new Error("Invalid image source provenance");
  } else if (!snapshot.source.versionId) throw new Error("Missing source version");
  if (!Array.isArray(snapshot.benchmarks) || !snapshot.benchmarks.length) throw new Error("No benchmark results");
  if (snapshot.dateKind === "imported" && snapshot.measuredAt !== null) throw new Error("An import date must not be presented as a measurement date");
  for (const benchmark of snapshot.benchmarks) {
    if (!entry.benchmarks.some(item => item.id === benchmark.id) || !Number.isInteger(benchmark.taskCount) || benchmark.taskCount < 1) {
      throw new Error("Unexpected benchmark or task count");
    }
    if (benchmark.providers.length !== benchmark.providerCount) throw new Error("Provider count mismatch");
    const categories = benchmark.categories ?? null;
    if (categories) {
      if (new Set(categories.map(category => category.id)).size !== categories.length) throw new Error("Duplicate category id");
      if (categories.reduce((total, category) => total + category.total, 0) !== benchmark.taskCount) throw new Error("Category totals must match the task count");
    }
    for (const metric of benchmark.metrics) {
      if (!["percent", "score", "seconds", "usd", "ratio"].includes(metric.unit)) throw new Error("Invalid metric unit");
      if (metric.decimals !== undefined && (!Number.isInteger(metric.decimals) || metric.decimals < 0 || metric.decimals > 6)) {
        throw new Error("Invalid metric display precision");
      }
    }
    for (const provider of benchmark.providers) {
      for (const metric of benchmark.metrics) {
        const value = provider.scores[metric.id];
        const maximum = metric.unit === "ratio" ? 1 : ["percent", "score"].includes(metric.unit) ? 100 : Infinity;
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum)) {
          throw new Error("Invalid or fabricated metric value");
        }
      }
      if (provider.passed !== null && (!Number.isInteger(provider.passed) || provider.passed < 0 || provider.passed > benchmark.taskCount)) {
        throw new Error("Invalid passed count");
      }
      for (const [id, value] of Object.entries(provider.categoryPassed ?? {})) {
        const category = categories?.find(item => item.id === id);
        if (!category || !Number.isInteger(value) || value < 0 || value > category.total) throw new Error("Invalid category pass count");
      }
    }
  }
}

export async function prepareData({ write = true } = {}) {
  const indexBytes = await readFile(path.join(resultRoot, "index.json"));
  const index = JSON.parse(indexBytes);
  if (index.schemaVersion !== 1 || !Array.isArray(index.entries) || !index.entries.length) throw new Error("Invalid result index");
  let benchmarks = 0;
  const files = [];
  for (const entry of index.entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !/^[a-zA-Z0-9_/-]+\.json$/.test(entry.file) || entry.file.startsWith("/") || entry.file.split("/").includes("..")) {
      throw new Error("Unsafe result path or date");
    }
    const input = path.join(resultRoot, entry.file);
    for (let parent = input; parent !== resultRoot; parent = path.dirname(parent)) {
      if ((await lstat(parent)).isSymbolicLink()) throw new Error("Result paths must not be symbolic links");
    }
    const bytes = await readFile(input);
    const snapshot = JSON.parse(bytes);
    validateSnapshot(snapshot, entry);
    benchmarks += snapshot.benchmarks.length;
    files.push({ name: entry.file, bytes });
  }
  if (write) {
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, "index.json"), indexBytes);
    for (const file of files) {
      const target = path.join(outputRoot, file.name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.bytes);
    }
  }
  return { files: files.length, benchmarks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await prepareData();
  console.log(`Prepared ${summary.files} result snapshot with ${summary.benchmarks} benchmark views.`);
}
