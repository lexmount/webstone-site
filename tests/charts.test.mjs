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
const { historicalResultCopy } = require("../web/lib/result-copy.ts");
const catalog = JSON.parse(readFileSync(new URL("../benchmarks/catalog.json", import.meta.url)));

function load(id, version = "v1") {
  const snapshot = JSON.parse(readFileSync(new URL(`../results/${id}/${id}-${version}-report.json`, import.meta.url)));
  return { snapshot, benchmark: resolveBenchmark(catalog, snapshot.benchmarks[0]) };
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
    if (radarAxes(benchmark).filter(axis => axis.defaultSelected).length < 3) {
      assert.equal(html, '', file);
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
    assert.equal(axes.some(axis => axis.id === "meanTime"), benchmark.metrics.find(metric => metric.id === "meanTime")?.highlightBest !== false);
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
  assert.equal(tracks.length, 4);
  assert.equal(tracks.flatMap(track => track.benchmarks).length, 8);
  assert.equal(tracks.flatMap(track => track.views).length, 12);
  const articles = evaluationReports(catalog, snapshots);
  assert.ok(articles.every((article, i) => i === 0 || article.date <= articles[i - 1].date));
  assert.equal(new Set(articles.map(article => article.href)).size, articles.length);
  assert.equal(articles[0].date, "2026-11-10");
  assert.equal(articles.at(-1).date, "2026-09-20");
  assert.ok(articles.every(report => Number.isFinite(Date.parse(report.publishedAt))));
  assert.deepEqual(tracks.map(track => track.id), ["websearch", "webextract", "webfetch", "trajectory-replay"]);
  assert.deepEqual(tracks.find(track => track.id === "trajectory-replay").benchmarks.map(bench => bench.id),
    ["webarena-verified", "lexbench-headless-372"]);
  for (const view of catalog.benchmarks) {
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

test("published historical editions have Chinese and English evaluation notes", async () => {
  const { discoverResults } = await import("../scripts/prepare-data.mjs");
  const { fileURLToPath } = await import("node:url");
  const files = await discoverResults(fileURLToPath(new URL("../results", import.meta.url)), catalog);
  for (const { file } of files) {
    const snapshot = JSON.parse(readFileSync(new URL(`../results/${file}`, import.meta.url)));
    for (const language of ["en", "zh"]) {
      const copy = historicalResultCopy(snapshot.id, language);
      if (!snapshot.release) assert.ok(copy?.scope && copy.notes.every(note => note.trim()), file);
    }
  }
});

test("report pagination keeps a growing archive to six cards and exposes every report", async (t) => {
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
    assert.equal(titles().length, 6);
    assert.ok(buttons()[0].disabled);
    assert.match(titles()[0], /Report 1\s/);
    await React.act(async () => buttons()[1].click());
    assert.equal(titles().length, 6);
    assert.match(titles()[0], /Report 7\s/);
    await React.act(async () => buttons()[1].click());
    assert.equal(titles().length, 3);
    assert.match(titles()[2], /Report 15\s/);
    assert.ok(buttons()[1].disabled);
    await React.act(async () => buttons()[0].click());
    assert.match(titles()[0], /Report 7\s/);
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
  const { EVALUATION_URL, SUBMISSION_URL } = require("../web/lib/overview.ts");
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
    assert.deepEqual(links.map(link => link.getAttribute("href")), [EVALUATION_URL, SUBMISSION_URL, "https://huggingface.co/datasets?author=Lexmount"]);
    assert.ok(links.every(link => link.querySelector("svg") && link.textContent.trim()));
    const star = container.querySelector(".sidebar-footer .nav-star");
    assert.ok(star);
    assert.equal(star.href, "https://github.com/lexmount/webstone");
    assert.equal(container.querySelector(".brand img").getAttribute("src"), "/brand/webstone.png");
    assert.match(star.getAttribute("aria-label"), /Star Webstone/);
    const groups = [...container.querySelectorAll(".grouped-navigation > .nav-group")];
    assert.deepEqual(groups.map(group => group.querySelector("h2").textContent), ["Web Tools", "Browser Capabilities", "Browser Automation"]);
    assert.deepEqual(groups.map(group => group.querySelectorAll(".nav-track").length), [2, 2, 0]);
    assert.deepEqual(groups.map(group => group.querySelectorAll(".nav-upcoming").length), [1, 0, 1]);
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
        const definition = resolveBenchmark(catalog, report.benchmarks[0]);
        const { twoAxisComparison } = require("../web/components/insights.tsx");
        const isPair = Boolean(twoAxisComparison(definition, radarAxes(definition)));
        assert.equal(table.className, "wide-table", report.id);
        const hasProfile = radarAxes(resolveBenchmark(catalog, report.benchmarks[0])).filter(axis => axis.defaultSelected).length >= 3;
        assert.equal(container.querySelectorAll(".metric-selector").length, Number(hasProfile), report.id);
        assert.equal(table.querySelectorAll("th")[1].textContent, "Method", report.id);
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
        assert.ok(initialAxes >= 3, report.id);
        for (const input of [...chartMenu.querySelectorAll("input")].filter(input => input.checked)) {
          await React.act(async () => input.click());
        }
        assert.equal(container.querySelectorAll(".radar-axis").length, 0, report.id);
        assert.match(container.querySelector(".chart-empty").textContent, /at least three/, report.id);
        await React.act(async () => chartMenu.querySelector("button").click());
        assert.equal(container.querySelectorAll(".radar-axis").length, initialAxes, report.id);

        const summary = chartMenu.querySelector("summary");
        chartMenu.open = true;
        await React.act(async () => container.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true })));
        assert.ok(!chartMenu.open, report.id);
        chartMenu.open = true;
        await React.act(async () => summary.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        assert.ok(!chartMenu.open, report.id);

        }
        await React.act(async () => [...container.querySelectorAll(".language-control button")].find(button => button.textContent === "中文").click());
        assert.equal(table.querySelectorAll("th")[1].textContent, "方案", report.id);
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
  assert.deepEqual(groups[0].upcoming.map(track=>track.id),["webfetch-api"]);
  assert.deepEqual(groups[2].upcoming.map(track=>track.id),["browser-use"]);
  assert.equal(groups[2].tracks.length,0);
  const published=trackOverview(catalog);
  assert.equal(published.length,4);assert.equal(published.flatMap(track=>track.benchmarks).length,8);
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
    assert.match(win.document.querySelector('.overview-star-note').textContent,/觉得 Webstone 有用/);
    assert.match([...win.document.querySelectorAll('.upcoming-track')].map(item=>item.textContent).join(' '),/Browser Automation/);
    assert.match(win.document.querySelector('.upcoming-track').textContent,/开发中/);
    assert.equal(win.document.querySelectorAll('.track-card[data-track]').length,4);
    assert.equal(win.document.querySelectorAll('.track-overview-grid > .track-card.upcoming-track').length,2);
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
    assert.deepEqual(stats,[['评测方向',4],['评测基准',8],['评测报告',6]]);
    const logo=readFileSync(new URL('../web/public/brand/webstone.png',import.meta.url));
    assert.deepEqual([...logo.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
    assert.match(readFileSync(new URL('../README.md',import.meta.url),'utf8'),/web\/public\/brand\/webstone\.png/);
    assert.match(readFileSync(new URL('../README.md',import.meta.url),'utf8'),/^# Webstone Site\n/);
    for (const language of ['en', 'zh']) {
      const t = translator(language, catalog);
      win.document.body.innerHTML = renderToStaticMarkup(React.createElement(Home, { catalog, snapshots, t, language }));
      const hero = win.document.querySelector('.overview-hero').textContent;
      assert.ok(hero.includes(t("Find the right tools for your agent to browse the web.")));
      assert.ok(hero.includes(t("The touchstone for your agent's web browsing.")));
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
      assert.ok([...win.document.querySelectorAll('tbody .rank-cell')].every(cell=>cell.textContent==='—'));
      assert.match(win.document.querySelector('.leaderboard').textContent,language==='EN'?/Different test conditions/:/测试条件不同/);
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
    const example = benchmark.example;
    assert.ok(example, `${benchmark.id}: missing example`);
    assert.ok(example.taskId && example.input && example.output && example.check);
    assert.ok(example.steps.length >= 2);
    assert.match(example.sourceUrl, /^https:\/\/huggingface\.co\/datasets\/Lexmount\/[^/]+\/blob\/[a-f0-9]{40}\//);
    assert.ok(example.outputLabel, 'Reference output must be distinguished from measured output');
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
        const check = (expanded) => {
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
            const expected = benchmark.rankable === false || metric.highlightBest === false || !varied ? 0 : values.filter(value => value === best).length;
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
  assert.match(reference, /Reference values are not a measured result/);
});

test("capability profiles do not turn non-comparable timing into an efficiency advantage", () => {
  for (const id of ['webmainbench', 'lexbench-websearch']) {
    const { benchmark } = load(id, id === 'webmainbench' ? 'v2.1.0' : 'v2');
    const axes = radarAxes(benchmark);
    for (const metric of benchmark.metrics.filter(item => ['ms', 'seconds', 'mib', 'usd'].includes(item.unit) && item.highlightBest === false)) {
      assert.ok(!axes.some(axis => axis.id === metric.id), `${id}: ${metric.id} is not a comparable efficiency axis`);
    }
  }
  const { benchmark } = load('webarena-verified', 'v1.1.0');
  assert.ok(radarAxes(benchmark).filter(axis => axis.defaultSelected).every(axis => !/p50|p95/i.test(axis.id)));
  const single = load('simpleqa-verified-excerpts', 'v2.0.0').benchmark;
  assert.equal(render(single), '', 'One quality dimension does not need a radar assembled from incomparable timings');
});

test("two-metric quality and cost benchmarks plot disclosed costs and preserve undisclosed methods", async () => {
  const sample = resolveBenchmark(catalog, {
    id: "bu-bench-v1",
    definitionId: "standard",
    taskCount: 100,
    notes: [],
    reportUrl: null,
    providers: [
      { id: "cook-browser-desktop", name: "Cook Browser Desktop", description: "Cook", mode: "Reported", passed: null, scores: { successRate: 94.0, costPerTask: null } },
      { id: "lexmount-browser-agent", name: "Lexmount Browser Agent", description: "Lexmount", mode: "Code agent", passed: null, scores: { successRate: 93.41, costPerTask: 0.1 } },
      { id: "browser-use-oss-claude-fable-5", name: "Browser Use OSS + Claude Fable 5", description: "BU OSS", mode: "Reported", passed: null, scores: { successRate: 80.0, costPerTask: 5.81 } },
    ],
  });
  const parseSeries = html => [...html.matchAll(/<g class="radar-series"[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)].map(match => {
    const circle = /<circle[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"/.exec(match[2]);
    const text = /<text[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*text-anchor="([^"]+)"[^>]*class="comparison-value"/.exec(match[2]);
    return {
      label: match[1],
      cx: circle ? Number(circle[1]) : null,
      cy: circle ? Number(circle[2]) : null,
      lx: text ? Number(text[1]) : null,
      ly: text ? Number(text[2]) : null,
      anchor: text ? text[3] : null,
    };
  });

  const en = render(sample);
  assert.match(en, /aria-label="Capability profile"/);
  assert.match(en, /Undisclosed/);
  assert.equal((en.match(/class="radar-series"/g) ?? []).length, 3);
  assert.equal((en.match(/is-undisclosed/g) ?? []).length, 1);
  assert.doesNotMatch(en, /NaN|Infinity|at least three/);
  const logSeries = parseSeries(en);
  const lexPoint = logSeries.find(item => item.label.startsWith("Lexmount Browser Agent"));
  const buPoint = logSeries.find(item => item.label.startsWith("Browser Use OSS"));
  for (const item of [lexPoint, buPoint]) {
    assert.ok(item && Number.isFinite(item.cx) && Number.isFinite(item.cy));
    assert.ok(Number.isFinite(item.lx) && Number.isFinite(item.ly));
  }
  assert.ok(lexPoint.cx > 68 && lexPoint.cx < 432 && buPoint.cx > 68 && buPoint.cx < 432);
  assert.ok(lexPoint.cy >= 28 && lexPoint.cy <= 272 && buPoint.cy >= 28 && buPoint.cy <= 272);
  assert.ok(lexPoint.cx < buPoint.cx, "$0.10 point must plot left of $5.81 point");
  assert.ok(lexPoint.cy < buPoint.cy, "higher success rate must plot above lower success rate");

  const zh = render(sample, translator("zh", catalog));
  assert.match(zh, /未公布/);
  assert.match(zh, /每题成本/);
  assert.match(zh, /成功率/);
  const singleCost = { ...sample, providers: sample.providers.filter(p => p.id !== "browser-use-oss-claude-fable-5") };
  assert.doesNotMatch(render(singleCost), /NaN|Infinity/);

  const zeroCostSample = {
    ...sample,
    providers: [
      { id: "free-agent", name: "Free Agent", description: "Free", mode: "Reported", passed: null, scores: { successRate: 95.0, costPerTask: 0 } },
      { id: "paid-agent", name: "Paid Agent", description: "Paid", mode: "Reported", passed: null, scores: { successRate: 85.0, costPerTask: 0.5 } },
    ],
  };
  const linearHtml = render(zeroCostSample);
  assert.doesNotMatch(linearHtml, /NaN|Infinity/);
  const linearSeries = parseSeries(linearHtml);
  const freePoint = linearSeries.find(item => item.label.startsWith("Free Agent"));
  const paidPoint = linearSeries.find(item => item.label.startsWith("Paid Agent"));
  for (const item of [freePoint, paidPoint]) {
    assert.ok(item && Number.isFinite(item.cx) && Number.isFinite(item.cy));
    assert.ok(Number.isFinite(item.lx) && Number.isFinite(item.ly));
  }
  assert.ok(freePoint.cx > 68 && freePoint.cx < 432 && paidPoint.cx > 68 && paidPoint.cx < 432);
  assert.ok(freePoint.cx < paidPoint.cx, "$0.00 point must plot left of $0.50 point under linear scaling");
  assert.ok(freePoint.cy < paidPoint.cy, "95% must plot above 85%");

  const clusteredDisclosed = {
    ...sample,
    providers: [
      { id: "tied-a", name: "Tied A", description: "A", mode: "Reported", passed: null, scores: { successRate: 90.0, costPerTask: 1.0 } },
      { id: "tied-b", name: "Tied B", description: "B", mode: "Reported", passed: null, scores: { successRate: 90.0, costPerTask: 1.0 } },
      { id: "nearby-c", name: "Nearby C", description: "C", mode: "Reported", passed: null, scores: { successRate: 90.1, costPerTask: 1.0 } },
    ],
  };
  const clusteredSeries = parseSeries(render(clusteredDisclosed));
  assert.equal(clusteredSeries.length, 3);
  const tiedA = clusteredSeries.find(item => item.label.startsWith("Tied A"));
  const tiedB = clusteredSeries.find(item => item.label.startsWith("Tied B"));
  const nearbyC = clusteredSeries.find(item => item.label.startsWith("Nearby C"));
  for (const item of [tiedA, tiedB, nearbyC]) {
    assert.ok(item, "every clustered disclosed series must be present");
    assert.ok(Number.isFinite(item.cx) && Number.isFinite(item.cy), "marker coordinates must be finite");
    assert.ok(Number.isFinite(item.lx) && Number.isFinite(item.ly), "label coordinates must be finite");
    assert.ok(["start", "middle", "end"].includes(item.anchor), "label anchor must be set");
    assert.ok(item.cx > 68 && item.cx < 432, `disclosed cx ${item.cx} stays inside plot area`);
  }
  assert.equal(tiedA.cx, tiedB.cx, "equal-cost providers must align on the same x coordinate");
  assert.equal(tiedB.cx, nearbyC.cx, "all equal-cost providers must align on the same x coordinate");
  assert.ok(nearbyC.cy < tiedA.cy, "higher score must plot above lower score even when cost is tied");

  const labelRects = clusteredSeries.map(item => {
    const w = 90;
    let left = item.lx - w / 2;
    if (item.anchor === "start") left = item.lx;
    else if (item.anchor === "end") left = item.lx - w;
    return { left, right: left + w, top: item.ly - 11, bottom: item.ly + 3 };
  });
  for (let i = 0; i < labelRects.length; i++) {
    for (let j = i + 1; j < labelRects.length; j++) {
      const a = labelRects[i], b = labelRects[j];
      assert.equal(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, false, "clustered disclosed labels must not overlap");
    }
  }

  const extraUnreportedMetric = {
    ...sample,
    metrics: [
      ...sample.metrics,
      { id: "meanTime", label: "Mean time", unit: "seconds", direction: "asc", decimals: 1, description: "Optional latency." },
    ],
    providers: sample.providers.map(provider => ({
      ...provider,
      scores: { ...provider.scores, meanTime: null },
    })),
  };
  const extraMetricHtml = render(extraUnreportedMetric);
  assert.doesNotMatch(extraMetricHtml, /at least three|NaN|Infinity/);
  assert.equal((extraMetricHtml.match(/class="radar-series"/g) ?? []).length, 3);
  assert.equal((extraMetricHtml.match(/is-undisclosed/g) ?? []).length, 1);

  const denseTopCluster = {
    ...sample,
    providers: Array.from({ length: 8 }, (_, index) => ({
      id: `top-tied-${index + 1}`,
      name: `Top Tied ${index + 1}`,
      description: `Top Tied ${index + 1}`,
      mode: "Reported",
      passed: null,
      scores: { successRate: 100.0, costPerTask: 1.0 },
    })),
  };
  const denseSeries = parseSeries(render(denseTopCluster));
  assert.equal(denseSeries.length, 8, "all 8 tied top-edge providers remain accessible series");
  const densePlaced = denseSeries.filter(item => item.lx !== null && item.ly !== null);
  assert.ok(densePlaced.length >= 3, "places multiple non-overlapping labels around dense top cluster");
  const denseRects = densePlaced.map(item => {
    assert.ok(Number.isFinite(item.lx) && Number.isFinite(item.ly) && ["start", "middle", "end"].includes(item.anchor));
    const w = 96;
    let left = item.lx - w / 2;
    if (item.anchor === "start") left = item.lx;
    else if (item.anchor === "end") left = item.lx - w;
    assert.ok(left >= 62 && left + w <= 438, "rendered label stays inside disclosed plot width");
    assert.ok(item.ly - 11 >= 22 && item.ly + 3 <= 280, "rendered label stays inside disclosed plot height");
    return { left, right: left + w, top: item.ly - 11, bottom: item.ly + 3 };
  });
  for (let i = 0; i < denseRects.length; i++) {
    for (let j = i + 1; j < denseRects.length; j++) {
      const a = denseRects[i], b = denseRects[j];
      assert.equal(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, false, "dense top-edge labels must never overlap");
    }
  }

  const extremeStability = {
    ...sample,
    providers: [
      { id: "free-extreme", name: "Free Extreme", description: "Free", mode: "Reported", passed: null, scores: { successRate: 98.0, costPerTask: 0 } },
      { id: "mid-agent", name: "Mid Agent", description: "Mid", mode: "Reported", passed: null, scores: { successRate: 90.0, costPerTask: 0.1 } },
      { id: "expensive-low", name: "Expensive Low", description: "Expensive", mode: "Reported", passed: null, scores: { successRate: 72.0, costPerTask: 5.0 } },
    ],
  };
  const win = new Window();
  const previousDom = [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT];
  [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = [win, win.document, true];
  const host = win.document.createElement("div");
  win.document.body.append(host);
  const root = require("react-dom/client").createRoot(host);
  try {
    await React.act(async () => root.render(React.createElement(Insights, { benchmark: extremeStability, t: text => text })));
    const coordsByName = () => Object.fromEntries([...host.querySelectorAll("g.radar-series")].map(group => {
      const circle = group.querySelector("circle");
      return [group.getAttribute("aria-label").split(" · ")[0], `${circle.getAttribute("cx")},${circle.getAttribute("cy")}`];
    }));
    const toggleFor = name => [...host.querySelectorAll(".radar-legend label")].find(label => label.textContent === name).querySelector("input");
    const before = coordsByName();
    await React.act(async () => toggleFor("Free Extreme").click());
    const withoutZero = coordsByName();
    assert.equal(withoutZero["Free Extreme"], undefined);
    assert.equal(withoutZero["Mid Agent"], before["Mid Agent"], "hiding sole zero-cost provider must not trigger linear-to-log rescale");
    assert.equal(withoutZero["Expensive Low"], before["Expensive Low"], "hiding sole zero-cost provider must preserve coordinates");

    await React.act(async () => toggleFor("Free Extreme").click());
    await React.act(async () => toggleFor("Expensive Low").click());
    const withoutExtreme = coordsByName();
    assert.equal(withoutExtreme["Expensive Low"], undefined);
    assert.equal(withoutExtreme["Free Extreme"], before["Free Extreme"], "hiding unique max-cost/min-quality extreme must preserve coordinates");
    assert.equal(withoutExtreme["Mid Agent"], before["Mid Agent"], "hiding unique extreme must not rescale remaining markers");
  } finally {
    await React.act(async () => root.unmount());
    await win.happyDOM.close();
    [globalThis.window, globalThis.document, globalThis.IS_REACT_ACT_ENVIRONMENT] = previousDom;
  }

  const allCostsNull = {
    ...sample,
    providers: sample.providers.map(provider => ({ ...provider, scores: { ...provider.scores, costPerTask: null } })),
  };
  const undisclosedOnly = render(allCostsNull);
  assert.equal((undisclosedOnly.match(/class="radar-series"/g) ?? []).length, 3);
  assert.equal((undisclosedOnly.match(/is-undisclosed/g) ?? []).length, 3);
  assert.doesNotMatch(undisclosedOnly, /at least three|NaN|Infinity/);

  const withMissingPrimary = {
    ...sample,
    providers: [
      ...sample.providers.slice(0, 1),
      { id: "cost-only-agent", name: "Cost Only Agent", description: "Cost only", mode: "Reported", passed: null, scores: { successRate: null, costPerTask: 0.25 } },
    ],
  };
  const mixed = render(withMissingPrimary);
  assert.equal((mixed.match(/class="radar-series"/g) ?? []).length, 2);
  assert.equal((mixed.match(/<circle /g) ?? []).length, 1);
  assert.match(mixed, /Cost Only Agent · Success rate: — · Cost \/ task: \$0\.25/);
  assert.doesNotMatch(mixed, /Selected methods do not disclose the primary quality metric|NaN|Infinity/);

  const onlyMissingPrimary = {
    ...sample,
    providers: [
      { id: "cost-only-agent", name: "Cost Only Agent", description: "Cost only", mode: "Reported", passed: null, scores: { successRate: null, costPerTask: 0.25 } },
    ],
  };
  const emptyPrimary = render(onlyMissingPrimary);
  assert.equal((emptyPrimary.match(/class="radar-series"/g) ?? []).length, 1);
  assert.equal((emptyPrimary.match(/<circle /g) ?? []).length, 0);
  assert.match(emptyPrimary, /Selected methods do not disclose the primary quality metric\./);
  assert.match(render(onlyMissingPrimary, translator("zh", catalog)), /所选方案未公布主质量指标。/);

  const tiedUndisclosed = {
    ...sample,
    providers: ["alpha", "beta", "gamma", "delta"].map(name => ({
      id: `tied-${name}`,
      name: `Tied ${name}`,
      description: `Tied ${name}`,
      mode: "Reported",
      passed: null,
      scores: { successRate: 90.0, costPerTask: null },
    })),
  };
  const tiedSvg = render(tiedUndisclosed);
  const circlePositions = [...tiedSvg.matchAll(/<circle[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"/g)].map(match => `${match[1]},${match[2]}`);
  assert.equal(circlePositions.length, 4);
  assert.equal(new Set(circlePositions).size, 4);
  for (const pair of circlePositions) {
    const cx = Number(pair.split(",")[0]);
    assert.ok(cx >= 468 && cx <= 580, `undisclosed cx ${cx} stays inside rail`);
  }
});
