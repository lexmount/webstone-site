import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { Window } from "happy-dom";

const require = createRequire(import.meta.url);
for (const extension of [".ts", ".tsx"]) require.extensions[extension] = (module, file) => {
  module._compile(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file);
};
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Insights = require("../web/components/insights.tsx").default;
const { translator } = require("../web/lib/i18n.ts");
const { radarAxes } = require("../web/lib/radar.ts");
const { evaluationReports, trackOverview } = require("../web/lib/overview.ts");
const { resolveBenchmark } = require("../web/lib/results.ts");
const { evaluationScopeCopy } = require("../web/lib/result-copy.ts");
const catalog = JSON.parse(readFileSync(new URL("../benchmarks/catalog.json", import.meta.url)));

function load(id, version = "v1") {
  const snapshot = JSON.parse(readFileSync(new URL(`../results/${id}/${id}-${version}-report.json`, import.meta.url)));
  return { snapshot, benchmark: resolveBenchmark(catalog, snapshot.benchmarks[0]) };
}

function applyTableStyles(win) {
  const style = win.document.createElement('style');
  style.textContent = readFileSync(new URL('../web/app/globals.css', import.meta.url), 'utf8');
  win.document.head.append(style);
}

function checkTableStyles(win, table, label) {
  const sorted = table.querySelector('th.sorted');
  assert.equal(win.getComputedStyle(sorted).backgroundColor, '#eaf4ee', `${label}: sorted header background`);
  for (const cell of table.querySelectorAll('td.best-value')) {
    assert.equal(win.getComputedStyle(cell).backgroundColor, '#eef8f1', `${label}: winner background`);
    assert.ok(cell.querySelector('.sr-only'), `${label}: accessible winner`);
  }
  for (const cell of table.querySelectorAll('.numeric, th[aria-sort]')) {
    assert.notEqual(win.getComputedStyle(cell).position, 'sticky', `${label}: numeric columns scroll`);
  }
  const method = table.querySelector('tbody tr > td:not(.rank-cell)');
  if (method) assert.equal(win.getComputedStyle(method).position, 'sticky', `${label}: method stays visible`);
}

const component = (benchmark, t = text => text) => React.createElement(Insights, { benchmark, t });
const render = (benchmark, t) => renderToStaticMarkup(component(benchmark, t));

test("Web Fetch compares overall quality and timings without adding a second table", () => {
  const { snapshot, benchmark } = load("lexbench-webfetch");
  const html = render(benchmark, translator("zh", catalog, snapshot));
  assert.match(html, /role="img" aria-label="能力对比"/);
  assert.deepEqual(radarAxes(benchmark).filter(axis => axis.defaultSelected).map(axis => axis.id), ["passRate", "requestRate", "totalMean"]);
  assert.equal(radarAxes(benchmark).filter(axis => axis.id.startsWith("category:")).length, 7);
  assert.equal((html.match(/class="radar-shape"/g) ?? []).length, 6);
  assert.doesNotMatch(html, /<table|<select|disabled/);
});

test("published bench views draw meaningful profiles and retain methods with missing values", async () => {
  const { discoverResults } = await import("../scripts/prepare-data.mjs");
  const { fileURLToPath } = await import("node:url");
  const files = await discoverResults(fileURLToPath(new URL("../results", import.meta.url)), catalog);
  for (const { file } of files) {
    const snapshot = JSON.parse(readFileSync(new URL(`../results/${file}`, import.meta.url)));
    const benchmark = resolveBenchmark(catalog, snapshot.benchmarks[0]);
    const html = render(benchmark);
    assert.doesNotMatch(html, /NaN|Infinity/, file);
    if (radarAxes(benchmark).filter(axis => axis.defaultSelected).length < 3) {
      const win = new Window();
      try {
        win.document.body.innerHTML = html;
        const sections = [...win.document.querySelectorAll('.quality-comparison section')];
        const qualityIds = new Set(benchmark.metrics.filter(metric=>['ratio','percent','score'].includes(metric.unit) && !metric.signed && metric.direction==='desc').map(metric=>metric.id));
        const expectedAxes = radarAxes(benchmark).filter(axis=>axis.defaultSelected && (qualityIds.has(axis.id) || axis.id.startsWith('category:')));
        assert.equal(sections.length, expectedAxes.length, file);
        assert.deepEqual(sections.map(section=>section.querySelector('h3').textContent),expectedAxes.map(axis=>axis.label),file);
        for (const section of sections) {
          const methods = [...section.querySelectorAll('.quality-series > span')].map(node=>node.textContent).sort();
          assert.equal(methods.length, benchmark.providers.length, file);
          assert.deepEqual(methods, benchmark.providers.map(provider=>provider.name).sort(), file);
        }
      } finally { await win.happyDOM.close(); }
      continue;
    }
    assert.match(html, /aria-label="Capability profile"/, file);
    assert.equal((html.match(/class="radar-series"/g) ?? []).length, benchmark.providers.length, file);
    assert.ok(radarAxes(benchmark).length >= 3, file);
    assert.doesNotMatch(html, /NaN|Infinity/, file);
  }

  const { benchmark } = load("webmainbench");
  const [first, ...otherProviders] = benchmark.providers;
  const report = { ...benchmark, providers: [
    { ...first, scores: { ...first.scores, [benchmark.primaryMetric]: null } },
    ...otherProviders,
  ] };
  const incomplete = render(report);
  assert.match(incomplete, /class="radar-label"[^>]*><tspan[^>]*>Formulas/);
  assert.equal((incomplete.match(/class="radar-series"/g) ?? []).length, benchmark.providers.length);
  assert.equal((incomplete.match(/class="radar-shape"/g) ?? []).length, benchmark.providers.length - 1);
});

test("radars include latency and memory while keeping quoted prices out of capability comparisons", () => {
  const { benchmark: headless } = load("lexbench-headless-372");
  assert.deepEqual(radarAxes(headless).map(axis => axis.id), ["successRate", "latency", "pss"]);
  for (const benchmark of [load("lexbench-websearch", "v2").benchmark,
    load("lexbench-swde").benchmark, load("lexbench-zyte-product-extraction").benchmark]) {
    const axes = radarAxes(benchmark);
    const timing=benchmark.metrics.find(metric => metric.id === "meanTime");
    assert.equal(axes.some(axis => axis.id === "meanTime"), timing?.comparisonMode !== 'reported' && timing?.highlightBest !== false);
    assert.ok(!axes.some(axis => ["pricePerThousand", "quoted-price"].includes(axis.id)));
    assert.equal((render(benchmark).match(/class="radar-series"/g) ?? []).length, benchmark.providers.length);
  }
  const { benchmark: search } = load("lexbench-websearch", "v2");
  const measured = { ...search, metrics: [...search.metrics, { id: "totalCost", label: "Measured cost", unit: "usd", direction: "asc" }],
    providers: search.providers.map((provider, i) => ({ ...provider, scores: { ...provider.scores, totalCost: i + 1 } })) };
  assert.ok(radarAxes(measured).some(axis => axis.id === "totalCost"));
});

test("the home overview counts search layers as views and shares articles with their benchmark pages", async () => {
  const { discoverResults } = await import("../scripts/prepare-data.mjs");
  const { fileURLToPath } = await import("node:url");
  const reports = await discoverResults(fileURLToPath(new URL("../results", import.meta.url)), catalog);
  const snapshots = reports.map(({ file }) => JSON.parse(readFileSync(new URL(`../results/${file}`, import.meta.url))));
  const tracks = trackOverview(catalog);
  assert.equal(tracks.length, 5);
  assert.equal(tracks.flatMap(track => track.benchmarks).length, 12);
  assert.equal(tracks.flatMap(track => track.views).length, 16);
  const articles = evaluationReports(catalog, snapshots);
  assert.ok(articles.every((article, i) => i === 0 || article.date <= articles[i - 1].date));
  assert.equal(new Set(articles.map(article => article.href)).size, articles.length);
  assert.ok(articles.some(article => article.date === "2026-11-10"));
  assert.equal(articles.at(-1).date, "2026-09-20");
  assert.ok(articles.every(report => Number.isFinite(Date.parse(report.publishedAt))));
  assert.deepEqual(tracks.map(track => track.id), ["websearch", "webextract", "webfetch", "trajectory-replay", "browser-use"]);
  assert.deepEqual(tracks.find(track => track.id === "trajectory-replay").benchmarks.map(bench => bench.id),
    ["webarena-verified", "lexbench-headless-372"]);
  assert.deepEqual(tracks.find(track => track.id === "browser-use").benchmarks.map(bench => bench.id),
    ["bu-bench-v1", "online-mind2web", "webvoyager", "osworld"]);
  const publishedBenchmarks = new Set(snapshots.flatMap(snapshot => snapshot.benchmarks.map(bench => bench.id)));
  for (const view of catalog.benchmarks) {
    if (!publishedBenchmarks.has(view.id)) continue;
    const related = evaluationReports(catalog, snapshots, view);
    assert.ok(related.length, view.id);
    assert.ok(related.every(article => article.benchmarks.some(bench => bench.id === view.id ||
      (view.searchGroup && bench.trackId === view.trackId && bench.searchGroup === view.searchGroup))), view.id);
  }
});

