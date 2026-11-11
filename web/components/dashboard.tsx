"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, ChevronLeft, ChevronRight, Globe2, Layers3, Menu, Search } from "lucide-react";
import { formatMetric, reportEntries, resolveBenchmark, selectEntry, sortProviders, type Catalog, type Entry, type Metric, type Provider, type ReportFile, type Snapshot } from "../lib/results";
import { providerColors } from "../lib/presentation";
import InfoTooltip from "./info-tooltip";

const TRACK_ICONS: Record<string, typeof Globe2> = { webfetch: Globe2, websearch: Search, "trajectory-replay": Bot };
const GITHUB_URL = "https://github.com/lexmount/browser-eval-site";
type Selection = { benchmark: string; date: string; metric: string };

export default function Dashboard() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selection, setSelection] = useState<Selection>({ benchmark: "lexbench-webfetch", date: "", metric: "passRate" });
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [catalogResponse, resultsResponse] = await Promise.all([fetch("/benchmarks/catalog.json"), fetch("/results/reports.json")]);
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
        const dates = resultEntries.filter(entry => entry.benchmarks.includes(benchmark)).map(entry => entry.date).sort();
        const date = params.get("date") ?? dates.at(-1) ?? "";
        const selectedEntry = selectEntry(resultEntries, date, benchmark);
        const selectedResult = records.find(record => record.id === selectedEntry?.id)?.benchmarks.find(item => item.id === benchmark);
        const selectedBenchmark = selectedResult ? resolveBenchmark(benchmarkCatalog, selectedResult) : null;
        const selectedMetric = selectedBenchmark?.metrics.find(item => item.id === params.get("metric")) ?? selectedBenchmark?.metrics.find(item => item.id === selectedBenchmark.primaryMetric);
        setSelection({
          benchmark,
          date,
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
    const params = new URLSearchParams({ benchmark: selection.benchmark, date: selection.date, metric: selection.metric });
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [selection, entries]);

  const entry = entries ? selectEntry(entries, selection.date, selection.benchmark) : null;
  const snapshot = snapshots.find(item => item.id === entry?.id) ?? null;
  const result = snapshot?.benchmarks.find(item => item.id === selection.benchmark);
  const benchmark = catalog && result ? resolveBenchmark(catalog, result) : null;
  const details = catalog?.benchmarks.find(item => item.id === selection.benchmark);
  const tracks = catalog?.tracks.map(item => ({ ...item, benchmarks: catalog.benchmarks.filter(bench => bench.trackId === item.id) })) ?? [];
  const track = tracks.find(item => item.id === details?.trackId);
  const metric = benchmark?.metrics.find(item => item.id === selection.metric) ?? benchmark?.metrics[0];
  const dates = entries ? [...new Set(entries.filter(item => item.benchmarks.includes(selection.benchmark)).map(item => item.date))].sort() : [];
  const prevDate = dates.filter(date => date < selection.date).at(-1);
  const nextDate = dates.find(date => date > selection.date);
  const providers = benchmark && metric ? sortProviders(benchmark.providers, metric.id, direction) : [];
  const metricLeader = benchmark && metric ? sortProviders(benchmark.providers, metric.id, metric.direction)[0] : null;
  const categories = benchmark?.categories ?? [];
  const leadingMetrics = benchmark?.leadingMetricIds?.map(id => benchmark.metrics.find(item => item.id === id)!) ?? [];
  const trailingMetrics = benchmark?.metrics.filter(item => !benchmark.leadingMetricIds?.includes(item.id)) ?? [];
  const showPassed = benchmark?.providers.some(provider => provider.passed != null) ?? false;
  const tableClass = benchmark?.id === "lexbench-webfetch"
    ? "wide-table lexbench-table"
    : benchmark?.id === "webarena-verified" ? "wide-table arena-table"
    : benchmark?.id === "lexbench-headless-372" ? "wide-table headless-table"
    : "wide-table";

  function chooseBenchmark(id: string) {
    const availableDates = entries?.filter(item => item.benchmarks.includes(id)).map(item => item.date).sort() ?? [];
    const date = availableDates.at(-1) ?? "";
    const selectedEntry = entries ? selectEntry(entries, date, id) : null;
    const selectedResult = snapshots.find(record => record.id === selectedEntry?.id)?.benchmarks.find(item => item.id === id);
    const selected = catalog && selectedResult ? resolveBenchmark(catalog, selectedResult) : null;
    const primary = selected?.metrics.find(item => item.id === selected.primaryMetric);
    setSelection({ benchmark: id, date, metric: primary?.id ?? "passRate" });
    setDirection(primary?.direction ?? "desc");
    setMenuOpen(false);
  }

  function chooseDate(date: string) {
    const selectedEntry = entries ? selectEntry(entries, date, selection.benchmark) : null;
    const selectedResult = snapshots.find(record => record.id === selectedEntry?.id)?.benchmarks.find(item => item.id === selection.benchmark);
    const selected = catalog && selectedResult ? resolveBenchmark(catalog, selectedResult) : null;
    const selectedMetric = selected?.metrics.find(item => item.id === selection.metric) ?? selected?.metrics.find(item => item.id === selected.primaryMetric);
    setSelection(current => ({ ...current, date, metric: selectedMetric?.id ?? current.metric }));
    if (selectedMetric && selectedMetric.id !== selection.metric) setDirection(selectedMetric.direction);
  }

  function metricHeader(item: Metric) {
    const selected = metric?.id === item.id;
    return <th key={item.id} scope="col" aria-sort={selected ? (direction === "asc" ? "ascending" : "descending") : "none"}>
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
    return <td key={item.id} className={`numeric ${item.id === metric?.id ? "primary-number" : ""}`}
      title={provider.scores[item.id] == null ? "Not disclosed in the source" : undefined}
    >{formatMetric(provider.scores[item.id], item.unit, item.decimals, item.signed)}</td>;
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to results</a>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <a href="/" className="brand"><Layers3 size={24} strokeWidth={1.8} /><span>Browser<span className="brand-light">Eval</span></span></a>
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
          <div className="benchmark-heading"><h1>{details?.name ?? "Browser Eval"}</h1>
            {details && <p className="benchmark-description">{details.description}</p>}
            {details && <div className="benchmark-links">
              <a href={details.datasetUrl} target="_blank" rel="noreferrer" title="Dataset home. The evaluated sample scope is recorded in the downloaded report.">Dataset<ArrowUpRight size={13} aria-hidden="true" /></a>
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
            <div className="date-control">
              <label htmlFor="result-date">Date</label>
              <button className="icon-button" aria-label="Previous date with results" disabled={!prevDate} onClick={() => prevDate && chooseDate(prevDate)}><ChevronLeft size={16} /></button>
              <input id="result-date" aria-label="Import date" title="Import date (UTC). The report does not specify an evaluation date." type="date" value={selection.date} onChange={event => chooseDate(event.target.value)} />
              <button className="icon-button" aria-label="Next date with results" disabled={!nextDate} onClick={() => nextDate && chooseDate(nextDate)}><ChevronRight size={16} /></button>
            </div>
          </div>

          {!snapshot || !benchmark || !metric ? <div className="empty-state">
            <h2>No results for this date</h2>
            {dates.length > 0 && <button className="text-button" onClick={() => chooseDate(dates.at(-1)!)}>View latest results<ArrowRight size={14} /></button>}
          </div> : <>
            <section className="leaderboard" aria-label={`${benchmark.name} leaderboard`}>
              <div className="table-scroll">
                <table className={tableClass} style={{ "--data-columns": categories.length + benchmark.metrics.length + Number(showPassed) } as React.CSSProperties}>
                  <caption className="sr-only">{benchmark.name} leaderboard</caption>
                  <thead><tr>
                    <th className="rank-cell" scope="col">#</th>
                    <th className="provider-heading" scope="col">{benchmark.providerLabel ?? "Browser"}</th>
                    {leadingMetrics.map(metricHeader)}
                    {categories.map(category => <th key={category.id} scope="col" className="category-head"><div className="metric-heading"><span>{category.name}<span className="category-total">/{category.total}</span></span><InfoTooltip label={category.name} description={`${category.total} cases. Pass criteria: ${category.criterion}`} /></div></th>)}
                    {trailingMetrics.map(metricHeader)}
                    {showPassed && <th className="count-cell" scope="col"><div className="metric-heading"><span>Passed / Total</span><InfoTooltip label="Passed / Total" description={`Passed cases out of ${benchmark.taskCount} total cases. Undisclosed counts are shown as —.`} /></div></th>}
                  </tr></thead>
                  <tbody>{providers.map((provider, i) => <tr key={provider.id} className={provider.id === metricLeader?.id ? "highlight-row" : ""}>
                    <td className="rank-cell">{provider.scores[metric.id] == null ? "—" : i + 1}</td>
                    <td><div className="provider-name"><span className={`provider-mark ${provider.id}`} style={{ "--provider-color": providerColors[provider.id] ?? "#64748b" } as React.CSSProperties}>{provider.name[0]}</span><span className="provider-label" title={provider.name}>{provider.name}</span></div></td>
                    {leadingMetrics.map(item => metricCell(provider, item))}
                    {categories.map(category => <td key={category.id} className="numeric category-value">{provider.categoryPassed?.[category.id] ?? "—"}</td>)}
                    {trailingMetrics.map(item => metricCell(provider, item))}
                    {showPassed && <td className="numeric count-cell" title={provider.passed == null ? "Not disclosed in the source" : provider.passedDerivation ?? undefined}>{provider.passed == null ? "—" : <>{provider.passed}<span> / {benchmark.taskCount}</span></>}</td>}
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
