"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, CircleDashed, Layers3, Menu, Star } from "lucide-react";
import { canonicalVersion, benchmarkEntries, bestValue, formatMetric, formatPricing, isBestValue, latestEntry, reportEntries, resolveBenchmark, selectEntry, sortProviders, type Catalog, type Entry, type Metric, type Provider, type ReportFile, type Snapshot } from "../lib/results";
import { providerColors } from "../lib/presentation";
import ExampleDialog from "./example-dialog";
import InfoTooltip from "./info-tooltip";
import Insights from "./insights";
import MethodDetails from "./method-details";
import ReleaseCheck from "./release-check";
import { RELEASE, BUILT_AT } from "../lib/release.generated";
import { translator } from "../lib/i18n";
import { useLanguage } from "../lib/use-language";
import { historicalResultCopy } from "../lib/result-copy";
import { historicalPublication } from "../lib/historical-publications";
import { decisionMetrics, hasPricingInformation } from "../lib/comparisons";

import Home, { EvaluationReports, TRACK_ICONS } from "./home";
import { benchmarkHref, DATASETS_URL, EVALUATION_URL, SUBMISSION_URL, WEBSTONE_REPOSITORY_URL, navigationGroups } from "../lib/overview";
const GITHUB_URL = "https://github.com/lexmount/webstone-site";
const LEGACY_DATE_NOTE = "The evaluation date was not supplied; the displayed date is the date of import.";
type Selection = { benchmark: string; version: string; metric: string };