test("the radar starts with all series and lets readers hide or show each one", async () => {
  const { benchmark } = load("lexbench-webfetch");
  const win = new Window();
  const previous = [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
  const container = win.document.createElement("div");
  win.document.body.append(container);
  const root = require("react-dom/client").createRoot(container);

  try {
    await React.act(async () => root.render(component(benchmark)));
    const filters = [...container.querySelectorAll(".radar-legend input")];
    assert.equal(filters.length, 6);
    assert.ok(filters.every(filter => filter.checked && !filter.disabled));
    for (const filter of filters) await React.act(async () => filter.click());
    assert.equal(container.querySelectorAll(".radar-shape").length, 0);
    assert.match(container.textContent, /Select a method to show its results/);
    for (const filter of filters.slice(0, 5)) await React.act(async () => filter.click());
    assert.equal(container.querySelectorAll(".radar-shape").length, 5);
    const metricOptions = [...container.querySelectorAll(".metric-selector-panel label")];
    const median = metricOptions.find(option => option.textContent === "P50 latency").querySelector("input");
    await React.act(async () => median.click());
    assert.equal(container.querySelectorAll(".radar-axis").length, 4);
    const reset = container.querySelector(".metric-selector-panel button");
    await React.act(async () => reset.click());
    assert.equal(container.querySelectorAll(".radar-axis").length, 3);
    assert.equal(container.querySelectorAll(".radar-shape").length, 5);
  } finally {
    await React.act(async () => root.unmount());
    await win.happyDOM.close();
    [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = previous;
  }
});

test("published evaluation scopes have concise Chinese and English population copy", async () => {
  const { discoverResults } = await import("../scripts/prepare-data.mjs");
  const { fileURLToPath } = await import("node:url");
  const files = await discoverResults(fileURLToPath(new URL("../results", import.meta.url)), catalog);
  for (const { file } of files) {
    const snapshot = JSON.parse(readFileSync(new URL(`../results/${file}`, import.meta.url)));
    for (const language of ["en", "zh"]) {
      const copy = evaluationScopeCopy(snapshot.id, language);
      if (snapshot.benchmarks[0].taskCount !== null) assert.ok(copy?.trim(), file);
      if (copy) assert.doesNotMatch(copy, /reviewed|unverified|unconfirmed|certified|PR919|Different test conditions/i, file);
    }
  }
});

test("report pagination exposes the complete archive without duplicates or skipped entries", {timeout:10000}, async (t) => {
  const overview = require("../web/lib/overview.ts");
  const { snapshot } = load("lexbench-swde");
  const template = overview.evaluationReports(catalog, [snapshot])[0];
  const reports = Array.from({ length: 15 }, (_, index) => ({ ...template, source: `report-${index}`, title: `Report ${index + 1}` }));
  t.mock.method(overview, "evaluationReports", () => reports);
  const { EvaluationReports } = require("../web/components/home.tsx");
  const win = new Window();
  const previous = [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
  const container = win.document.createElement("div");
  win.document.body.append(container);
  const root = require("react-dom/client").createRoot(container);
  try {
    await React.act(async () => root.render(React.createElement(EvaluationReports, { catalog, snapshots: [], t: text => text })));
    const buttons = () => [...container.querySelectorAll(".report-pagination button")];
    const titles = () => [...container.querySelectorAll("h3")].map(el => el.textContent);
    const first=titles();
    assert.ok(buttons()[0].disabled);
    const seen=[...first];
    for(let step=0;step<reports.length&&!buttons()[1].disabled;step++){
      const before=titles();
      await React.act(async()=>buttons()[1].click());
      assert.notDeepEqual(titles(),before,'Next advances the report page');
      seen.push(...titles());
    }
    assert.ok(buttons()[1].disabled,'Next terminates at the archive end');
    assert.equal(seen.length,15);
    assert.equal(new Set(seen).size,15);
    reports.forEach((report,index)=>assert.ok(seen[index].startsWith(report.title)));
    for(let step=0;step<reports.length&&!buttons()[0].disabled;step++){
      const before=titles();
      await React.act(async()=>buttons()[0].click());
      assert.notDeepEqual(titles(),before,'Previous moves to the preceding page');
    }
    assert.ok(buttons()[0].disabled,'Previous terminates at the archive start');
    assert.deepEqual(titles(),first);
  } finally {
    await React.act(async () => root.unmount());
    await win.happyDOM.close();
    [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = previous;
  }
});

test("the homepage directs evaluation and result submission to their own repositories and skills", async () => {
  const Home = require("../web/components/home.tsx").default;
  const { EVALUATION_URL, EVALUATION_SKILL, SUBMISSION_URL, SUBMISSION_SKILL } = require("../web/lib/overview.ts");
  const win = new Window();
  try {
    win.document.body.innerHTML = renderToStaticMarkup(React.createElement(Home, { catalog, snapshots: [], t: text => text }));
    const evaluation = win.document.querySelector("#run-evaluation");
    const submission = win.document.querySelector("#submit-results");
    assert.equal(evaluation.querySelector("a").getAttribute("href"), EVALUATION_URL);
    assert.equal(submission.querySelector("a").getAttribute("href"), SUBMISSION_URL);
    assert.equal(evaluation.querySelector("#evaluation-prompt"), null);
    assert.equal(submission.querySelector("#submission-prompt"), null);
    const cards = win.document.querySelector(".getting-started");
    assert.equal(cards.children.length, 3);
    assert.ok(cards.compareDocumentPosition(win.document.querySelector(".track-overview")) & win.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(cards.querySelector(".dataset-action").getAttribute("href"), "https://huggingface.co/datasets?author=Lexmount");
    assert.equal(evaluation.querySelectorAll("button").length, 1);
    assert.equal(submission.querySelectorAll("button").length, 1);
  } finally {
    await win.happyDOM.close();
  }
});

test("the dashboard exposes two repository guides and preserves each pricing value in its own cell", async () => {
  const { prepareData } = await import("../scripts/prepare-data.mjs");
  await prepareData();
  const Dashboard = require("../web/components/dashboard.tsx").default;
  const { EVALUATION_URL, SUBMISSION_URL, FEEDBACK_URL } = require("../web/lib/overview.ts");
  const { formatPricing } = require("../web/lib/results.ts");
  const { RELEASE } = require("../web/lib/release.generated.ts");
  const { snapshot, benchmark } = load("lexbench-swde");
  const win = new Window({ url: "https://webstone.test/?benchmark=lexbench-swde" });
  const previous = [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
  globalThis.fetch = async input => {
    const url = String(input);
    let data = { release: RELEASE };
    if (url.includes("/benchmarks/catalog.json")) data = catalog;
    if (url.includes("/results/reports.json")) data = [{ file: "lexbench-swde/lexbench-swde-v1-report.json", report: snapshot }];
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  };
  const container = win.document.createElement("div");
  win.document.body.append(container);
  const root = require("react-dom/client").createRoot(container);
  try {
    await React.act(async () => root.render(React.createElement(Dashboard)));
    const links = [...container.querySelectorAll(".sidebar-guides a")];
    assert.deepEqual(links.map(link => link.getAttribute("href")), [EVALUATION_URL, SUBMISSION_URL, FEEDBACK_URL, "https://huggingface.co/datasets?author=Lexmount"]);
    assert.ok(links.every(link => link.querySelector("svg") && link.textContent.trim()));
    assert.equal(container.querySelectorAll(".sidebar-footer > a").length, 0);
    assert.equal(container.querySelector(".brand img").getAttribute("src"), "/brand/webstone.png");
    const groups = [...container.querySelectorAll(".grouped-navigation > .nav-group")];
    assert.deepEqual(groups.map(group => group.querySelector("h2").textContent), ["Web Tools", "Browser Capabilities", "Browser Automation"]);
    assert.deepEqual(groups.map(group => group.querySelectorAll(".nav-track").length), [2, 2, 1]);
    assert.deepEqual(groups.map(group => group.querySelectorAll(".nav-upcoming").length), [1, 0, 0]);
    assert.equal(container.querySelectorAll(".grouped-navigation details").length, 0);
    assert.equal(container.querySelectorAll(".nav-upcoming a, .nav-upcoming button").length, 0);
    const rows = [...container.querySelectorAll("tbody tr")];
    assert.equal(rows.length, benchmark.providers.length);
    for (const row of rows) {
      const providerLink = row.querySelector(".provider-link");
      const provider = benchmark.providers.find(item => providerLink.getAttribute("aria-label").startsWith(item.name + " "));
      const pricing = row.querySelector(".pricing-cell");
      assert.ok(pricing);
      if (provider.pricing) assert.equal(pricing.querySelector(".pricing-value")?.textContent, formatPricing(provider.pricing));
    }
    assert.ok(![...container.querySelectorAll(".radar-label")].some(label => /Price|cost/i.test(label.textContent)));
  } finally {
    await React.act(async () => root.unmount());
    await win.happyDOM.close();
    [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT] = previous;
  }
});

test("every published benchmark edition shares table and radar controls in both languages", async () => {
  const { prepareData, discoverResults } = await import("../scripts/prepare-data.mjs");
  const { fileURLToPath } = await import("node:url");
  await prepareData();
  const Dashboard = require("../web/components/dashboard.tsx").default;
  const { RELEASE } = require("../web/lib/release.generated.ts");
  const files = await discoverResults(fileURLToPath(new URL("../results", import.meta.url)), catalog);
  const reports = files.map(({ file }) => ({ file, report: JSON.parse(readFileSync(new URL("../results/" + file, import.meta.url))) }));
  for (const item of reports) item.report.benchmarks[0].notes.push('Internal uploader note for review.');
  const previous = [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT];

  try {
    for (const { report } of reports) {
      const id = report.benchmarks[0].id;
      const win = new Window({ url: "https://webstone.test/?benchmark=" + id + "&version=" + report.version });
      [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
      globalThis.fetch = async input => {
        const path = String(input);
        let data = { release: RELEASE };
        if (path.includes("/benchmarks/catalog.json")) data = catalog;
        if (path.includes("/results/reports.json")) data = reports;
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
      };
      const container = win.document.createElement("div");
      win.document.body.append(container);
      const root = require("react-dom/client").createRoot(container);
      try {
        await React.act(async () => root.render(React.createElement(Dashboard)));
        const table = container.querySelector("table");
        assert.equal(table.className, "wide-table", report.id);
        assert.doesNotMatch(container.textContent, /Different test conditions|Internal uploader note/, report.id);
        const scope = container.querySelector('.table-summary .info-trigger');
        if (scope) {
          await React.act(async () => scope.click());
          assert.doesNotMatch(win.document.querySelector('.info-tooltip').textContent, /Internal uploader note|reviewed|unverified|unconfirmed|certified product ranking/i, report.id);
          await React.act(async () => win.document.dispatchEvent(new win.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
        }
        const hasProfile = radarAxes(resolveBenchmark(catalog, report.benchmarks[0])).length > 0;
        assert.equal(container.querySelectorAll(".metric-selector").length, Number(hasProfile), report.id);
        assert.equal(table.querySelector("th.method-cell").textContent, "Method", report.id);
        assert.ok(container.querySelector("#reports"), report.id);
        for (const row of table.querySelectorAll("tbody tr")) assert.equal(row.children.length, table.querySelectorAll("th").length, report.id);

        const more = [...container.querySelectorAll(".table-controls button")].find(button => button.textContent === "More metrics");
        const definition = resolveBenchmark(catalog, report.benchmarks[0]);
        const { decisionMetrics } = require("../web/lib/comparisons.ts");
        const disclosed = decisionMetrics(definition, true, definition.primaryMetric);
        const extras = disclosed.length > decisionMetrics(definition, false, definition.primaryMetric).length;
        if (definition.categories.length) {
          const categoryButton = [...container.querySelectorAll(".table-controls button")].find(button => button.textContent === "Category breakdown");
          assert.equal(categoryButton.getAttribute("aria-pressed"), "true", report.id);
          assert.equal(table.querySelectorAll(".category-head").length, definition.categories.length, report.id);
        }
        assert.equal(Boolean(more), extras, report.id + " extra metric control");
        if (extras) {
          const initialColumns = table.querySelectorAll("th").length;
          await React.act(async () => more.click());
          assert.ok(table.querySelectorAll("th").length > initialColumns, report.id);
          const extra = disclosed.find(item => !decisionMetrics(definition, false, definition.primaryMetric).some(metric => metric.id === item.id));
          const extraHeader = [...table.querySelectorAll("th")].find(header => header.querySelector(".sort-button")?.textContent === extra.label);
          await React.act(async () => extraHeader.querySelector(".sort-button").click());
          const collapse = [...container.querySelectorAll(".table-controls button")].find(button => button.textContent === "Key metrics");
          assert.ok(collapse, report.id + " can collapse after sorting an extra column");
          await React.act(async () => collapse.click());
          assert.equal(table.querySelectorAll("th").length, initialColumns, report.id);
        }
        assert.equal(container.querySelector('a[href="https://huggingface.co/datasets?author=Lexmount"]')?.textContent, "Datasets", report.id);
        const chartMenu = container.querySelector(".radar-heading .metric-selector");
        if (chartMenu) {
        const initialAxes = container.querySelectorAll(".radar-axis").length;
        const checkedMetrics = () => [...chartMenu.querySelectorAll("input")].filter(input=>input.checked).map(input=>input.parentElement.textContent);
        const initialChecked = checkedMetrics();
        const initialSections = container.querySelectorAll(".quality-comparison section").length;
        const initialSeries = container.querySelectorAll(".quality-series").length;
        assert.ok(initialAxes >= 3 || container.querySelector(".quality-comparison"), report.id);
        for (const input of [...chartMenu.querySelectorAll("input")].filter(input => input.checked)) {
          await React.act(async () => input.click());
        }
        assert.equal(container.querySelectorAll(".radar-axis").length, 0, report.id);
        assert.match(container.querySelector(".chart-empty").textContent, /at least one/, report.id);
        await React.act(async () => chartMenu.querySelector("button").click());
        assert.equal(container.querySelectorAll(".radar-axis").length, initialAxes, report.id);
        assert.deepEqual(checkedMetrics(), initialChecked, report.id);
        assert.ok(!container.querySelector(".chart-empty"), report.id);
        assert.equal(container.querySelectorAll(".quality-comparison section").length, initialSections, report.id);
        assert.equal(container.querySelectorAll(".quality-series").length, initialSeries, report.id);

        const summary = chartMenu.querySelector("summary");
        chartMenu.open = true;
        await React.act(async () => container.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true })));
        assert.ok(!chartMenu.open, report.id);
        chartMenu.open = true;
        await React.act(async () => summary.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        assert.ok(!chartMenu.open, report.id);

        }
        await React.act(async () => [...container.querySelectorAll(".language-control button")].find(button => button.textContent === "中文").click());
        assert.equal(table.querySelector("th.method-cell").textContent, "方案", report.id);
        if (chartMenu) assert.match(chartMenu.querySelector("summary").textContent, /图表指标/, report.id);
        assert.equal(container.querySelectorAll(".table-controls .metric-selector").length, 0, report.id);
        let scrollTop = 900;
        win.scrollTo = options => { scrollTop = options.top; };
        const nextTab = [...container.querySelectorAll('.benchmark-navigation button')].find(button => button.getAttribute('aria-current') !== 'page');
        if (nextTab) {
          await React.act(async () => nextTab.click());
          assert.equal(scrollTop, 0, report.id + ' switching benchmark resets scrolling');
        }
        scrollTop = 900;
        await React.act(async () => container.querySelector('.nav-item.active').click());
        assert.equal(scrollTop, 0, report.id + ' reopening the active track resets scrolling');
        const categories = container.querySelectorAll('.category-head');
        const toggle = [...container.querySelectorAll('.table-controls button')].find(button => /Category breakdown|分类明细/.test(button.textContent));
        if (toggle) assert.ok(categories.length > 0, report.id + ' categories start expanded after navigation');
      } finally {
        await React.act(async () => root.unmount());
        await win.happyDOM.close();
      }
    }
  } finally {
    [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT] = previous;
  }
});


test("profiles with only two disclosed quality metrics include all available categories by default", () => {
  const { benchmark } = load("lexbench-webfetch");
  for (const provider of benchmark.providers) for (const id of ["totalMean", "totalP50", "totalP95"]) provider.scores[id] = null;
  const axes = radarAxes(benchmark);
  assert.ok(axes.filter(axis => axis.defaultSelected).length >= 3);
  const eligible = benchmark.categories.filter(category => category.total > 0 && benchmark.providers.some(provider => provider.categoryPassed?.[category.id] !== null && provider.categoryPassed?.[category.id] !== undefined)).map(category => "category:" + category.id).sort();
  const categories = axes.filter(axis => axis.id.startsWith("category:"));
  assert.deepEqual(categories.map(axis => axis.id).sort(), eligible);
  assert.ok(categories.every(axis => axis.defaultSelected));
  assert.ok(!axes.some(axis => axis.id === "totalMean"));
});

test("homepage copy actions copy the correct skill without displaying long prompts", async () => {
  const Home=require('../web/components/home.tsx').default;
  const {EVALUATION_SKILL,SUBMISSION_SKILL}=require('../web/lib/overview.ts');
  const win=new Window(); const copied=[];
  const prior=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT,Object.getOwnPropertyDescriptor(globalThis,'navigator')];
  [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>copied.push(value)}}});
  const root=require('react-dom/client').createRoot(win.document.body);
  try {
    await React.act(async()=>root.render(React.createElement(Home,{catalog,snapshots:[],t:text=>text})));
    assert.equal(win.document.querySelectorAll('textarea').length,0);
    for (const id of ['run-evaluation','submit-results']) await React.act(async()=>win.document.querySelector('#'+id+' button').click());
    assert.ok(copied[0].includes(EVALUATION_SKILL)); assert.ok(copied[1].includes(SUBMISSION_SKILL));
    assert.ok(!win.document.body.textContent.includes(EVALUATION_SKILL));
    assert.equal(win.document.querySelectorAll('textarea').length,0);
  } finally {
    await React.act(async()=>root.unmount());await win.happyDOM.close();
    [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=prior;
    if(prior[3])Object.defineProperty(globalThis,'navigator',prior[3]);else delete globalThis.navigator;
  }
});

test("report links select distinct published language editions and identify a missing translation", () => {
  const {reportDestination}=require('../web/lib/overview.ts');
  const urls={en:'https://reports.example.org/english',zh:'https://reports.example.org/chinese'};
  assert.deepEqual(reportDestination({urls,originalLanguage:'zh'},urls.zh,'en'),{href:urls.en,language:'en'});
  assert.deepEqual(reportDestination({urls,originalLanguage:'zh'},urls.zh,'zh'),{href:urls.zh,language:'zh'});
  assert.deepEqual(reportDestination({urls:{zh:urls.zh},originalLanguage:'zh'},urls.zh,'en'),{href:urls.zh,language:'zh'});
  assert.deepEqual(reportDestination({},urls.zh,'en'),{href:urls.zh,language:undefined});
  assert.deepEqual(reportDestination({originalLanguage:'ja'},urls.zh,'en'),{href:urls.zh,language:undefined});
});

test("compact columns preserve ranking and disclosed resources without inventing missing measurements", () => {
  const {decisionMetrics}=require('../web/lib/comparisons.ts');
  const metric=(id,unit)=>({id,unit});
  const benchmark={primaryMetric:"quality",keyMetricIds:["quality","time"],leadingMetricIds:["leading"],metrics:[metric("quality","ratio"),metric("time","ms"),metric("other","ratio"),metric("leading","ratio")],providers:[{scores:{quality:1,time:null,other:0.5,leading:null}}]};
  const ids=(expanded=false,selected="quality")=>decisionMetrics(benchmark,expanded,selected).map(item=>item.id);
  assert.deepEqual(ids(),["quality"]);
  benchmark.providers[0].scores.time=0;assert.deepEqual(ids(),["quality","time"]);
  benchmark.providers[0].scores.time=10;assert.deepEqual(ids(),["quality","time"]);
  benchmark.providers[0].scores.time=null;assert.deepEqual(ids(false,"other"),["quality","other"]);
  assert.deepEqual(ids(true),["quality","other"]);
});

test("repeated denied clipboard attempts focus and select the manual prompt each time", async () => {
  const Home=require('../web/components/home.tsx').default;
  const win=new Window();const prior=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT,Object.getOwnPropertyDescriptor(globalThis,'navigator')];
  [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw Error("Denied");}}}});
  const root=require('react-dom/client').createRoot(win.document.body);
  try {
    await React.act(async()=>root.render(React.createElement(Home,{catalog,snapshots:[],t:text=>text})));
    const button=win.document.querySelector('#run-evaluation button');
    for(let attempt=0;attempt<2;attempt++) {
      button.focus();await React.act(async()=>button.click());
      const field=win.document.querySelector('#evaluation-prompt');
      assert.equal(win.document.activeElement,field);assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,field.value.length);
    }
  } finally {
    await React.act(async()=>root.unmount());await win.happyDOM.close();
    [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=prior;
    if(prior[3])Object.defineProperty(globalThis,'navigator',prior[3]);else delete globalThis.navigator;
  }
});


