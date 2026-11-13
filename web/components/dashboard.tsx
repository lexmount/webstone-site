"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, FileJson2, Globe2, Layers3, Menu, Search } from "lucide-react";
import { benchmarkEntries, bestValue, formatMetric, formatPricing, isBestValue, latestEntry, reportEntries, resolveBenchmark, selectEntry, sortProviders, type Catalog, type Entry, type Metric, type Provider, type ReportFile, type Snapshot } from "../lib/results";
import { providerColors } from "../lib/presentation";
import InfoTooltip from "./info-tooltip";

const TRACK_ICONS: Record<string, typeof Globe2> = { webfetch: Globe2, websearch: Search, "trajectory-replay": Bot, webextract: FileJson2 };
const GITHUB_URL = "https://github.com/lexmount/browser-eval-site";
type Selection = { benchmark: string; version: string; metric: string };

export default function Dashboard() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selection, setSelection] = useState<Selection>({ benchmark: "lexbench-webfetch", version: "", metric: "passRate" });
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [catalogResponse, resultsResponse] = await Promise.all([fetch("/benchmarks/catalog.json", { cache: "no-store" }), fetch("/results/reports.json", { cache: "no-store" })]);
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
        const benchmark = benchmarkCatalog.benchmarks.some(item => item.id === candidate) ? candidate! : benchmarkCatalog.benchmarks[0].id;
        const requestedVersion = params.get("version");
        const selectedEntry = requestedVersion
          ? selectEntry(resultEntries, requestedVersion, benchmark)
          : latestEntry(resultEntries, benchmark);
        const version = requestedVersion ?? selectedEntry?.version ?? "";
        const selectedResult = records.find(record => record.id === selectedEntry?.id)?.benchmarks.find(item => item.id === benchmark);
        const selectedBenchmark = selectedResult ? resolveBenchmark(benchmarkCatalog, selectedResult) : null;
        const selectedMetric = selectedBenchmark?.metrics.find(item => item.id === params.get("metric")) ?? selectedBenchmark?.metrics.find(item => item.id === selectedBenchmark.primaryMetric);
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
    if (!entries) return;
    const params = new URLSearchParams({ benchmark: selection.benchmark });
    if (selection.version) params.set("version", selection.version);
    params.set("metric", selection.metric);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [selection, entries]);

  const entry = entries ? selectEntry(entries, selection.version, selection.benchmark) : null;
  const snapshot = snapshots.find(item => item.id === entry?.id) ?? null;
  const result = snapshot?.benchmarks.find(item => item.id === selection.benchmark);
  const benchmark = catalog && result ? resolveBenchmark(catalog, result) : null;
  const details = catalog?.benchmarks.find(item => item.id === selection.benchmark);
  const tracks = catalog?.tracks.map(item => ({ ...item, benchmarks: catalog.benchmarks.filter(bench => bench.trackId === item.id) })) ?? [];
  const track = tracks.find(item => item.id === details?.trackId);
  const metric = benchmark?.metrics.find(item => item.id === selection.metric) ?? benchmark?.metrics.find(item => item.id === benchmark.primaryMetric) ?? benchmark?.metrics[0];
  const versions = entries ? benchmarkEntries(entries, selection.benchmark).map(item => item.version) : [];
  const providers = benchmark && metric ? sortProviders(benchmark.providers, metric.id, direction) : [];
  const categories = benchmark?.categories ?? [];
  const primaryMetric = benchmark?.metrics.find(item => item.id === benchmark.primaryMetric);
  const leadingMetrics = benchmark && primaryMetric
    ? [primaryMetric, ...benchmark.metrics.filter(item => item.id !== primaryMetric.id && benchmark.leadingMetricIds?.includes(item.id))]
    : [];
  const trailingMetrics = benchmark
    ? benchmark.metrics.filter(item => item.id !== primaryMetric?.id && !benchmark.leadingMetricIds?.includes(item.id))
    : [];
  const metricBest = new Map((benchmark?.metrics ?? []).map(item => [item.id, bestValue((benchmark?.providers ?? []).map(provider => provider.scores[item.id]), item.direction)]));
  const categoryBest = new Map(categories.map(category => [category.id, bestValue((benchmark?.providers ?? []).map(provider => provider.categoryPassed?.[category.id] ?? null), "desc")]));
  const passedBest = bestValue((benchmark?.providers ?? []).map(provider => provider.passed), "desc");
  const showPassed = benchmark?.providers.some(provider => provider.passed != null) ?? false;
  const showPricing = benchmark?.providers.some(provider => provider.pricing != null) ?? false;
  const tableClass = benchmark?.id === "lexbench-webfetch"
    ? "wide-table lexbench-table"
    : benchmark?.id === "webarena-verified" ? "wide-table arena-table"
    : benchmark?.id === "lexbench-headless-372" ? "wide-table headless-table"
    : benchmark?.trackId === "websearch" ? "wide-table search-table"
    : benchmark?.trackId === "webextract" ? "wide-table extract-table"
    : "wide-table";

  function chooseBenchmark(id: string) {
    const latest = entries ? latestEntry(entries, id) : null;
    const version = latest?.version ?? "";
    const selectedResult = snapshots.find(record => record.id === latest?.id)?.benchmarks.find(item => item.id === id);
    const selected = catalog && selectedResult ? resolveBenchmark(catalog, selectedResult) : null;
    const primary = selected?.metrics.find(item => item.id === selected.primaryMetric);
    setSelection({ benchmark: id, version, metric: primary?.id ?? "passRate" });
    setDirection(primary?.direction ?? "desc");
    setMenuOpen(false);
  }

  function chooseVersion(version: string) {
    const selectedEntry = entries ? selectEntry(entries, version, selection.benchmark) : null;
    const selectedResult = snapshots.find(record => record.id === selectedEntry?.id)?.benchmarks.find(item => item.id === selection.benchmark);
    const selected = catalog && selectedResult ? resolveBenchmark(catalog, selectedResult) : null;
    const selectedMetric = selected?.metrics.find(item => item.id === selection.metric) ?? selected?.metrics.find(item => item.id === selected.primaryMetric);
    setSelection(current => ({ ...current, version, metric: selectedMetric?.id ?? current.metric }));
    if (selectedMetric && selectedMetric.id !== selection.metric) setDirection(selectedMetric.direction);
  }

  function metricHeader(item: Metric) {
    const selected = metric?.id === item.id;
    return <th key={item.id} scope="col" aria-sort={selected ? (direction === "asc" ? "ascending" : "descending") : "none"} className={selected ? "sorted" : undefined}>
      <div className="metric-heading">
        <button className={`sort-button ${selected ? "selected" : ""}`} onClick={() => {
          setDirection(selected ? (direction === "desc" ? "asc" : "desc") : item.direction);
          setSelection(current => ({ ...current, metric: item.id }));
        }}>{item.label}<ArrowDown size={13} style={{ transform: selected && direction === "asc" ? "rotate(180deg)" : undefined }} /></button>
        {item.description && <InfoTooltip label={item.label} description={item.description} />}
      </div>
    </th>;
  }

  function metricCell(provider: Provider, item: Metric) {
    const value = provider.scores[item.id];
    const isBest = isBestValue(value, metricBest.get(item.id) ?? null);
    return <td key={item.id} className={`numeric ${item.id === metric?.id ? "primary-number" : ""} ${isBest ? "best-value" : ""}`}
      title={isBest ? "Best in this column" : value == null ? "Not disclosed in the source" : undefined}
    >{formatMetric(value, item.unit, item.decimals, item.signed, provider.counts?.[item.id])}{isBest && <span className="sr-only"> Best in this column</span>}</td>;
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to results</a>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <a href="/" className="brand" aria-label="Webstone home"><span className="brand-heading"><Layers3 size={24} strokeWidth={1.8} /><span>Webstone</span></span><span className="brand-tagline">The touchstone for your agent&apos;s web tools</span></a>
      <div className="sidebar-label">TRACKS</div>
      <nav aria-label="Tracks">{tracks.map(item => {
        const Icon = TRACK_ICONS[item.id] ?? Layers3;
        return <button
          key={item.id}
          className={`nav-item ${track?.id === item.id ? "active" : ""}`}
          aria-current={track?.id === item.id ? "page" : undefined}
          onClick={() => track?.id === item.id ? setMenuOpen(false) : chooseBenchmark(item.benchmarks[0].id)}
        ><Icon size={17} /><span className="track-name">{item.name}<span>{item.description}</span></span></button>;
      })}</nav>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="title-group">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="benchmark-heading"><h1>{details?.name ?? "Webstone"}</h1>
            {details && <p className="benchmark-description">{details.description}</p>}
            {snapshot && <p className="dataset-difference"><strong>Dataset difference:</strong> {snapshot.datasetDifference}</p>}
            {details && <div className="benchmark-links">
              <a href={details.datasetUrl} target="_blank" rel="noreferrer" title="Dataset home. The evaluated sample scope is recorded in the downloaded report.">Dataset · {details.datasetName}<ArrowUpRight size={13} aria-hidden="true" /></a>
              <a href={benchmark?.reportUrl ?? details.reportUrl} target="_blank" rel="noreferrer" title={result?.reportUrl ? "Evaluation report for these results." : "Related evaluation report. It may cover a different run or sample scope."}>Evaluation report<ArrowUpRight size={13} aria-hidden="true" /></a>
            </div>}
          </div>
        </div>
        <div className="topbar-actions">
          {entry && <a className="download-link" href={`/results/${entry.file}`} download aria-label="Download Report"><ArrowDownToLine size={17} aria-hidden="true" /><span>Download Report</span></a>}
          <a className="github-square" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="View website source on GitHub" title="GitHub"><span className="submit-label">SUBMIT YOUR RESULT</span><Github /></a>
        </div>
      </header>

      <main id="main" className="main-content">
        {!entries && !error && <div className="loading-panel" role="status">Loading…</div>}
        {error && <div className="empty-state" role="alert"><p>{error}</p><button className="text-button" onClick={() => window.location.reload()}>Retry</button></div>}
        {entries && <>
          <div className="results-controls">
            <nav className="benchmark-tabs" aria-label="Benchmarks">{track?.benchmarks.map(item => <button
              key={item.id} className={`benchmark-tab ${selection.benchmark === item.id ? "active" : ""}`}
              aria-current={selection.benchmark === item.id ? "page" : undefined} onClick={() => chooseBenchmark(item.id)}
            >{item.name}</button>)}</nav>
            {versions.length > 0 && <div className="version-control">
              <label htmlFor="result-version">Version</label>
              <select id="result-version" value={selection.version} onChange={event => chooseVersion(event.target.value)}>
                {selection.version && !versions.includes(selection.version) && <option value={selection.version}>{selection.version} (no results)</option>}
                {[...versions].reverse().map(version => <option key={version} value={version}>{version}</option>)}
              </select>
            </div>}
          </div>

          {!benchmark || !metric ? <div className="empty-state">
            <h2>{versions.length > 0 ? "No results for this version" : "No results for this benchmark"}</h2>
            {versions.length > 0 && <button className="text-button" onClick={() => chooseVersion(versions.at(-1)!)}>View latest version<ArrowRight size={14} /></button>}
          </div> : <>
            <section className="leaderboard" aria-label={`${benchmark.name} leaderboard`}>
              <div className="table-scroll">
                <table className={tableClass} style={{ "--data-columns": categories.length + benchmark.metrics.length + Number(showPassed) + Number(showPricing) } as React.CSSProperties}>
                  <caption className="sr-only">{benchmark.name} leaderboard</caption>
                  <thead><tr>
                    <th className="rank-cell" scope="col">#</th>
                    <th className="provider-heading" scope="col">{benchmark.providerLabel ?? "Browser"}</th>
                    {leadingMetrics.map(metricHeader)}
                    {categories.map(category => <th key={category.id} scope="col" className="category-head"><div className="metric-heading"><span>{category.name}<span className="category-total">/{category.total}</span></span><InfoTooltip label={category.name} description={`${category.total} cases. Pass criteria: ${category.criterion}`} /></div></th>)}
                    {trailingMetrics.map(metricHeader)}
                    {showPricing && <th scope="col"><div className="metric-heading"><span>Price / 1K</span><InfoTooltip label="Price / 1K" description="USD per 1,000 calls. Ranges reflect different billing conditions and are not sorted or ranked. Software-only prices exclude model usage; total costs were not supplied. Billing source URLs were not supplied." /></div></th>}
                    {showPassed && <th className="count-cell" scope="col"><div className="metric-heading"><span>Passed / Total</span><InfoTooltip label="Passed / Total" description={`Passed cases out of ${benchmark.taskCount} total cases. Undisclosed counts are shown as —.`} /></div></th>}
                  </tr></thead>
                  <tbody>{providers.map((provider, i) => <tr key={provider.id}>
                    <td className="rank-cell">{provider.scores[metric.id] == null ? "—" : i + 1}</td>
                    <td><a className="provider-name provider-link" href={catalog?.providerUrls[provider.id]} target="_blank" rel="noopener noreferrer" aria-label={`${provider.name} project (opens in a new tab)`}><span className={`provider-mark ${provider.id}`} style={{ "--provider-color": providerColors[provider.id] ?? "#64748b" } as React.CSSProperties} aria-hidden="true">{provider.name[0]}</span><span className="provider-label" title={provider.name}>{provider.name}</span><ArrowUpRight className="provider-external" size={12} aria-hidden="true" /></a></td>
                    {leadingMetrics.map(item => metricCell(provider, item))}
                    {categories.map(category => {
                      const isBest = isBestValue(provider.categoryPassed?.[category.id], categoryBest.get(category.id) ?? null);
                      return <td key={category.id} className={`numeric category-value ${isBest ? "best-value" : ""}`} title={isBest ? "Best in this column" : undefined}>{provider.categoryPassed?.[category.id] ?? "—"}{isBest && <span className="sr-only"> Best in this column</span>}</td>;
                    })}
                    {trailingMetrics.map(item => metricCell(provider, item))}
                    {showPricing && <td className="numeric"><div className="metric-heading">{provider.pricing ? <>{formatPricing(provider.pricing)}<InfoTooltip label={`${provider.name} billing`} description={provider.pricing.description} /></> : "—"}</div></td>}
                    {showPassed && <td className={`numeric count-cell ${isBestValue(provider.passed, passedBest) ? "best-value" : ""}`} title={isBestValue(provider.passed, passedBest) ? "Best in this column" : provider.passed == null ? "Not disclosed in the source" : provider.passedDerivation ?? undefined}>{provider.passed == null ? "—" : <>{provider.passed}<span> / {benchmark.taskCount}</span></>}{isBestValue(provider.passed, passedBest) && <span className="sr-only"> Best in this column</span>}</td>}
                  </tr>)}</tbody>
                </table>
              </div>
            </section>
          </>}
        </>}
      </main>
    </div>
  </div>;
}

function Github() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.63 0c2.15-1.46 3.1-1.15 3.1-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.8 1.16 3.02 0 4.32-2.64 5.28-5.15 5.56.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" /></svg>;
}