export default function Dashboard() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selection, setSelection] = useState<Selection>({ benchmark: "", version: "", metric: "" });
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, chooseLanguage] = useLanguage();
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showCategories, setShowCategories] = useState(true);
  const [showExample, setShowExample] = useState(false);
  const [moreMetrics, setMoreMetrics] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [catalogResponse, resultsResponse] = await Promise.all([fetch(`/benchmarks/catalog.json?release=${RELEASE}`, { cache: "no-store" }), fetch(`/results/reports.json?release=${RELEASE}`, { cache: "no-store" })]);
        if (!catalogResponse.ok || !resultsResponse.ok) throw new Error("Unable to load result data.");
        const benchmarkCatalog: Catalog = await catalogResponse.json();
        const files: ReportFile[] = await resultsResponse.json();
        const resultEntries = reportEntries(files);
        const records = files.map(item => item.report);
        if (!active) return;
        setCatalog(benchmarkCatalog);
        setEntries(resultEntries);
        setSnapshots(records);
        const params = new URLSearchParams(window.location.search);
        const candidate = params.get("benchmark");
        const benchmark = benchmarkCatalog.benchmarks.find(item => item.id === candidate)?.id ?? "";
        if (!benchmark) return;
        const requestedVersion = params.get("version");
        const selectedEntry = requestedVersion
          ? selectEntry(resultEntries, requestedVersion, benchmark)
          : latestEntry(resultEntries, benchmark);
        const version = selectedEntry ? canonicalVersion(selectedEntry.version) : requestedVersion ?? "";
        const selectedResult = records.find(record => record.id === selectedEntry?.id)?.benchmarks.find(item => item.id === benchmark);
        const selectedBenchmark = selectedResult ? resolveBenchmark(benchmarkCatalog, selectedResult) : null;
        const selectedMetric = (selectedBenchmark ? decisionMetrics(selectedBenchmark, true, selectedBenchmark.primaryMetric) : []).find(item => item.id === params.get("metric")) ?? selectedBenchmark?.metrics.find(item => item.id === selectedBenchmark.primaryMetric);
        setSelection({
          benchmark,
          version,
          metric: selectedMetric?.id ?? "passRate",
        });
        setDirection(selectedMetric?.direction ?? "desc");
      } catch {
        if (active) setError("Unable to load results. Please try again.");
      }
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!entries || !selection.benchmark) return;
    const params = new URLSearchParams({ benchmark: selection.benchmark });
    if (selection.version) params.set("version", selection.version);
    params.set("metric", selection.metric);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [selection, entries]);

  const entry = entries ? selectEntry(entries, selection.version, selection.benchmark) : null;
  const snapshot = snapshots.find(item => item.id === entry?.id) ?? null;
  const t = translator(language, catalog, snapshot);
  const result = snapshot?.benchmarks.find(item => item.id === selection.benchmark);
  const benchmark = catalog && result ? resolveBenchmark(catalog, result) : null;
  const historical = snapshot && !snapshot.release ? historicalPublication(snapshot.id) : undefined;
  const historicalCopy = snapshot ? historicalResultCopy(snapshot.id, language) : null;
  const evaluationNotes = historicalCopy?.notes ?? benchmark?.notes.filter(note => note !== LEGACY_DATE_NOTE).map(t) ?? [];
  const details = catalog?.benchmarks.find(item => item.id === selection.benchmark);
  const groups = catalog ? navigationGroups(catalog) : [];
  const tracks = groups.flatMap(group => group.tracks);
  const track = tracks.find(item => item.id === details?.trackId);
  const metric = benchmark?.metrics.find(item => item.id === selection.metric) ?? benchmark?.metrics.find(item => item.id === benchmark.primaryMetric) ?? benchmark?.metrics[0];
  const versionEntries = entries ? benchmarkEntries(entries, selection.benchmark) : [];
  const versions = versionEntries.map(item => canonicalVersion(item.version));
  const providers = benchmark && metric ? sortProviders(benchmark.providers, metric.id, direction) : [];
  const categories = showCategories ? benchmark?.categories ?? [] : [];
  const primaryMetric = benchmark?.metrics.find(item => item.id === benchmark.primaryMetric);
  const visibleMetrics = benchmark ? decisionMetrics(benchmark, moreMetrics, selection.metric) : [];
  const leadingMetrics = benchmark && primaryMetric
    ? [primaryMetric, ...visibleMetrics.filter(item => item.id !== primaryMetric.id && isDecisionColumn(item))]
    : [];
  const trailingMetrics = benchmark
    ? visibleMetrics.filter(item => item.id !== primaryMetric?.id && !isDecisionColumn(item))
    : [];
  const metricBest = new Map((benchmark?.metrics ?? []).map(item => [item.id, benchmark?.rankable === false || item.highlightBest === false ? null : bestValue((benchmark?.providers ?? []).map(provider => provider.scores[item.id]), item.direction)]));
  const categoryBest = new Map(categories.map(category => [category.id, benchmark?.rankable === false ? null : bestValue((benchmark?.providers ?? []).map(provider => provider.categoryPassed?.[category.id] ?? null), "desc")]));
  const passedBest = benchmark?.rankable === false ? null : bestValue((benchmark?.providers ?? []).map(provider => provider.passed), "desc");
  const showPassed = showCategories && (benchmark?.providers.some(provider => provider.passed !== null && provider.passed !== undefined) ?? false);
  const showPricing = benchmark?.providers.some(hasPricingInformation) ?? false;
  const hasNumericCost = benchmark?.metrics.some(item => item.unit === "usd" && benchmark.providers.some(provider => {
    const amount = provider.scores[item.id];
    return amount !== null && amount !== undefined;
  })) ?? false;
  function isDecisionColumn(item: Metric) {
    return benchmark?.leadingMetricIds?.includes(item.id) || ["seconds", "ms", "mib", "usd"].includes(item.unit);
  }

  function chooseBenchmark(id: string) {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    setShowCategories(true);
    setMoreMetrics(false);
    const latest = entries ? latestEntry(entries, id) : null;
    const version = latest ? canonicalVersion(latest.version) : "";
    const selectedResult = snapshots.find(record => record.id === latest?.id)?.benchmarks.find(item => item.id === id);
    const selected = catalog && selectedResult ? resolveBenchmark(catalog, selectedResult) : null;
    const primary = selected?.metrics.find(item => item.id === selected.primaryMetric);
    setSelection({ benchmark: id, version, metric: primary?.id ?? "passRate" });
    setDirection(primary?.direction ?? "desc");
    setMenuOpen(false);
    setSelectedProvider(null);
    setShowExample(false);
  }

  function chooseVersion(version: string) {
    setMoreMetrics(false);
    setShowCategories(true);
    setSelectedProvider(null);
    setShowExample(false);
    const selectedEntry = entries ? selectEntry(entries, version, selection.benchmark) : null;
    const selectedResult = snapshots.find(record => record.id === selectedEntry?.id)?.benchmarks.find(item => item.id === selection.benchmark);
    const selected = catalog && selectedResult ? resolveBenchmark(catalog, selectedResult) : null;
    const selectedMetric = (selected ? decisionMetrics(selected, true, selected.primaryMetric) : []).find(item => item.id === selection.metric) ?? selected?.metrics.find(item => item.id === selected.primaryMetric);
    setSelection(current => ({ ...current, version, metric: selectedMetric?.id ?? current.metric }));
    if (selectedMetric && selectedMetric.id !== selection.metric) setDirection(selectedMetric.direction);
  }

  function metricDescription(item: Metric) {
    const original = details?.definitions.find(definition => definition.id === result?.definitionId)?.metrics.find(metric => metric.id === item.id);
    const sample = result?.metricSamples?.[item.id];
    return [t(original?.description ?? ""), item.unit === "ratio" ? t("Displayed as a percentage; source scores use a 0–1 scale.") : "", sample?.sampleCount == null ? "" : `${sample.sampleCount} ${t("samples")}.`,
      sample?.scope === "all-search-calls" ? t("Shared across both query sets.") : "", sample?.note ? t(sample.note) : ""].filter(Boolean).join(" ");
  }

  function metricHeader(item: Metric) {
    const selected = metric?.id === item.id;
    return <th key={item.id} scope="col" aria-sort={selected ? (direction === "asc" ? "ascending" : "descending") : "none"} className={selected ? "sorted" : undefined}>
      <div className="metric-heading">
        <button className={`sort-button ${selected ? "selected" : ""}`} onClick={() => {
          setDirection(selected ? (direction === "desc" ? "asc" : "desc") : item.direction);
          setSelection(current => ({ ...current, metric: item.id }));
        }}>{t(item.label)}<ArrowDown size={13} style={{ transform: selected && direction === "asc" ? "rotate(180deg)" : undefined }} /></button>
        {item.description && <InfoTooltip label={t(item.label)} description={metricDescription(item)} detailsLabel={t("details")} />}
      </div>
    </th>;
  }

  function metricCell(provider: Provider, item: Metric) {
    const value = provider.scores[item.id];
    const isBest = isBestValue(value, metricBest.get(item.id) ?? null);
    return <td key={item.id} className={`numeric ${item.id === metric?.id ? "primary-number" : ""} ${isBest ? "best-value" : ""}`}
      title={[isBest ? t("Best in this column") : "", value == null ? t("Not disclosed in the source") : "", provider.counts?.[item.id] ? `${provider.counts[item.id].count} / ${provider.counts[item.id].total}` : ""].filter(Boolean).join(" · ") || undefined}
    >{item.unit === "usd" && catalog?.pricingSources?.[provider.id]?.length ? <div className="metric-heading"><span>{formatMetric(value, item.unit, item.decimals, item.signed)}</span><InfoTooltip label={`${provider.name} · ${t("Billing basis")}`} description={t(provider.billingDescription ?? "The table retains the evaluation report’s quoted price. Official rates may change.")} sources={catalog.pricingSources[provider.id]} sourcesLabel={t("Official pricing")} detailsLabel={t("details")} /></div> : formatMetric(value, item.unit, item.decimals, item.signed, provider.counts?.[item.id])}{isBest && <span className="sr-only"> {t("Best in this column")}</span>}</td>;
  }

  return <div className="app-shell">
    <ReleaseCheck />
    <a className="skip-link" href="#main">{t("Skip to results")}</a>
    {menuOpen && <button className="sidebar-scrim" aria-label={t("Close navigation")} onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <a href="/" className="brand" aria-label={t("Webstone home")}><span className="brand-heading"><span className="brand-mark" aria-hidden="true"><img src="/brand/webstone.png" alt="" width={1536} height={820} /></span><span>Webstone</span></span></a>
      <nav className="grouped-navigation" aria-label={t("Benchmark navigation")}>{groups.map(group => <section key={group.id} className="nav-group" aria-labelledby={`navigation-${group.id}`}><h2 id={`navigation-${group.id}`}>{t(group.name)}</h2>{group.tracks.map(item => {
        const Icon = TRACK_ICONS[item.id] ?? Layers3;
        if (item.url) return <a key={item.id} className="nav-item" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${t(item.name)} (${t("opens in a new tab")})`}>
          <Icon size={17} aria-hidden="true" /><span className="track-name">{t(item.name)}<span>{t(item.description)}</span></span><ArrowUpRight className="track-external" size={14} aria-hidden="true" />
        </a>;
        return <div key={item.id} className="nav-track"><button
          className={`nav-item ${track?.id === item.id ? "active" : ""}`}
          aria-current={track?.id === item.id ? "page" : undefined}
          onClick={() => { if (track?.id === item.id) { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); setMenuOpen(false); } else if (!selection.benchmark) window.location.assign(benchmarkHref(item.benchmarks[0].id)); else chooseBenchmark(item.benchmarks[0].id); }}
        ><Icon size={17} /><span className="track-name">{t(item.name)}<span>{t(item.description)}</span></span></button>

        </div>;
      })}{group.upcoming.map(item => <div key={item.id} className="nav-upcoming">
        <CircleDashed size={16} aria-hidden="true" /><span className="track-name">{t(item.name)}<span>{t(item.description)}</span></span><span className="upcoming-badge">{t("Coming soon")}</span>
      </div>)}</section>)}</nav>
      <div className="sidebar-guides">
        <a href={EVALUATION_URL} target="_blank" rel="noreferrer" aria-label={`${t("Run an evaluation")} · lexmount/webstone`}>
          <Github /><span>{t("Run an evaluation")}<small>webstone</small></span><ArrowUpRight size={13} aria-hidden="true" />
        </a>
        <a href={SUBMISSION_URL} target="_blank" rel="noreferrer" aria-label={`${t("Submit results")} · lexmount/webstone-site`}>
          <Github /><span>{t("Submit results")}<small>webstone-site</small></span><ArrowUpRight size={13} aria-hidden="true" />
        </a>
        <a href={DATASETS_URL} target="_blank" rel="noreferrer" aria-label={t("Datasets")}>
          <img src="/huggingface.svg" width="16" height="16" alt="" aria-hidden="true" /><span>{t("Datasets")}</span><ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      <div className="sidebar-footer">
        <div className="language-control" role="group" aria-label="Language / 语言"><button lang="en" aria-pressed={language === "en"} onClick={() => chooseLanguage("en")}>EN</button><button lang="zh" aria-pressed={language === "zh"} onClick={() => chooseLanguage("zh")}>中文</button></div>
        <a className="nav-star" href={WEBSTONE_REPOSITORY_URL} target="_blank" rel="noreferrer" aria-label={t("Star Webstone on GitHub")}><Star size={14} aria-hidden="true" />Star<ArrowUpRight size={12} aria-hidden="true" /></a>
      </div>
    </aside>

    <div className="main-shell">
      <div className="benchmark-tabs-bar"><button className="mobile-menu icon-button" aria-label={t("Open navigation")} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>          {track && <div className="benchmark-navigation" role="group" aria-label={t("Benchmarks")}>
            {track.benchmarks.filter(bench => !bench.outputLayer || bench.outputLayer === "L1").map(bench => {
              const active = bench.searchGroup ? details?.searchGroup === bench.searchGroup : selection.benchmark === bench.id;
              return <button key={bench.id} aria-current={active ? "page" : undefined} onClick={() => {
                const target = bench.searchGroup ? catalog?.benchmarks.find(candidate => candidate.searchGroup === bench.searchGroup && candidate.outputLayer === details?.outputLayer) : bench;
                chooseBenchmark(target?.id ?? bench.id);
              }}>{bench.name}</button>;
            })}
          </div>}</div>
      {selection.benchmark && <header className="topbar">
        <div className="title-group">
          <div className="benchmark-heading"><h1>{details ? t(details.name) : "Webstone"}</h1>
            {details && <p className="benchmark-description">{t(details.description)}</p>}
            {details && <div className="benchmark-links">
              <a href={details.datasetUrl} target="_blank" rel="noreferrer" aria-label={`${t("Dataset")}: ${details.datasetName}`}><img src="/huggingface.svg" width={16} height={16} alt="" aria-hidden="true" />{t("Dataset")}<ArrowUpRight size={13} aria-hidden="true" /></a>
              <button type="button" className="example-open" aria-haspopup="dialog" onClick={() => setShowExample(true)}>{t("See an example")}</button>
              <a href="#reports">{t("Reports")}<ArrowDown size={13} aria-hidden="true" /></a>
            </div>}

          </div>
        </div>
        <div className="topbar-actions">
          {entry && <a className="download-link" href={`/results/${entry.file}`} download aria-label={t("Download Report")}><ArrowDownToLine size={17} aria-hidden="true" /><span>{t("Download Report")}</span></a>}
          <a className="submit-result-link" href={SUBMISSION_URL} target="_blank" rel="noreferrer">{t("Submit results")} <ArrowUpRight size={13} aria-hidden="true" /></a>
          <span className="site-updated">{t("Website updated")} <time dateTime={BUILT_AT}>{BUILT_AT.slice(0, 16).replace("T", " ")} UTC</time></span>
        </div>
      </header>}

      <main id="main" className="main-content">
        {!entries && !error && <div className="loading-panel" role="status">{t("Loading…")}</div>}
        {error && <div className="empty-state" role="alert"><p>{t(error)}</p><button className="text-button" onClick={() => window.location.reload()}>{t("Retry")}</button></div>}
        {entries && catalog && (!selection.benchmark ? <Home catalog={catalog} snapshots={snapshots} t={t} language={language} /> : <>
          <div className="results-controls">
            {details?.searchGroup ? <div className="search-selectors">
              <div className="column-views layer-control" role="group" aria-label={t("Output layer")}>{(["L1", "L2", "L3"] as const).map((layer, index) => <button key={layer} aria-pressed={details.outputLayer === layer} onClick={() => {
                const target = catalog?.benchmarks.find(item => item.searchGroup === details.searchGroup && item.outputLayer === layer);
                if (target) chooseBenchmark(target.id);
              }}>{t(["L1 · Search results", "L2 · Supplemental text", "L3 · Generated answers"][index])}</button>)}</div>
            </div> : null}
            {versions.length > 0 && <div className="version-control">
              <label htmlFor="result-version">{t("Version")}</label>
              <select id="result-version" value={selection.version} onChange={event => chooseVersion(event.target.value)}>
                {selection.version && !versions.includes(selection.version) && <option value={selection.version}>{selection.version} ({t("no results")})</option>}
                {[...versionEntries].reverse().map(item => <option key={item.version} value={canonicalVersion(item.version)}>{canonicalVersion(item.version)}</option>)}
              </select>
            </div>}
            {snapshot?.release && <span className="result-published">{t("Version released")} <time dateTime={snapshot.release.date}>{snapshot.release.date}</time></span>}
            {historical && <a className="result-published" href={`${GITHUB_URL}/commit/${historical.commit}`} target="_blank" rel="noreferrer">{t("First published in the repository")} <time dateTime={historical.date}>{historical.date}</time> <ArrowUpRight size={12} aria-hidden="true" /></a>}
          </div>
          {benchmark && snapshot && <div className="evaluation-scope">
            <span>{t("Evaluation scope")} · {benchmark.taskCount.toLocaleString()} {t("cases")}</span>
            <InfoTooltip label={t("Evaluation scope")} description={[historicalCopy?.scope ?? t(snapshot.datasetDifference), snapshot.release ? t(snapshot.release.summary) : "", ...evaluationNotes].filter(Boolean).join(" ")}
              detailsLabel={t("details")} />
          </div>}

          {!benchmark || !metric ? <div className="empty-state">
            <h2>{t(versions.length > 0 ? "No results for this version" : "No results for this benchmark")}</h2>
            {versions.length > 0 && <button className="text-button" onClick={() => chooseVersion(versions.at(-1)!)}>{t("View latest version")}<ArrowRight size={14} /></button>}
          </div> : <>
            <section id="results" className="leaderboard" aria-label={`${t(benchmark.name)} ${t("Leaderboard")}`}>
              <h2 className="sr-only">{t("Leaderboard")}</h2>
              {benchmark.rankable === false && <p className="sample-scope">{t("Diagnostic results; no ranking or best-value claims.")} {t("Collection dates and retry policies differ in this edition.")}</p>}
              <div className="table-toolbar"><span>{benchmark.providerCount} {t("methods")} · {benchmark.taskCount.toLocaleString()} {t("cases")}</span><div className="column-views table-controls" role="group" aria-label={t("Table columns")}>
                {benchmark.categories.length > 0 && <button aria-pressed={showCategories} onClick={() => setShowCategories(current => !current)}>{t("Category breakdown")}</button>}
                {decisionMetrics(benchmark, true, benchmark.primaryMetric).some(item => !decisionMetrics(benchmark, false, benchmark.primaryMetric).includes(item)) && <button aria-pressed={moreMetrics} onClick={() => {
                  if (moreMetrics && !decisionMetrics(benchmark, false, benchmark.primaryMetric).some(item => item.id === selection.metric)) {
                    setSelection(current => ({ ...current, metric: benchmark.primaryMetric }));
                    setDirection(primaryMetric?.direction ?? "desc");
                  }
                  setMoreMetrics(current => !current);
                }}>{t("More metrics")}</button>}
              </div></div>
              <p className="sample-scope">{benchmark.metrics.filter(item => result?.metricSamples?.[item.id]?.sampleCount !== null && result?.metricSamples?.[item.id]?.sampleCount !== undefined && result.metricSamples[item.id].sampleCount !== benchmark.taskCount).map(item => `${t(item.label)}: ${result!.metricSamples![item.id].sampleCount} ${t("samples")}`).join(" · ")}</p>
              {benchmark.trackId === "websearch" && snapshot?.source.kind === "report-page" && <p className="sample-scope">{t("Latency comes from separate runs with different concurrency.")}</p>}
              {!showPricing && !hasNumericCost && <p className="cost-disclosure">{t("Cost was not disclosed in this report.")}</p>}
              <div key={`${selection.benchmark}:${selection.version}`} className="table-scroll" style={{ "--data-columns": categories.length + visibleMetrics.length + Number(showPassed) + Number(showPricing) } as React.CSSProperties} tabIndex={0} role="region" aria-label={t("Leaderboard")}>
                <table className="wide-table">
                  <caption className="sr-only">{t(benchmark.name)} {t("Leaderboard")}</caption>
                  <colgroup><col className="rank-column" /><col className="provider-column" />{Array.from({ length: categories.length + visibleMetrics.length + Number(showPassed) + Number(showPricing) }, (_, index) => <col key={index} />)}</colgroup>
                  <thead><tr>
                    <th className="rank-cell" scope="col">#</th>
                    <th className="provider-heading" scope="col">{t("Method")}</th>
                    {leadingMetrics.map(metricHeader)}
                    {showPricing && <th scope="col"><div className="metric-heading"><span>{t("Price / 1K")}</span><InfoTooltip label={t("Price / 1K")} description={t("Quoted prices and ranges are not realized total costs. Software-only prices exclude model usage.")} detailsLabel={t("details")} /></div></th>}
                    {categories.map(category => <th key={category.id} scope="col" className="category-head"><div className="metric-heading"><span>{t(category.name)}</span><InfoTooltip label={t(category.name)} description={`${category.total} ${t("cases")}. ${t("Pass criteria")}: ${t(category.criterion)}`} detailsLabel={t("details")} /></div></th>)}
                    {trailingMetrics.map(metricHeader)}
                    {showPassed && <th className="count-cell" scope="col"><div className="metric-heading"><span>{t("Passed / Total")}</span><InfoTooltip label={t("Passed / Total")} description={`${t("Passed / Total")}: ${benchmark.taskCount}. ${t("Not disclosed in the source")}: —.`} detailsLabel={t("details")} /></div></th>}
                  </tr></thead>
                  <tbody>{providers.map((provider, i) => <tr key={provider.id} data-provider={provider.id}>
                    <td className="rank-cell">{benchmark.rankable === false || provider.scores[metric.id] == null ? "—" : i + 1}</td>
                    <td><div className="provider-cell"><a className="provider-name provider-link" href={catalog?.providerUrls[provider.id]} target="_blank" rel="noopener noreferrer" aria-label={`${provider.name} ${t("project")} (${t("opens in a new tab")})`}><span className={`provider-mark ${provider.id}`} style={{ "--provider-color": providerColors[provider.id] ?? "#64748b" } as React.CSSProperties} aria-hidden="true">{provider.name[0]}</span><span className="provider-label" title={provider.name}><strong>{provider.name.split(" · ")[0]}</strong>{provider.name.includes(" · ") && <small>{t(provider.name.split(" · ").slice(1).join(" · "))}</small>}</span><ArrowUpRight className="provider-external" size={12} aria-hidden="true" /></a><button className="method-open" aria-label={`${provider.name} · ${t("Method details")}`} aria-haspopup="dialog" onClick={() => setSelectedProvider(provider)}>···</button></div></td>
                    {leadingMetrics.map(item => metricCell(provider, item))}
                    {showPricing && <td className="numeric pricing-cell"><div className="metric-heading">{provider.pricing && hasPricingInformation(provider) ? <><span className="pricing-value">{t(formatPricing(provider.pricing))}</span><InfoTooltip label={`${provider.name} · ${t("Billing basis")}`} description={`${t(provider.pricing.description)} ${t("The table retains the evaluation report’s quoted price. Official rates may change.")}`} sources={catalog?.pricingSources?.[provider.id]} sourcesLabel={t("Official pricing")} detailsLabel={t("details")} /></> : "—"}</div></td>}
                    {categories.map(category => {
                      const isBest = isBestValue(provider.categoryPassed?.[category.id], categoryBest.get(category.id) ?? null);
                      return <td key={category.id} className={`numeric category-value ${isBest ? "best-value" : ""}`} title={`${provider.categoryPassed?.[category.id] ?? "—"} / ${category.total}`}>{provider.categoryPassed?.[category.id] == null ? "—" : `${(provider.categoryPassed[category.id] / category.total * 100).toFixed(1)}%`}{isBest && <span className="sr-only"> {t("Best in this column")}</span>}</td>;
                    })}
                    {trailingMetrics.map(item => metricCell(provider, item))}
                    {showPassed && <td className={`numeric count-cell ${isBestValue(provider.passed, passedBest) ? "best-value" : ""}`} title={isBestValue(provider.passed, passedBest) ? t("Best in this column") : provider.passed == null ? t("Not disclosed in the source") : provider.passedDerivation ? t(provider.passedDerivation) : undefined}>{provider.passed == null ? "—" : <>{provider.passed}<span> / {benchmark.taskCount}</span></>}{isBestValue(provider.passed, passedBest) && <span className="sr-only"> {t("Best in this column")}</span>}</td>}
                  </tr>)}</tbody>
                </table>
              </div>

            </section>
            <details className="highlight-rules"><summary>{t("How highlights work")}</summary><p>{t("Green marks the best comparable value in each column, including ties. Missing values and columns with no variation have no highlight.")}</p>
              {benchmark.rankable === false ? <p>{t("This diagnostic edition has no ranks or best-value highlights.")}</p> : benchmark.metrics.some(item => item.highlightBest === false) && <ul>{benchmark.metrics.filter(item => item.highlightBest === false).map(item => <li key={item.id}><strong>{t(item.label)}: </strong>{t(item.description ?? "")}</li>)}</ul>}
            </details>
            <Insights key={`${benchmark.id}-${selection.version}`} benchmark={benchmark} t={t} />
            {details && <EvaluationReports key={selection.benchmark} catalog={catalog} snapshots={snapshots} current={details} t={t} language={language} />}
            <MethodDetails provider={selectedProvider} benchmark={benchmark} t={t} onClose={() => setSelectedProvider(null)} />
          </>}
        </>)}
        {showExample && details && <ExampleDialog key={details.id} title={details.name} description={details.description} benchmarks={[details]} onClose={() => setShowExample(false)} t={t} />}
      </main>
    </div>
  </div>;
}

function Github() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.63 0c2.15-1.46 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.8 1.16 3.02 0 4.32-2.64 5.28-5.15 5.56.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" /></svg>;
}