test("release verification rejects relaxed or stale script policies", async () => {
  const {inlineScriptHashes,assertScriptPolicy}=await import('../scripts/secure-export.mjs');
  const html='<script>window.ready=true</script>';
  const expected="script-src 'self' "+inlineScriptHashes(html).join(" ")+"; frame-ancestors 'none'";
  assert.doesNotThrow(()=>assertScriptPolicy(expected,expected,html));
  for(const policy of [expected.replace(";", " https://untrusted.example;"),expected+"; script-src-elem * 'unsafe-inline'",expected+"; SCRIPT-SRC-ELEM * 'unsafe-inline'",expected+"; script-src-attr 'unsafe-inline'",expected.replace(inlineScriptHashes(html)[0],inlineScriptHashes('<script>other()</script>')[0]),expected+"; script-src *"])
    assert.throws(()=>assertScriptPolicy(policy,expected,html));
});


test("inline script hashes use HTML attributes and browser script text", async () => {
  const {inlineScriptHashes}=await import('../scripts/secure-export.mjs');
  const expected=["'sha256-"+createHash('sha256').update('run()').digest('base64')+"'"];
  assert.deepEqual(inlineScriptHashes('<script>run()</script>'),expected);
  assert.deepEqual(inlineScriptHashes('<script data-src="example">run()</script>'),expected);
  assert.deepEqual(inlineScriptHashes('<script data-label="a > b">run()</script>'),expected);
  assert.deepEqual(inlineScriptHashes('<script SRC="/external.js">run()</script>'),[]);
  assert.deepEqual(inlineScriptHashes('<script>run()\r\n</script>'),inlineScriptHashes('<script>run()\n</script>'));
});


test("navigation groups separate browser retrieval from web APIs without counting planned tracks", () => {
  const {navigationGroups}=require('../web/lib/overview.ts');
  const groups=navigationGroups(catalog);
  assert.deepEqual(groups.map(group=>group.id),["web-tools","browsers","browser-automation"]);
  assert.deepEqual(groups[0].tracks.map(track=>track.id),["websearch","webextract"]);
  assert.deepEqual(groups[1].tracks.map(track=>track.id),["webfetch","trajectory-replay","browserarena"]);
  assert.deepEqual(groups[2].tracks.map(track=>track.id),["browser-use"]);
  assert.deepEqual(groups[0].upcoming.map(track=>track.id),["webfetch-api"]);
  assert.deepEqual(groups[2].upcoming.map(track=>track.id),[]);
  const published=trackOverview(catalog);
  assert.equal(published.length,5);assert.equal(published.flatMap(track=>track.benchmarks).length,12);
  assert.ok(groups.flatMap(group=>group.upcoming).every(item=>!published.some(track=>track.id===item.id)));
});

test("the homepage offers the evaluation repository star and translates the development preview", async () => {
  const Home=require('../web/components/home.tsx').default;
  const win=new Window();
  try {
    win.document.body.innerHTML=renderToStaticMarkup(React.createElement(Home,{catalog,snapshots:[],t:translator('zh',catalog,null)}));
    const star=win.document.querySelector('.overview-star');
    assert.equal(star.href,'https://github.com/lexmount/webstone');
    assert.match(star.textContent,/Star/);
    assert.equal(win.document.querySelector('.overview-star-note'), null);
    assert.match([...win.document.querySelectorAll('.upcoming-track')].map(item=>item.textContent).join(' '),/Web Tools/);
    assert.match(win.document.querySelector('.upcoming-track').textContent,/开发中/);
    assert.equal(win.document.querySelectorAll('.track-card[data-track]').length,5);
    assert.equal(win.document.querySelectorAll('.track-overview-grid > .track-card.upcoming-track').length,1);
  } finally {await win.happyDOM.close();}
});


test("Chinese navigation preserves technical names and translates supporting copy", () => {
  const {translator}=require('../web/lib/i18n.ts');
  const t=translator('zh',catalog);
  for (const name of ['Web Tools','Browser Capabilities','Browser Automation','Web Search','Web Extract','Web Fetch','Web Fetch API','Trajectory Replay','Browser Use']) assert.equal(t(name),name);
  assert.equal(t('Coming soon'),'开发中');
  assert.equal(t('Execute fixed action sequences'),'让浏览器执行固定操作序列');
});

test("homepage counts reports instead of historical result editions and uses the shared brand asset", async () => {
  const {discoverResults}=await import('../scripts/prepare-data.mjs');
  const {fileURLToPath}=await import('node:url');
  const files=await discoverResults(fileURLToPath(new URL('../results',import.meta.url)),catalog);
  const snapshots=files.map(item=>item.report);
  const Home=require('../web/components/home.tsx').default;
  const win=new Window();
  try {
    win.document.body.innerHTML=renderToStaticMarkup(React.createElement(Home,{catalog,snapshots,t:translator('zh',catalog)}));
    const stats=[...win.document.querySelectorAll('.overview-stats > div')].map(item=>[item.querySelector('dt').textContent,Number(item.querySelector('dd').textContent)]);
    assert.deepEqual(stats,[['评测方向',5],['评测基准',12],['评测报告',evaluationReports(catalog,snapshots).length]]);
    const logo=readFileSync(new URL('../web/public/brand/webstone.png',import.meta.url));
    assert.deepEqual([...logo.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
    assert.match(readFileSync(new URL('../README.md',import.meta.url),'utf8'),/web\/public\/brand\/webstone\.png/);
    assert.match(readFileSync(new URL('../README.md',import.meta.url),'utf8'),/^# Webstone Site\n/);
    for (const language of ['en', 'zh']) {
      const t = translator(language, catalog);
      win.document.body.innerHTML = renderToStaticMarkup(React.createElement(Home, { catalog, snapshots, t, language }));
      const hero = win.document.querySelector('.overview-hero').textContent;
      assert.ok(hero.includes(t("Find the right tools for your agent to browse the web.")));
      assert.ok(!hero.includes(t("The touchstone")));
      assert.equal(win.document.querySelector('h1').textContent, 'Webstone');
      assert.ok(hero.includes(t("If Webstone helps, give it a star.")));
      assert.equal(win.document.querySelector('.overview-feedback a').getAttribute('href'), 'https://github.com/lexmount/webstone-site/issues');
      assert.equal(win.document.querySelectorAll('a[href^="mailto:"]').length, 0);
      assert.doesNotMatch(hero, /The touchstone for your agent/);
    }
  } finally {await win.happyDOM.close();}
});


test("report cards open each language edition without translation or source-language labels", () => {
  const overview = require("../web/lib/overview.ts");
  const { EvaluationReports } = require("../web/components/home.tsx");
  const { snapshot } = load("lexbench-swde");
  const links = [];
  for (const language of ["en", "zh"]) {
    const article = overview.evaluationReports(catalog, [snapshot], undefined, language)[0];
    const win = new Window();
    try {
      win.document.body.innerHTML = renderToStaticMarkup(React.createElement(EvaluationReports, { catalog, snapshots: [snapshot], language, t: translator(language, catalog) }));
      const link = win.document.querySelector("h3 a");
      assert.equal(link.getAttribute("hreflang"), language);
      assert.equal(link.href, article.href);
      links.push(link.href);
      assert.equal(win.document.querySelector(".article-language"), null);
      assert.doesNotMatch(win.document.body.textContent, /Translated from|译自|中文原文|英文原文/);
    } finally { win.happyDOM.close(); }
  }
  assert.notEqual(links[0], links[1]);
});


test("expanded table metrics omit wholly undisclosed columns and preserve real zero and partial coverage", () => {
  const {decisionMetrics}=require('../web/lib/comparisons.ts');
  const benchmark={primaryMetric:'quality',metrics:[{id:'quality',unit:'ratio'},{id:'time',unit:'ms'},{id:'zero',unit:'ratio'},{id:'partial',unit:'ratio'}],providers:[{scores:{quality:1,time:null,zero:0,partial:null}},{scores:{quality:0.5,time:null,zero:0,partial:0.2}}]};
  assert.deepEqual(decisionMetrics(benchmark,true,'quality').map(item=>item.id),['quality','zero','partial']);
  assert.deepEqual(decisionMetrics(benchmark,true,'time').map(item=>item.id),['quality','zero','partial']);
});

test("diagnostic comparisons never imply a rank or best value in either language", async () => {
  const { prepareData } = await import("../scripts/prepare-data.mjs");
  await prepareData();
  const Dashboard = require("../web/components/dashboard.tsx").default;
  const { RELEASE } = require("../web/lib/release.generated.ts");
  const {snapshot} = load('lexbench-webfetch');
  const diagnostic=structuredClone(snapshot);
  diagnostic.benchmarks[0].definitionId='reviewed-diagnostic';
  const diagnosticCatalog=structuredClone(catalog);
  const diagnosticDefinition=diagnosticCatalog.benchmarks.find(b=>b.id==='lexbench-webfetch').definitions.find(d=>d.id==='reviewed-diagnostic');
  diagnosticDefinition.rankable=false;
  delete diagnosticDefinition.comparisonMode;
  diagnosticDefinition.metrics.forEach(metric=>{ metric.highlightBest=true; });
  const win=new Window({url:'https://webstone.test/?benchmark=lexbench-webfetch'});
  const prior=[globalThis.window,globalThis.document,globalThis.fetch,globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
  globalThis.fetch=async input=>{
    const path=String(input);
    let data={release:RELEASE};
    if(path.includes('/benchmarks/')) data=diagnosticCatalog;
    else if(path.includes('/results/')) data=[{file:'diagnostic.json',report:diagnostic}];
    return new Response(JSON.stringify(data));
  };
  const root=require('react-dom/client').createRoot(win.document.body);
  try {
    await React.act(async()=>root.render(React.createElement(Dashboard)));
    for(const language of ['EN','中文']) {
      await React.act(async()=>[...win.document.querySelectorAll('.language-control button')].find(b=>b.textContent===language).click());
      const toggle=win.document.querySelector('.table-controls button');
      assert.equal(toggle.getAttribute('aria-pressed'),'true');
      assert.equal(win.document.querySelectorAll('.category-head').length,7);
      await React.act(async()=>toggle.click());
      assert.equal(win.document.querySelectorAll('.category-head').length,0);
      await React.act(async()=>toggle.click());
      assert.equal(win.document.querySelectorAll('.category-head').length,7);
      assert.equal(win.document.querySelectorAll('td.best-value').length,0);
      assert.equal(win.document.querySelectorAll('.rank-cell').length,0);
      assert.doesNotMatch(win.document.body.textContent,/Different test conditions|测试条件不同|Results use different evaluation conditions/);
      assert.equal(win.document.querySelectorAll('tbody tr').length,diagnostic.benchmarks[0].providers.length);
    }
  } finally {
    await React.act(async()=>root.unmount());await win.happyDOM.close();
    [globalThis.window,globalThis.document,globalThis.fetch,globalThis.IS_REACT_ACT_ENVIRONMENT]=prior;
  }
});

test("pricing details keep official links usable by keyboard and close with Escape", async () => {
  const Tooltip=require('../web/components/info-tooltip.tsx').default;
  const win=new Window();
  const previous=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
  const container=win.document.createElement('div');win.document.body.append(container);
  const root=require('react-dom/client').createRoot(container);
  try {
    await React.act(async()=>root.render(React.createElement(Tooltip,{label:'Cloudflare · Billing basis',description:'Browser usage and model inference.',sources:[{label:'Browser Run',url:'https://developers.cloudflare.com/browser-run/pricing/'},{label:'Workers AI',url:'https://developers.cloudflare.com/workers-ai/platform/pricing/'}]})));
    const trigger=container.querySelector('button');
    const next=win.document.createElement('button');next.textContent='Next control';container.after(next);
    trigger.getClientRects=()=>[new win.DOMRect(0,0,20,20)];next.getClientRects=()=>[new win.DOMRect(0,0,20,20)];
    await React.act(async()=>trigger.focus());
    await React.act(async()=>trigger.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
    const panel=win.document.querySelector('[role="dialog"]');assert.ok(panel);
    const links=[...panel.querySelectorAll('a')];assert.equal(links.length,2);
    assert.equal(win.document.activeElement?.getAttribute('href'),links[0].getAttribute('href'));
    assert.equal(links[0].href,'https://developers.cloudflare.com/browser-run/pricing/');
    assert.equal(links[1].href,'https://developers.cloudflare.com/workers-ai/platform/pricing/');
    assert.ok(links.every(link=>link.target==='_blank'&&link.rel.includes('noopener')));
    await React.act(async()=>{panel.dispatchEvent(new win.MouseEvent('mouseout',{bubbles:true,relatedTarget:win.document.body}));await new Promise(resolve=>setTimeout(resolve,150));});
    assert.ok(win.document.querySelector('[role="dialog"]'));
    await React.act(async()=>links[0].dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));
    assert.ok(win.document.activeElement===trigger);
    await React.act(async()=>trigger.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
    assert.equal(win.document.activeElement?.getAttribute('href'),links[0].getAttribute('href'));
    await React.act(async()=>{links[1].focus();links[1].dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));});
    assert.ok(win.document.activeElement===next);
    assert.equal(win.document.querySelector('[role="dialog"]'),null);
    await React.act(async()=>trigger.focus());
    await React.act(async()=>trigger.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
    assert.ok(win.document.querySelector('[role="dialog"]'));
    assert.equal(win.document.activeElement?.getAttribute('href'),links[0].getAttribute('href'));
    await React.act(async()=>win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(win.document.querySelector('[role="dialog"]'),null);
    assert.ok(win.document.activeElement===trigger);
    await React.act(async()=>{next.focus();trigger.dispatchEvent(new win.MouseEvent('mouseover',{bubbles:true,relatedTarget:next}));});
    assert.ok(win.document.querySelector('[role="dialog"]'));
    await React.act(async()=>win.document.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(win.document.querySelector('[role="dialog"]'),null);
    assert.ok(win.document.activeElement===next);
    for(const eventType of ['scroll','resize']) {
      await React.act(async()=>{trigger.focus();trigger.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
      assert.ok(win.document.querySelector('[role="dialog"]').contains(win.document.activeElement));
      await React.act(async()=>win.dispatchEvent(new win.Event(eventType)));
      assert.equal(win.document.querySelector('[role="dialog"]'),null);
      assert.ok(win.document.activeElement===trigger);
    }
  } finally {await React.act(async()=>root.unmount());[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;await win.happyDOM.close();}
});

test("method details retain raw numerators and denominators alongside compact rates", async () => {
  const Details=require('../web/components/method-details.tsx').default;
  const win=new Window();
  try {
    for(const id of ['lexbench-swde','lexbench-zyte-product-extraction']) {
      const {benchmark}=load(id,'v1.0.1');
      for(const provider of benchmark.providers) {
        win.document.body.innerHTML=renderToStaticMarkup(React.createElement(Details,{benchmark,provider,t:text=>text,onClose:()=>{}}));
        const details=win.document.querySelector('.method-metrics').textContent;
        for(const metric of benchmark.metrics.filter(item=>item.unit==='ratio')) {
          if(provider.scores[metric.id] !== null && provider.scores[metric.id] !== undefined)assert.ok(details.includes(`Source value: ${provider.scores[metric.id].toFixed(metric.decimals)} (0–1)`));
        }
        for(const [metric,counts]of Object.entries(provider.counts??{})) {
          if(provider.scores[metric] !== null && provider.scores[metric] !== undefined)assert.ok(details.includes(`${counts.count} / ${counts.total}`),`${id} ${provider.id} ${metric}`);
        }
      }
    }
  } finally {await win.happyDOM.close();}
});

test("every benchmark view supplies a sourced task, an input, a flow and a reference output", () => {
  for (const benchmark of catalog.benchmarks) {
    const isLexmountDataset = benchmark.datasetUrl.startsWith("https://huggingface.co/datasets/Lexmount/");
    const example = benchmark.example;
    if (isLexmountDataset) {
      assert.ok(example, `${benchmark.id}: missing example`);
    }
    if (!example) continue;
    assert.ok(example.taskId && example.input && example.output && example.check);
    assert.ok(example.steps.length >= 2);
    if (isLexmountDataset) {
      assert.match(example.sourceUrl, /^https:\/\/huggingface\.co\/datasets\/Lexmount\/[^/]+\/blob\/[a-f0-9]{40}\//);
    } else {
      assert.match(example.sourceUrl, /^https:\/\/(?:huggingface\.co\/datasets\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\/|github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\/)/);
    }
    assert.ok(example.outputLabel, 'Reference output must be distinguished from measured output');
  }
  for (const track of catalog.tracks.filter(item => !item.url)) {
    const trackBenchmarks = catalog.benchmarks.filter(item => item.trackId === track.id);
    assert.ok(trackBenchmarks.some(item => item.example), `${track.id}: published track needs at least one sourced example`);
  }
});

test("all published versions highlight comparable column winners consistently, including after reversing sort", async () => {
  const { prepareData } = await import("../scripts/prepare-data.mjs");
  await prepareData();
  const files = JSON.parse(readFileSync(new URL('../web/public/results/reports.json', import.meta.url)));
  const Dashboard = require('../web/components/dashboard.tsx').default;
  const { RELEASE } = require('../web/lib/release.generated.ts');
  const prior = [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT];
  try {
    for (const file of files) {
      const benchmark = resolveBenchmark(catalog, file.report.benchmarks[0]);
      const win = new Window({ url: `https://webstone.test/?benchmark=${benchmark.id}&version=${file.report.version}` });
      [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
      globalThis.fetch = async input => {
        if (String(input).includes('/benchmarks/')) return new Response(JSON.stringify(catalog));
        if (String(input).includes('/results/')) return new Response(JSON.stringify([file]));
        return new Response(JSON.stringify({ release: RELEASE }));
      };
      const root = require('react-dom/client').createRoot(win.document.body);
      try {
        await React.act(async () => root.render(React.createElement(Dashboard)));
        const more = [...win.document.querySelectorAll('.table-controls button')].find(button => button.textContent === 'More metrics');
        applyTableStyles(win);
        const check = (expanded) => {
          checkTableStyles(win, win.document.querySelector(".wide-table"), file.file);
          const headers = [...win.document.querySelectorAll('.wide-table thead th')];
          const rows = [...win.document.querySelectorAll('.wide-table tbody tr')];
          for (const metric of benchmark.metrics) {
            const index = headers.findIndex(header => header.querySelector('.sort-button')?.textContent === metric.label);
            if (index < 0) {
              assert.ok(!expanded && !benchmark.keyMetricIds.includes(metric.id) || metric.id !== benchmark.primaryMetric && benchmark.providers.every(provider => (provider.scores[metric.id] === null || provider.scores[metric.id] === undefined)));
              continue;
            }
            const values = benchmark.providers.map(provider => provider.scores[metric.id]).filter(value => value !== null && value !== undefined);
            const varied = new Set(values).size > 1;
            const best = metric.direction === 'asc' ? Math.min(...values) : Math.max(...values);
            const expected = benchmark.rankable === false || !varied ? 0 : values.filter(value => value === best).length;
            assert.equal(rows.filter(row => row.children[index].classList.contains('best-value')).length, expected, `${file.file}: ${metric.id}`);
            for (const provider of benchmark.providers) {
              const row = rows.find(item => item.dataset.provider === provider.id);
              assert.ok(row, `${file.file}: ${provider.id}`);
              const wins = expected > 0 && provider.scores[metric.id] === best;
              assert.equal(row.children[index].classList.contains('best-value'), wins, `${file.file}: ${provider.id} ${metric.id}`);
            }
          }
          for (const category of benchmark.categories) {
            const index = headers.findIndex(header => header.classList.contains('category-head') && header.textContent === category.name);
            const values = benchmark.providers.map(provider => provider.categoryPassed?.[category.id]).filter(value => value !== null && value !== undefined);
            const expected = benchmark.rankable === false || new Set(values).size < 2 ? 0 : values.filter(value => value === Math.max(...values)).length;
            assert.equal(rows.filter(row => row.children[index].classList.contains('best-value')).length, expected, `${file.file}: ${category.id}`);
            for (const provider of benchmark.providers) {
              const row = rows.find(item => item.dataset.provider === provider.id);
              assert.ok(row);
              const wins = expected > 0 && provider.categoryPassed?.[category.id] === Math.max(...values);
              assert.equal(row.children[index].classList.contains('best-value'), wins, `${file.file}: ${provider.id} ${category.id}`);
            }
          }
        };
        check(false);
        await React.act(async () => win.document.querySelector('th.sorted .sort-button').click());
        check(false);
        if (more) {
          await React.act(async () => more.click());
          check(true);
          await React.act(async () => win.document.querySelector('th.sorted .sort-button').click());
          check(true);
        }
        for (const item of benchmark.metrics) {
          const button=[...win.document.querySelectorAll('th .sort-button')].find(button=>button.textContent===item.label);
          if (!button) continue;
          const wasSelected=button.closest('th').classList.contains('sorted');
          const before=button.closest('th').getAttribute('aria-sort');
          const initialDirection=wasSelected?(before==='ascending'?'desc':'asc'):item.direction;
          await React.act(async()=>button.click());
          for(let reverse=0;reverse<2;reverse++) {
            const direction=button.closest('th').getAttribute('aria-sort')==='ascending'?'asc':'desc';
            const expectedDirection=reverse===0?initialDirection:(initialDirection==='asc'?'desc':'asc');
            assert.equal(direction,expectedDirection,`${file.file}: ${item.id} click ${reverse+1}`);
            const rows=[...win.document.querySelectorAll('.wide-table tbody tr')];
            const values=rows.map(row=>benchmark.providers.find(provider=>provider.id===row.dataset.provider).scores[item.id]);
            let missing=false, prior;
            for(const value of values) {
              if(value===null||value===undefined){missing=true;continue;}
              assert.equal(missing,false,`${file.file}: missing values stay last`);
              if(prior!==undefined) assert.ok(direction==='asc'?prior<=value:prior>=value,`${file.file}: ${item.id} ${direction}`);
              prior=value;
            }
            check(Boolean(more));
            await React.act(async()=>button.click());
          }
        }
      } finally { await React.act(async () => root.unmount()); await win.happyDOM.close(); }
    }
  } finally { [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT] = prior; }
});

test("Track example selection changes the task, reference and output together", async () => {
  const win = new Window({ url: 'https://webstone.test/' });
  const prior = [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
  const root = require('react-dom/client').createRoot(win.document.body);
  const ExampleDialog = require('../web/components/example-dialog.tsx').default;
  const benchmarks = catalog.benchmarks.filter(benchmark => ['lexbench-swde', 'lexbench-zyte-product-extraction'].includes(benchmark.id));
  try {
    for (const language of ['en', 'zh']) {
      await React.act(async () => root.render(React.createElement(ExampleDialog, { title: 'Web Extract', description: 'Structured field extraction', benchmarks, onClose() {}, t: translator(language, catalog) })));
      const select = win.document.querySelectorAll('.example-switcher button');
      for (const index of [0, 1, 0]) {
        await React.act(async () => select[index].click());
        const expected = benchmarks[index].example;
        assert.ok(win.document.querySelector('.example-source').textContent.includes(expected.taskId));
        assert.equal(win.document.querySelector('.example-source a').href, expected.sourceUrl);
        assert.equal(win.document.querySelectorAll('pre')[0].textContent, expected.input);
        assert.equal(win.document.querySelectorAll('pre')[1].textContent, expected.output);
        assert.equal(select[index].getAttribute('aria-pressed'), 'true');
        assert.equal(win.document.querySelectorAll('.example-flow section').length, 3);
      }
    }
  } finally { await React.act(async () => root.unmount()); await win.happyDOM.close(); [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = prior; }
});

test("benchmark examples remain usable when a requested result version is missing", async () => {
  const { prepareData } = await import('../scripts/prepare-data.mjs');
  await prepareData();
  const Dashboard = require('../web/components/dashboard.tsx').default;
  const { RELEASE } = require('../web/lib/release.generated.ts');
  const win = new Window({ url: 'https://webstone.test/?benchmark=lexbench-webfetch&version=v999.0.0' });
  const prior = [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
  globalThis.fetch = async input => {
    if (String(input).includes('/benchmarks/')) return new Response(JSON.stringify(catalog));
    if (String(input).includes('/results/')) return new Response(JSON.stringify([]));
    return new Response(JSON.stringify({ release: RELEASE }));
  };
  const root = require('react-dom/client').createRoot(win.document.body);
  try {
    await React.act(async () => root.render(React.createElement(Dashboard)));
    assert.ok(win.document.querySelector('.empty-state'));
    await React.act(async () => win.document.querySelector('.benchmark-links .example-open').click());
    assert.equal(win.document.querySelectorAll('.example-dialog[open]').length, 1);
    assert.ok(win.document.querySelector('.example-source').textContent.includes('article-030'));
  } finally { await React.act(async () => root.unmount()); await win.happyDOM.close(); [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT] = prior; }
});

test("example dialogs distinguish recorded provider responses from reference answers", () => {
  const ExampleDialog = require('../web/components/example-dialog.tsx').default;
  const benchmark = structuredClone(catalog.benchmarks[0]);
  benchmark.example.recording = { provider: 'Recorded provider', reportUrl: 'https://example.com/report', file: 'calls/response.json', sha256: 'a'.repeat(64) };
  const html = renderToStaticMarkup(React.createElement(ExampleDialog, {title: benchmark.name, description: benchmark.description, benchmarks: [benchmark], onClose: () => {}, t: text => text}));
  assert.match(html, /Recorded provider/);
  assert.match(html, /href="https:\/\/example.com\/report"/);
  assert.doesNotMatch(html, /Reference values are not a measured result/);
  delete benchmark.example.recording;
  const reference = renderToStaticMarkup(React.createElement(ExampleDialog, {title: benchmark.name, description: benchmark.description, benchmarks: [benchmark], onClose: () => {}, t: text => text}));
  assert.doesNotMatch(reference, /Reference values are not a measured result/);
  assert.ok(reference.includes(benchmark.example.outputLabel));
  assert.ok(reference.includes(benchmark.example.output));
});

test("capability profiles do not turn non-comparable timing into an efficiency advantage", () => {
  for (const id of ['webmainbench', 'lexbench-websearch']) {
    const { benchmark } = load(id, id === 'webmainbench' ? 'v2.1.0' : 'v2');
    const axes = radarAxes(benchmark);
    for (const metric of benchmark.metrics.filter(item => ['ms', 'seconds', 'mib', 'usd'].includes(item.unit) && (item.highlightBest === false || item.comparisonMode === 'reported'))) {
      assert.ok(!axes.some(axis => axis.id === metric.id), `${id}: ${metric.id} is not a comparable efficiency axis`);
    }
  }
  const { benchmark } = load('webarena-verified', 'v1.1.0');
  assert.ok(radarAxes(benchmark).filter(axis => axis.defaultSelected).every(axis => !/p50|p95/i.test(axis.id)));
  const single = load('simpleqa-verified-excerpts', 'v2.0.0').benchmark;
  assert.match(render(single), /class="quality-comparison"/, 'One quality dimension uses a comparison instead of artificial radar axes');
});

test("Browser Use reuses the shared radar only when real quality dimensions are supplied", () => {
  for (const id of ['bu-bench-v1', 'online-mind2web', 'webvoyager', 'osworld']) {
    const quality = id === 'osworld' ? 'scoreRate' : 'successRate';
    const benchmark = resolveBenchmark(catalog, {
      id, definitionId: 'standard', taskCount: 100, notes: [], reportUrl: null,
      providers: [
        { id: 'fixture-a', name: 'Fixture A', scores: { [quality]: 90, costPerTask: 0.1 } },
        { id: 'fixture-b', name: 'Fixture B', scores: { [quality]: 80, costPerTask: null } },
      ],
    });
    assert.deepEqual(benchmark.keyMetricIds, [quality, 'costPerTask']);
    assert.match(render(benchmark), /class="quality-comparison"/, `${id}: source-reported quality remains charted`);
    assert.doesNotMatch(render(benchmark), /class="radar-shape"/, `${id}: no artificial radar dimensions`);
    const expanded = {
      ...benchmark, rankable: true, comparisonMode: undefined,
      metrics: [...benchmark.metrics, {id: 'quality2', label: 'Second quality', unit: 'percent', direction: 'desc'}, {id: 'quality3', label: 'Third quality', unit: 'percent', direction: 'desc'}],
      keyMetricIds: [quality, 'quality2', 'quality3'],
      providers: benchmark.providers.map(p => ({...p, scores: {...p.scores, quality2: 80, quality3: 70}})),
    };
    const html = render(expanded);
    assert.match(html, /class="radar-shape"/, `${id}: genuine extra dimensions use the existing radar`);
    assert.match(html, /class="metric-selector"/);
    assert.doesNotMatch(html, /radar-divider|overlapping methods|Undisclosed methods/);
  }
});


test("an undisclosed task population renders scores without inventing a case or pass count", async () => {
  const {prepareData} = await import('../scripts/prepare-data.mjs');
  await prepareData();
  const {RELEASE} = require('../web/lib/release.generated.ts');
  const Dashboard = require('../web/components/dashboard.tsx').default;
  const prior = [globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT];
  const report = {
    id: 'bu-bench-v1-v1.0.0', version: 'v1.0.0',
    datasetDifference: 'The source publishes percentages without an evaluated task count.',
    release: {date: '2026-11-24', kind: 'results', previous: null, summary: 'Publish reported results.'},
    source: {url: 'https://example.com/report'},
    benchmarks: [{id: 'bu-bench-v1', definitionId: 'standard', taskCount: null, notes: [], reportUrl: null,
      providers: [{id: 'fixture', name: 'Fixture agent', description: 'Reported configuration', mode: 'agent',
        passed: null, scores: {successRate: 93.41, costPerTask: null}}]}],
  };
  try {
    for (const language of ['en', 'zh']) {
      const win = new Window({url: 'https://webstone.test/?benchmark=bu-bench-v1'});
      win.localStorage.setItem('webstone-language', language);
      [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
      globalThis.fetch = async input => {
        if (String(input).includes('/benchmarks/')) return new Response(JSON.stringify(catalog));
        if (String(input).includes('/results/')) return new Response(JSON.stringify([{file: 'bu-bench-v1/bu-bench-v1-v1.0.0-report.json', report}]));
        return new Response(JSON.stringify({release: RELEASE}));
      };
      const root = require('react-dom/client').createRoot(win.document.body);
      try {
        await React.act(async () => root.render(React.createElement(Dashboard)));
        assert.match(win.document.querySelector('.table-summary').textContent, /1/);
        assert.doesNotMatch(win.document.querySelector('.table-summary').textContent, /cases|题|NaN|null|undefined/);
        assert.match(win.document.querySelector('tbody').textContent, /93.41%/);
        assert.doesNotMatch(win.document.querySelector('thead').textContent, /Passed|通过数/);
        assert.equal(win.document.querySelector('.count-cell'), null);
      } finally {await React.act(async () => root.unmount()); await win.happyDOM.close();}
    }
  } finally {[globalThis.window, globalThis.document, globalThis.fetch, globalThis.IS_REACT_ACT_ENVIRONMENT] = prior;}
});


test("Online-Mind2Web retains reported scores and source-specific extremum labels", () => {
  const benchmark = resolveBenchmark(catalog, {
    id: 'online-mind2web', definitionId: 'standard', taskCount: 300, notes: [], reportUrl: null,
    providers: [
      {id: 'reported-a', name: 'Agent A', passed: null, scores: {successRate: 98.96, costPerTask: 0.1}},
      {id: 'reported-b', name: 'Agent B', passed: null, scores: {successRate: 98, costPerTask: null}},
    ],
  });
  assert.equal(benchmark.comparisonMode, "reported");
  assert.equal(benchmark.providers[1].scores.successRate, 98);
  assert.match(render(benchmark), /class="quality-comparison"/, 'Source-reported quality remains charted');
  assert.doesNotMatch(render(benchmark), /best-value|radar-shape/);
});

test('track overviews join published methods across the latest benchmark editions without inventing scores', async () => {
  const { trackComparison } = require('../web/lib/track-comparison.ts');
  const { discoverResults } = await import('../scripts/prepare-data.mjs');
  const { fileURLToPath } = await import('node:url');
  const files = await discoverResults(fileURLToPath(new URL('../results', import.meta.url)), catalog);
  const snapshots = files.map(({file}) => JSON.parse(readFileSync(new URL('../results/'+file, import.meta.url))));
  const agents = trackComparison(catalog, [...snapshots].reverse(), 'browser-use');
  assert.equal(agents.columns.length, 4);
  assert.equal(agents.rows.length, 16);
  const lexmount = agents.rows.find(row => row.id === 'lexmount-browser-agent');
  assert.deepEqual(agents.columns.map(col=>lexmount.results[col.benchmark.id].provider.scores[col.metric.id]), [93.41,98.96,98.95,85.96]);
  const aside = agents.rows.find(row => row.id === 'aside-gpt-5-5-high');
  assert.equal(aside.results.webvoyager, undefined);
  assert.equal(agents.profile.providers.find(p=>p.id===aside.id).scores['webvoyager:successRate'], null);
  assert.equal(radarAxes(agents.profile).length, 4);
  assert.equal((render(agents.profile).match(/class="radar-shape"/g)??[]).length,1);
  assert.equal((render(agents.profile).match(/class="radar-series"/g)??[]).length,16);
  const fetch = trackComparison(catalog,snapshots,'webfetch');
  assert.equal(fetch.columns.length, 2);
  assert.deepEqual(fetch.columns.map(col=>col.snapshot.version),['v2.1.0','v2.1.0']);
  assert.equal(fetch.rows.length,5);
  const moli=fetch.rows.find(row=>row.id==='moli');
  assert.equal(moli.results['lexbench-webfetch'].provider.scores.passRate,89.3);
  assert.equal(moli.results.webmainbench.provider.scores.overall,39.27);
  assert.equal(moli.results['lexbench-webfetch'].provider.name,'Moli 1.1.17');
  assert.equal(moli.results.webmainbench.provider.name,'Moli 1.1.11');
  assert.equal(radarAxes(fetch.profile).length,2);
  const search=trackComparison(catalog,snapshots,'websearch','L1');
  assert.equal(search.columns.length,2);
  assert.equal(search.rows.length,9);
  assert.ok(search.rows.some(row=>row.id==='yuanbao-standard'));
  assert.ok(search.rows.some(row=>row.id==='yuanbao-lite'));
  assert.equal(radarAxes(search.profile).length,2);
  assert.equal(trackComparison(catalog,snapshots,'browserarena'),null);
  for(const layer of ['L2','L3']){
    const overview=trackComparison(catalog,snapshots,'websearch',layer);
    assert.ok(overview.columns.every(col=>col.benchmark.outputLayer===layer));
  }
});

test('single-dimension results still draw an honest comparison with zero and missing values', async () => {
  const benchmark={...load('online-mind2web','v1.0.0').benchmark,comparisonMode:undefined};
  benchmark.providers=benchmark.providers.map((provider,index)=>{
    let value=provider.scores.successRate;
    if(index===0)value=0;
    else if(index===1)value=null;
    return {...provider,scores:{...provider.scores,successRate:value}};
  });
  const html=render(benchmark);
  assert.match(html,/class="quality-comparison" role="group"/);
  assert.doesNotMatch(html,/class="radar-shape"/);
  assert.match(html,/0.00%/);
  assert.match(html,/—/);
  assert.equal((html.match(/class="quality-series"/g)??[]).length,benchmark.providers.length);
  assert.doesNotMatch(html,/NaN|Infinity/);
  const win=new Window();
  try {
    win.document.body.innerHTML=html;
    const rows=[...win.document.querySelectorAll('.quality-series')];
    const valueFor=name=>rows.find(row=>row.querySelector('span').textContent===name)?.querySelector('strong').textContent;
    assert.equal(valueFor(benchmark.providers[0].name),'0.00%');
    assert.equal(valueFor(benchmark.providers[1].name),'—');
  } finally { await win.happyDOM.close(); }
});

test('track overview links open the combined view without increasing benchmark counts', async () => {
  const Home=require('../web/components/home.tsx').default;
  const html=renderToStaticMarkup(React.createElement(Home,{catalog,snapshots:[],t:text=>text}));
  for(const track of ['webfetch','websearch','browser-use']) assert.ok(html.includes('href="/?track='+track+'"'),track);
  assert.equal(trackOverview(catalog).flatMap(track=>track.benchmarks).length,12);
});

test('track overview URLs, individual tabs and search layers retain the correct view', async () => {
  const {prepareData}=await import('../scripts/prepare-data.mjs');await prepareData();
  const reports=JSON.parse(readFileSync(new URL('../web/public/results/reports.json',import.meta.url)));
  const {RELEASE}=require('../web/lib/release.generated.ts');
  const Dashboard=require('../web/components/dashboard.tsx').default;
  const previous=[globalThis.window,globalThis.document,globalThis.fetch,globalThis.IS_REACT_ACT_ENVIRONMENT];
  const views=[['browser-use','L1'],['webfetch','L1'],['websearch','L1'],['websearch','L2'],['websearch','L3']];
  const expectedColumns={
    'browser-use':{'bu-bench-v1':['v1.0.0','successRate'],'online-mind2web':['v1.0.0','successRate'],webvoyager:['v1.0.0','successRate'],osworld:['v1.0.0','scoreRate']},
    webfetch:{'lexbench-webfetch':['v2.1.0','passRate'],webmainbench:['v2.1.0','overall']},
    L1:{'lexbench-websearch':['v2.0.0','ndcg5'],'simpleqa-verified':['v3.0.0','mrr5']},
    L2:{'lexbench-websearch-excerpts':['v1.0.0','ndcg5'],'simpleqa-verified-excerpts':['v2.0.0','excerptMatch5']},
    L3:{'lexbench-websearch-answers':['v1.0.0','usefulness'],'simpleqa-verified-answers':['v2.0.0','answerAccuracy']},
  };
  try{for(const [trackId,initialLayer] of views)for(const language of ['en','zh']){
    const params=new URLSearchParams({track:trackId});
    if(initialLayer!=='L1')params.set('layer',initialLayer);
    const initialSearch='?'+params;
    const win=new Window({url:'https://webstone.test/'+initialSearch});win.localStorage.setItem('webstone-language',language);
    [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
    globalThis.fetch=async input=>{
      let data={release:RELEASE};
      if(String(input).includes('/benchmarks/'))data=catalog;
      else if(String(input).includes('/results/'))data=reports;
      return new Response(JSON.stringify(data));
    };
    const container=win.document.createElement('div');win.document.body.append(container);
    const root=require('react-dom/client').createRoot(container);
    try{
      await React.act(async()=>root.render(React.createElement(Dashboard)));
      if(language==='zh') await React.act(async()=>[...container.querySelectorAll('.language-control button')].find(button=>button.textContent==='中文').click());
      assert.ok(container.querySelector('.track-results'),trackId);
      const expectedAxes={'browser-use':4,webfetch:2,L1:2,L2:2,L3:2};
      const columnKey=trackId==='websearch'?initialLayer:trackId;
      assert.equal(container.querySelectorAll('.overview-comparisons .quality-comparison').length,expectedAxes[columnKey]);
      const columns=expectedColumns[columnKey];
      assert.deepEqual([...container.querySelectorAll('.track-results thead a')].map(anchor=>new URL(anchor.href).searchParams.get('benchmark')),Object.keys(columns));
      const scoreLinks=[...container.querySelectorAll('.track-results tbody td.numeric a')];
      const expectedScoreCounts={'browser-use':20,webfetch:10,L1:18,L2:8,L3:2};
      assert.equal(scoreLinks.length,expectedScoreCounts[columnKey]);
      for(const anchor of scoreLinks){
        const target=new URL(anchor.href).searchParams;
        const expected=columns[target.get('benchmark')];
        assert.ok(expected,'score links identify a constituent benchmark');
        assert.equal(target.get('version'),expected[0]);
        assert.equal(target.get('metric'),expected[1]);
        assert.ok(anchor.title,'score links identify the measured configuration');
      }
      if(trackId==='websearch'){
        const active=[...container.querySelectorAll('.layer-control button')].find(button=>button.getAttribute('aria-pressed')==='true');
        assert.ok(active.textContent.startsWith(initialLayer),'the initial URL layer is selected before interaction');
      }
      if(trackId==='webfetch'){
        const moliLinks=[...container.querySelectorAll('.track-results tr[data-provider="moli"] td.numeric a')];
        assert.deepEqual(moliLinks.map(anchor=>anchor.title),['Moli 1.1.17','Moli 1.1.11']);
        assert.ok(moliLinks[1].textContent.startsWith('39.27'));
      }
      const overview=[...container.querySelectorAll('.benchmark-navigation button')].find(b=>b.textContent===(language==='en'?'Overview':'总览'));
      assert.equal(overview.getAttribute('aria-current'),'page');
      const benchmarkButton=[...container.querySelectorAll('.benchmark-navigation button')].find(b=>b!==overview);
      await React.act(async()=>benchmarkButton.click());
      assert.ok(!container.querySelector('.track-results'));
      assert.ok(win.location.search.includes('benchmark='));
      let scroll=500;win.scrollTo=options=>{scroll=options.top;};
      await React.act(async()=>overview.click());
      assert.equal(scroll,0);assert.equal(win.location.search,initialSearch);
      assert.ok(container.querySelector('.track-results'));
      if(trackId==='websearch'){
        await React.act(async()=>[...container.querySelectorAll('.layer-control button')].find(b=>b.textContent.startsWith('L2')).click());
        assert.equal(win.location.search,'?track=websearch&layer=L2');
        assert.ok([...container.querySelectorAll('.track-results thead a')].every(a=>a.href.includes('excerpts')));
        for(const layer of ['L2','L3']){
          await React.act(async()=>[...container.querySelectorAll('.layer-control button')].find(b=>b.textContent.startsWith(layer)).click());
          await React.act(async()=>benchmarkButton.click());
          assert.ok(win.location.search.includes(layer==='L2'?'excerpts':'answers'));
          await React.act(async()=>overview.click());
          assert.equal(win.location.search,'?track=websearch&layer='+layer);
        }
      }
    }finally{await React.act(async()=>root.unmount());await win.happyDOM.close();}
  }}finally{[globalThis.window,globalThis.document,globalThis.fetch,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});

test('clicking an active Track without an overview preserves the selected edition and metric',async()=>{
  const {prepareData}=await import('../scripts/prepare-data.mjs');await prepareData();
  const reports=JSON.parse(readFileSync(new URL('../web/public/results/reports.json',import.meta.url)));
  const {RELEASE}=require('../web/lib/release.generated.ts');
  const Dashboard=require('../web/components/dashboard.tsx').default;
  const withoutOverviews=structuredClone(catalog);
  for(const track of withoutOverviews.tracks)delete track.overview;
  const previous=[globalThis.window,globalThis.document,globalThis.fetch,globalThis.IS_REACT_ACT_ENVIRONMENT];
  try{for(const [id,metric,track,label,direction] of [['lexbench-swde','valueMicroF1','Web Extract','Value micro F1','descending'],['webarena-verified','actionP95','Trajectory Replay','Action P95','ascending']]){
    const win=new Window({url:`https://webstone.test/?benchmark=${id}&version=v1.0.0&metric=${metric}`});
    [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
    globalThis.fetch=async input=>{
      let data={release:RELEASE};
      if(String(input).includes('/benchmarks/'))data=withoutOverviews;
      else if(String(input).includes('/results/'))data=reports;
      return new Response(JSON.stringify(data));
    };
    const container=win.document.createElement('div');win.document.body.append(container);const root=require('react-dom/client').createRoot(container);
    try{
      await React.act(async()=>root.render(React.createElement(Dashboard)));
      const sortedHeader=()=>{
        const header=[...container.querySelectorAll('th[aria-sort]')].find(header=>header.getAttribute('aria-sort')!=='none');
        return {label:header?.querySelector('.sort-button')?.textContent,direction:header?.getAttribute('aria-sort')};
      };
      assert.deepEqual(sortedHeader(),{label,direction});
      const before=win.location.search;let top=900;win.scrollTo=options=>{top=options.top;};
      await React.act(async()=>[...container.querySelectorAll('.grouped-navigation button')].find(button=>button.textContent.startsWith(track)).click());
      assert.equal(win.location.search,before);
      assert.equal(container.querySelector('#result-version').value,'v1.0.0');
      assert.deepEqual(sortedHeader(),{label,direction});
      assert.equal(top,0);
    }finally{await React.act(async()=>root.unmount());await win.happyDOM.close();}
  }}finally{[globalThis.window,globalThis.document,globalThis.fetch,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});

test('a two-dimensional comparison retains a populated category alongside overall quality',async()=>{
  const source=load('lexbench-webfetch','v1').benchmark;
  const benchmark={...source,metrics:source.metrics.filter(metric=>metric.id===source.primaryMetric),keyMetricIds:[source.primaryMetric],categories:source.categories.slice(0,1)};
  const win=new Window();
  try{
    win.document.body.innerHTML=render(benchmark);
    assert.equal(win.document.querySelectorAll('.quality-comparison section').length,2);
    assert.equal(win.document.querySelectorAll('.metric-selector input').length,2);
    assert.ok([...win.document.querySelectorAll('.quality-comparison h3')].some(heading=>heading.textContent===benchmark.categories[0].name));
    assert.equal(win.document.querySelectorAll('.quality-series').length,benchmark.providers.length*2);
  }finally{await win.happyDOM.close();}
});

test('compact chart Reset restores selected metrics and visible results for one and two dimensions',async()=>{
  const source=load('lexbench-webfetch','v1').benchmark;
  const two={...source,metrics:source.metrics.filter(metric=>metric.id===source.primaryMetric),keyMetricIds:[source.primaryMetric],categories:source.categories.slice(0,1)};
  const previous=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT];
  try{for(const benchmark of [{...load('online-mind2web','v1.0.0').benchmark,comparisonMode:undefined},two]){
    const win=new Window();[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
    const container=win.document.createElement('div');win.document.body.append(container);const root=require('react-dom/client').createRoot(container);
    try{
      await React.act(async()=>root.render(component(benchmark)));
      const menu=container.querySelector('.metric-selector');
      const selected=()=>[...menu.querySelectorAll('input')].filter(input=>input.checked).map(input=>input.parentElement.textContent);
      const expected=selected();
      const sectionCount=container.querySelectorAll('.quality-comparison section').length;
      const seriesCount=container.querySelectorAll('.quality-series').length;
      for(const input of menu.querySelectorAll('input')) if(input.checked)await React.act(async()=>input.click());
      assert.ok(container.querySelector('.chart-empty'));
      await React.act(async()=>menu.querySelector('button').click());
      assert.ok(!container.querySelector('.chart-empty'),'Reset restores a visible chart');
      assert.deepEqual(selected(),expected);
      assert.equal(container.querySelectorAll('.quality-comparison section').length,sectionCount);
      assert.equal(container.querySelectorAll('.quality-series').length,seriesCount);
    }finally{await React.act(async()=>root.unmount());await win.happyDOM.close();}
  }}finally{[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});


test('overview defaults expose coverage, tested configurations and an actual score sort', async () => {
  const {trackComparison}=require('../web/lib/track-comparison.ts');
  const TrackResults=require('../web/components/track-results.tsx').default;
  const {discoverResults}=await import('../scripts/prepare-data.mjs');
  const {fileURLToPath}=await import('node:url');
  const files=await discoverResults(fileURLToPath(new URL('../results',import.meta.url)),catalog);
  const snapshots=files.map(({file})=>JSON.parse(readFileSync(new URL('../results/'+file,import.meta.url))));
  for(const trackId of ['browser-use','webfetch','websearch','webextract','trajectory-replay']){
    const comparison=trackComparison(catalog,snapshots,trackId);
    assert.ok(comparison,trackId);
    assert.equal(comparison.profile.metrics.length,comparison.columns.length,'one primary metric per benchmark');
    const win=new Window();
    try{
      win.document.body.innerHTML=renderToStaticMarkup(React.createElement(TrackResults,{catalog,snapshots,trackId,layer:'L1',onLayer:()=>{},t:x=>x,language:'en'}));
      assert.equal(Boolean(win.document.querySelector('.track-results col.rank-column')),true,'published results retain a rank column');
      const firstRank=win.document.querySelector('.track-results tbody .rank-cell');
      assert.equal(firstRank?.textContent,'1','published values retain their numeric rank');
      assert.equal(win.document.querySelector('th[aria-sort="descending"] .sort-button').textContent,comparison.columns[0].metric.label);
      const rows=[...win.document.querySelectorAll('.track-results tbody tr')];
      const values=rows.map(row=>row.querySelector('td.numeric a')?.textContent.replace(/Best in this column/g,'').trim()).filter(Boolean);
      assert.ok(rows.every(row=>row.querySelector('.method-coverage')),'coverage is visible for each method');
      if(trackId==='webfetch')assert.ok(win.document.querySelector('.track-results').textContent.includes('Moli 1.1.17'));
      if(trackId==='browser-use'){
        assert.equal(win.document.querySelectorAll('.overview-comparisons .quality-comparison').length,4);
        assert.equal(win.document.querySelectorAll('.overview-comparisons .quality-series').length,20,'all published values remain charted');
        assert.equal(win.document.querySelectorAll('.overview-comparisons .radar-shape').length,0,'sparse overview starts with per-benchmark comparisons');
      }
      assert.ok(values.length);
    }finally{await win.happyDOM.close();}
  }
});

test('comparable overview controls sort scores, filter measured coverage, inspect identities and select chart methods',async()=>{
  const {prepareData}=await import('../scripts/prepare-data.mjs');await prepareData();
  const reports=JSON.parse(readFileSync(new URL('../web/public/results/reports.json',import.meta.url))).map(record=>record.report);
  const TrackResults=require('../web/components/track-results.tsx').default;
  const commonCatalog=structuredClone(catalog);
  commonCatalog.benchmarks.filter(info=>info.trackId==='browser-use').forEach(info=>info.definitions.forEach(definition=>{delete definition.comparisonMode;}));
  const previous=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT];
  try{for(const language of ['en','zh']){
    const win=new Window({url:'https://webstone.test/?track=browser-use'});
    [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
    const container=win.document.createElement('div');win.document.body.append(container);const root=require('react-dom/client').createRoot(container);
    const t=translator(language,catalog);
    try{
      await React.act(async()=>root.render(React.createElement(TrackResults,{catalog:commonCatalog,snapshots:reports,trackId:'browser-use',layer:'L1',onLayer:()=>{},t,language})));
      const rows=()=>[...container.querySelectorAll('.track-results tbody tr')];
      assert.equal(rows()[0].dataset.provider,'cook-browser-desktop');
      const sort=container.querySelector('.track-results .sort-button');
      await React.act(async()=>sort.click());
      assert.equal(rows()[0].dataset.provider,'browser-use-oss-claude-fable-5');
      assert.equal(rows().at(-1).querySelector('td.numeric').textContent,'—','missing scores stay last in either direction');
      await React.act(async()=>sort.click());
      assert.equal(rows()[0].dataset.provider,'cook-browser-desktop');
      const filter=container.querySelector('.table-toolbar [role="group"]');
      await React.act(async()=>[...filter.querySelectorAll('button')].find(button=>button.textContent===t('All benchmarks')).click());
      assert.deepEqual(rows().map(row=>row.dataset.provider),['lexmount-browser-agent']);
      assert.equal(container.querySelectorAll('.track-results .best-value').length,0,'one displayed value cannot establish a column winner');
      assert.ok(rows()[0].querySelector('.method-coverage').textContent.includes('4/4'));
      await React.act(async()=>filter.querySelector('button').click());assert.equal(rows().length,16);
      await React.act(async()=>container.querySelector('.overview-chart-controls button:nth-child(2)').click());
      assert.equal(container.querySelectorAll('.radar-series').length,1,'only complete profiles enter the radar');
      assert.equal(container.querySelectorAll('.radar-shape').length,1);
      await React.act(async()=>container.querySelector('.overview-chart-controls button').click());
      const search=container.querySelector('input[type="search"]');
      await React.act(async()=>{const setter=Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set;setter.call(search,'Ouroboros');search.dispatchEvent(new win.Event('input',{bubbles:true}));});
      assert.equal(container.querySelectorAll('.method-selector .radar-legend label').length,2);
      const clear=[...container.querySelectorAll('.method-selection-actions button')].find(button=>button.textContent===t('Clear'));
      await React.act(async()=>clear.click());assert.equal(container.querySelectorAll('.quality-series').length,0);
      assert.ok(container.querySelector('.benchmark-comparisons').textContent.includes(t('Select a method to show its results.')));
      await React.act(async()=>container.querySelector('.overview-chart-controls button:nth-child(2)').click());
      assert.equal(container.querySelectorAll('.radar-series').length,0,'chart selection survives a view change');
      await React.act(async()=>container.querySelector('.overview-chart-controls button').click());
      await React.act(async()=>container.querySelector('.method-selection-actions button').click());assert.equal(container.querySelectorAll('.quality-series').length,20);
      await React.act(async()=>container.querySelector('tr[data-provider="aside-gpt-5-5-high"] .method-open').click());
      assert.ok(container.querySelector('.method-dialog').open);
      assert.ok(container.querySelector('.method-identity').textContent.includes('aside-gpt-5-5-high'));
      assert.equal(container.querySelectorAll('.method-history > ul > li').length,2);
      assert.ok([...container.querySelectorAll('.method-history > ul > li > a:first-child')].every(a=>a.href.includes('version=v1.0.0')));
    }finally{await React.act(async()=>root.unmount());await win.happyDOM.close();}
  }}finally{[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});

test('overview includes an empty constituent and never fills missing results or merges model variants',async()=>{
  const {trackComparison,coverage}=require('../web/lib/track-comparison.ts');
  const {prepareData}=await import('../scripts/prepare-data.mjs');await prepareData();
  const reports=JSON.parse(readFileSync(new URL('../web/public/results/reports.json',import.meta.url))).map(record=>record.report);
  const missing=reports.filter(snapshot=>!snapshot.benchmarks.some(b=>b.id==='osworld'));
  const comparison=trackComparison(catalog,missing,'browser-use');
  assert.equal(comparison.columns.length,4);
  assert.equal(comparison.columns.at(-1).info.id,'osworld');
  assert.equal(comparison.columns.at(-1).snapshot,null);
  assert.ok(comparison.rows.every(row=>coverage(row,comparison.columns)<4));
  assert.ok(comparison.profile.providers.every(p=>p.scores['osworld:scoreRate']===null));
  assert.ok(comparison.rows.some(row=>row.id==='browser-use-cloud'));
  assert.ok(comparison.rows.some(row=>row.id==='browser-use-oss-claude-fable-5'));
  const empty=trackComparison(catalog,[],'browser-use');
  assert.equal(empty.columns.length,4);assert.equal(empty.rows.length,0);
  const ambiguous=structuredClone(reports);
  const bench=ambiguous.find(snapshot=>snapshot.benchmarks[0].id==='lexbench-webfetch'&&snapshot.version==='v2.1.0').benchmarks[0];
  bench.providers.push({...structuredClone(bench.providers.find(provider=>provider.id==='moli-1-1-17')),id:'moli-content-fixed'});
  assert.throws(()=>trackComparison(catalog,ambiguous,'webfetch'),/Ambiguous overview method/);
});


test('method search matches displayed Chinese names and bulk actions preserve other subsets',async()=>{
  const MethodSelector=require('../web/components/method-selector.tsx').default;
  const win=new Window();const previous=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
  const container=win.document.createElement('div');win.document.body.append(container);const root=require('react-dom/client').createRoot(container);
  const providers=[{id:'stagehand',name:'Stagehand · Open source / DeepSeek'},{id:'cloud',name:'Cloud'}];
  const t=text=>text==='Open source / DeepSeek'?'开源 / DeepSeek':text;
  let hidden=['outside'];const change=ids=>{hidden=ids;};
  try{
    await React.act(async()=>root.render(React.createElement(MethodSelector,{providers,hidden,onChange:change,t})));
    const search=container.querySelector('input[type="search"]');
    await React.act(async()=>{const setter=Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set;setter.call(search,'开源');search.dispatchEvent(new win.Event('input',{bubbles:true}));});
    assert.equal(container.querySelectorAll('.radar-legend label').length,1);
    assert.ok(container.querySelector('.radar-legend label').textContent.includes('Stagehand'));
    await React.act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Clear').click());
    assert.deepEqual([...hidden].sort(),['cloud','outside','stagehand']);
    await React.act(async()=>root.render(React.createElement(MethodSelector,{providers:[providers[0]],hidden,onChange:change,t})));
    await React.act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Clear').click());
    assert.deepEqual([...hidden].sort(),['cloud','outside','stagehand'],'clearing a subset cannot restore hidden methods outside it');
    await React.act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Select all').click());
    assert.deepEqual([...hidden].sort(),['cloud','outside'],'selecting a subset changes only its methods');
  }finally{await React.act(async()=>root.unmount());await win.happyDOM.close();[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});


test('every overview column keeps its sort and winner styles through reversal and coverage filtering', async () => {
  const {prepareData}=await import('../scripts/prepare-data.mjs'); await prepareData();
  const snapshots=JSON.parse(readFileSync(new URL('../web/public/results/reports.json',import.meta.url))).map(record=>record.report);
  const {trackComparison}=require('../web/lib/track-comparison.ts');
  const TrackResults=require('../web/components/track-results.tsx').default;
  const previous=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT];
  const cases=catalog.tracks.filter(track=>track.overview).flatMap(track=>(track.id==='websearch'?['L1','L2','L3']:['L1']).map(layer=>[track.id,layer]));
  try { for(const language of ['en','zh']) for(const [trackId,layer] of cases) {
    const win=new Window(); applyTableStyles(win);
    [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
    const container=win.document.createElement('div');win.document.body.append(container);
    const root=require('react-dom/client').createRoot(container);
    const comparison=trackComparison(catalog,snapshots,trackId,layer);
    const t=translator(language,catalog);
    try {
      await React.act(async()=>root.render(React.createElement(TrackResults,{catalog,snapshots,trackId,layer,onLayer:()=>{},t,language})));
      for(const completeOnly of [false,true]) {
        if(completeOnly) await React.act(async()=>container.querySelectorAll('.table-toolbar button')[1].click());
        const candidates=comparison.rows.filter(row=>!completeOnly||comparison.columns.every(col=>typeof row.results[col.info.id]?.provider.scores[col.metric.id]==='number'));
        for(const [index,col] of comparison.columns.entries()) {
          const button=container.querySelectorAll('.track-results .sort-button')[index];
          // Switch away first so each column starts with its declared best-first direction.
          if(index===0 && comparison.columns.length>1) await React.act(async()=>container.querySelectorAll('.track-results .sort-button')[1].click());
          await React.act(async()=>button.click());
          for(let reverse=0;reverse<2;reverse++) {
            const table=container.querySelector('.track-results');
            checkTableStyles(win,table,`${trackId}/${layer}/${language}`);
            const header=table.querySelectorAll('thead th[data-column]')[index];
            const direction=header.getAttribute('aria-sort')==='ascending'?'asc':'desc';
            const expectedDirection=reverse===0?col.metric.direction:(col.metric.direction==='asc'?'desc':'asc');
            assert.equal(direction,expectedDirection,`${trackId}/${layer}: ${col.metric.id} click ${reverse+1}`);
            const expected=[...candidates].sort((a,b)=>{
              const x=a.results[col.info.id]?.provider.scores[col.metric.id],y=b.results[col.info.id]?.provider.scores[col.metric.id];
              if(typeof x!=='number')return typeof y!=='number'?a.name.localeCompare(b.name):1;
              if(typeof y!=='number')return -1;
              return (direction==='asc'?x-y:y-x)||a.name.localeCompare(b.name);
            });
            const rows=[...table.querySelectorAll('tbody tr')];
            assert.deepEqual(rows.map(row=>row.dataset.provider),expected.map(row=>row.id));
            for(const [ci,column] of comparison.columns.entries()) {
              const values=candidates.map(row=>row.results[column.info.id]?.provider.scores[column.metric.id]).filter(value=>typeof value==='number');
              const eligible=column.benchmark?.rankable!==false && new Set(values).size>1;
              const best=column.metric.direction==='asc'?Math.min(...values):Math.max(...values);
              rows.forEach(row=>{
                const value=candidates.find(item=>item.id===row.dataset.provider).results[column.info.id]?.provider.scores[column.metric.id];
                assert.equal(row.querySelectorAll('td.numeric')[ci].classList.contains('best-value'),eligible&&value===best);
              });
            }
            await React.act(async()=>button.click());
          }
        }
      }
    } finally {await React.act(async()=>root.unmount());await win.happyDOM.close();}
  }} finally {[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});


test('switching overview columns starts lower-is-better metrics ascending', async () => {
  const {prepareData}=await import('../scripts/prepare-data.mjs');await prepareData();
  const snapshots=JSON.parse(readFileSync(new URL('../web/public/results/reports.json',import.meta.url))).map(record=>record.report);
  const lowerIsBetter=structuredClone(catalog);
  const info=lowerIsBetter.benchmarks.find(bench=>bench.id==='lexbench-zyte-product-extraction');
  for(const definition of info.definitions) definition.metrics.find(metric=>metric.id===definition.primaryMetric).direction='asc';
  const TrackResults=require('../web/components/track-results.tsx').default;
  const win=new Window();
  const previous=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
  const root=require('react-dom/client').createRoot(win.document.body);
  try {
    await React.act(async()=>root.render(React.createElement(TrackResults,{catalog:lowerIsBetter,snapshots,trackId:'webextract',layer:'L1',onLayer:()=>{},t:x=>x,language:'en'})));
    const button=win.document.querySelectorAll('.track-results .sort-button')[1];
    await React.act(async()=>button.click());
    assert.equal(button.closest('th').getAttribute('aria-sort'),'ascending');
    const winners=()=>[...win.document.querySelectorAll('.track-results tbody tr')].map(row=>row.querySelectorAll('td.numeric')[1]).filter(cell=>cell.classList.contains('best-value')).map(cell=>cell.querySelector('a').textContent);
    assert.deepEqual(winners(),['45.71%']);
    const rows=[...win.document.querySelectorAll('.track-results tbody tr')];
    assert.equal(rows[0].querySelectorAll('td.numeric')[1].querySelector('a').textContent,'45.71%');
    assert.equal(rows.at(-1).querySelectorAll('td.numeric')[1].textContent,'—');
    await React.act(async()=>button.click());
    assert.equal(button.closest('th').getAttribute('aria-sort'),'descending');
    assert.deepEqual(winners(),['45.71%'],'lower-is-better winner remains highlighted when order reverses');
  } finally {await React.act(async()=>root.unmount());await win.happyDOM.close();[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});

test('mixed overview radar uses only comparable axes and their coverage',async()=>{
  const {trackComparison}=require('../web/lib/track-comparison.ts');
  const TrackResults=require('../web/components/track-results.tsx').default;
  const previous=[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT];
  try{for(const excluded of ['reported','diagnostic']){
    const fixture=structuredClone(catalog);
    fixture.benchmarks.filter(info=>info.trackId==='browser-use').forEach(info=>info.definitions.forEach(definition=>{
      delete definition.comparisonMode;
      if(info.id==='osworld') {if(excluded==='reported')definition.comparisonMode='reported';else definition.rankable=false;}
    }));
    const snapshots=['bu-bench-v1','online-mind2web','webvoyager','osworld'].map(id=>load(id,'v1.0.0').snapshot);
    snapshots.at(-1).benchmarks[0].providers=snapshots.at(-1).benchmarks[0].providers.filter(provider=>provider.id!=='lexmount-browser-agent');
    const comparison=trackComparison(fixture,snapshots,'browser-use');
    const axes=excluded==='reported'?4:3;
    assert.equal(radarAxes(comparison.profile).length,axes,`${excluded}: only explicit diagnostic flags exclude axes`);
    const win=new Window();
    [globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=[win,win.document,true];
    const container=win.document.createElement('div');win.document.body.append(container);const root=require('react-dom/client').createRoot(container);
    try{
      await React.act(async()=>root.render(React.createElement(TrackResults,{catalog:fixture,snapshots,trackId:'browser-use',layer:'L1',onLayer:()=>{},t:x=>x,language:'en'})));
      const selector=container.querySelector('.method-selector .radar-legend');
      assert.equal(selector.textContent.includes('Ouroboros'),excluded==='reported','source provenance does not hide a measured method');
      assert.ok([...selector.querySelectorAll('label')].find(label=>label.textContent.includes('Lexmount Browser Agent')).textContent.includes(`3/${axes}`),'selector coverage counts only chart axes');
      const radar=container.querySelector('.overview-chart-controls button:nth-child(2)');
      assert.equal(radar.textContent,`Radar · ${excluded==='reported'?0:1} methods`,`${excluded}: missing scores remain missing`);
      await React.act(async()=>radar.click());
      assert.equal(container.querySelectorAll('.radar-shape').length,excluded==='reported'?0:1);
      if(excluded==='diagnostic') {
        assert.ok(container.querySelector('.insights-section').textContent.includes('3/3'));
        assert.ok(!container.querySelector('.radar-figure').textContent.includes('OSWorld'));
      }
      await React.act(async()=>container.querySelector('.table-toolbar .column-views button:nth-child(2)').click());
      assert.equal(container.querySelectorAll('.track-results tbody tr').length,0,'table complete-coverage filter still requires all four benchmarks');
    }finally{await React.act(async()=>root.unmount());await win.happyDOM.close();}
  }}finally{[globalThis.window,globalThis.document,globalThis.IS_REACT_ACT_ENVIRONMENT]=previous;}
});
