"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleHelp, FileText, Globe2, Layers3, Menu, Search } from "lucide-react";
import { formatMetric, selectEntry, sortProviders, type Index, type Snapshot } from "../lib/results";

const BENCHMARKS = [
  { id: "lexbench-webfetch", name: "LexBench WebFetch", icon: Globe2 },
  { id: "webmainbench", name: "WebMainBench", icon: FileText },
  { id: "lexbench-websearch", name: "LexBench WebSearch", icon: Search },
  { id: "simpleqa-verified", name: "SimpleQA Verified", icon: CircleHelp },
];
const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/lexmount/browser-eval";
type Selection = { benchmark: string; date: string; metric: string };

export default function Dashboard() {
  const [index, setIndex] = useState<Index | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selection, setSelection] = useState<Selection>({ benchmark: "lexbench-webfetch", date: "", metric: "passRate" });
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/results/index.json");
        if (!response.ok) throw new Error("无法读取结果数据。");
        const catalog: Index = await response.json();
        const records = await Promise.all(catalog.entries.map(async entry => {
          const result = await fetch(`/results/${entry.file}`);
          if (!result.ok) throw new Error("无法读取结果数据。");
          return await result.json() as Snapshot;
        }));
        if (!active) return;
        setIndex(catalog);
        setSnapshots(records);
        const params = new URLSearchParams(window.location.search);
        const candidate = params.get("benchmark");
        const benchmark = BENCHMARKS.some(item => item.id === candidate) ? candidate! : "lexbench-webfetch";
        const dates = catalog.entries.filter(entry => entry.benchmarks.some(item => item.id === benchmark)).map(entry => entry.date).sort();
        const selectedBenchmark = records.flatMap(record => record.benchmarks).find(item => item.id === benchmark);
        const selectedMetric = selectedBenchmark?.metrics.find(item => item.id === params.get("metric")) ?? selectedBenchmark?.metrics.find(item => item.id === selectedBenchmark.primaryMetric);
        setSelection({
          benchmark,
          date: params.get("date") ?? dates.at(-1)!,
          metric: selectedMetric?.id ?? "passRate",
        });
        setDirection(selectedMetric?.direction ?? "desc");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "读取失败，请重试。");
      }
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!index) return;
    const params = new URLSearchParams({ benchmark: selection.benchmark, date: selection.date, metric: selection.metric });
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [selection, index]);

  const entry = index ? selectEntry(index.entries, selection.date, selection.benchmark) : null;
  const snapshot = snapshots.find(item => item.id === entry?.id) ?? null;
  const reference = snapshot ?? snapshots.find(record => record.benchmarks.some(item => item.id === selection.benchmark));
  const benchmark = snapshot?.benchmarks.find(item => item.id === selection.benchmark);
  const metric = benchmark?.metrics.find(item => item.id === selection.metric) ?? benchmark?.metrics[0];
  const dates = index ? [...new Set(index.entries.filter(item => item.benchmarks.some(value => value.id === selection.benchmark)).map(item => item.date))].sort() : [];
  const prevDate = dates.filter(date => date < selection.date).at(-1);
  const nextDate = dates.find(date => date > selection.date);
  const providers = benchmark && metric ? sortProviders(benchmark.providers, metric.id, direction) : [];
  const metricLeader = benchmark && metric ? sortProviders(benchmark.providers, metric.id, metric.direction)[0] : null;
  const categories = benchmark?.categories ?? [];

  function chooseBenchmark(id: string) {
    const selected = snapshots.flatMap(record => record.benchmarks).find(item => item.id === id);
    const primary = selected?.metrics.find(item => item.id === selected.primaryMetric);
    setSelection(current => ({ ...current, benchmark: id, metric: primary?.id ?? "passRate" }));
    setDirection(primary?.direction ?? "desc");
    setMenuOpen(false);
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">跳到结果</a>
    {menuOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <a href="/" className="brand"><Layers3 size={24} strokeWidth={1.8} /><span>Browser<span className="brand-light">Eval</span></span></a>
      <div className="sidebar-label">BENCHMARKS</div>
      <nav aria-label="BENCHMARKS">{BENCHMARKS.map(item => {
        const Icon = item.icon;
        return <button
          key={item.id}
          className={`nav-item ${selection.benchmark === item.id ? "active" : ""}`}
          aria-current={selection.benchmark === item.id ? "page" : undefined}
          onClick={() => chooseBenchmark(item.id)}
        ><Icon size={17} /><span>{item.name}</span></button>;
      })}</nav>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="title-group">
          <button className="mobile-menu icon-button" aria-label="打开导航" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <h1>{BENCHMARKS.find(item => item.id === selection.benchmark)?.name}</h1>
        </div>
        <div className="topbar-actions">
          {reference && <a className="icon-button" href={reference.source.url} target="_blank" rel="noreferrer" aria-label="原始报告" title="原始报告"><ArrowUpRight size={19} /></a>}
          {entry && <a className="icon-button" href={`/results/${entry.file}`} download aria-label="下载结果" title="下载结果"><ArrowDownToLine size={17} /></a>}
          <a className="github-square" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="在 GitHub 查看评测工具" title="GitHub"><Github /></a>
        </div>
      </header>

      <main id="main" className="main-content">
        {!index && !error && <div className="loading-panel" role="status">加载中…</div>}
        {error && <div className="empty-state" role="alert"><p>{error}</p><button className="text-button" onClick={() => window.location.reload()}>重试</button></div>}
        {index && <>
          <div className="results-controls">
            <div className="date-control">
              <label htmlFor="result-date">日期</label>
              <button className="icon-button" aria-label="上一个有结果的日期" disabled={!prevDate} onClick={() => prevDate && setSelection(current => ({ ...current, date: prevDate }))}><ChevronLeft size={16} /></button>
              <input id="result-date" aria-label="采集日期" title="采集日期（UTC）；原报告未注明执行日期" type="date" value={selection.date} onChange={event => setSelection(current => ({ ...current, date: event.target.value }))} />
              <button className="icon-button" aria-label="下一个有结果的日期" disabled={!nextDate} onClick={() => nextDate && setSelection(current => ({ ...current, date: nextDate }))}><ChevronRight size={16} /></button>
            </div>
          </div>

          {!snapshot || !benchmark || !metric ? <div className="empty-state">
            <h2>当日无结果</h2>
            <button className="text-button" onClick={() => setSelection(current => ({ ...current, date: dates.at(-1)! }))}>查看最新结果<ArrowRight size={14} /></button>
          </div> : <>
            <section className="leaderboard" aria-label={`${benchmark.name} 排行榜`}>
              <div className="table-scroll">
                <table className={benchmark.id === "lexbench-webfetch" ? "wide-table lexbench-table" : "wide-table"}>
                  <caption className="sr-only">{benchmark.name} 排行榜</caption>
                  <thead><tr>
                    <th className="rank-cell" scope="col">#</th>
                    <th className="provider-heading" scope="col">{benchmark.providerLabel ?? "浏览器"}</th>
                    {categories.map(category => <th key={category.id} scope="col" className="category-head" title={category.criterion}>{category.name}<span className="category-total">/{category.total}</span></th>)}
                    {benchmark.metrics.map(item => <th key={item.id} scope="col" title={item.description} aria-sort={metric.id === item.id ? (direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className={`sort-button ${metric.id === item.id ? "selected" : ""}`} onClick={() => {
                        setDirection(metric.id === item.id ? (direction === "desc" ? "asc" : "desc") : item.direction);
                        setSelection(current => ({ ...current, metric: item.id }));
                      }}>{item.label}<ArrowDown size={13} style={{ transform: metric.id === item.id && direction === "asc" ? "rotate(180deg)" : undefined }} /></button>
                    </th>)}
                    {benchmark.id === "lexbench-webfetch" && <th className="count-cell" scope="col">通过 / 总数</th>}
                  </tr></thead>
                  <tbody>{providers.map((provider, i) => <tr key={provider.id} className={provider.id === metricLeader?.id ? "highlight-row" : ""}>
                    <td className="rank-cell">{provider.scores[metric.id] == null ? "—" : i + 1}</td>
                    <td><div className="provider-name"><span className={`provider-mark ${provider.id}`} style={{ "--provider-color": provider.color } as React.CSSProperties}>{provider.name[0]}</span>{provider.name}</div></td>
                    {categories.map(category => <td key={category.id} className="numeric category-value">{provider.categoryPassed?.[category.id] ?? "—"}</td>)}
                    {benchmark.metrics.map(item => <td
                      key={item.id}
                      className={`numeric ${item.id === metric.id ? "primary-number" : ""}`}
                      title={provider.scores[item.id] == null ? "原文未披露" : undefined}
                    >{formatMetric(provider.scores[item.id], item.unit, item.decimals)}</td>)}
                    {benchmark.id === "lexbench-webfetch" && <td className="numeric count-cell" title={provider.passed == null ? "原文未披露" : provider.passedDerivation ?? undefined}>{provider.passed == null ? "—" : <>{provider.passed}<span> / {benchmark.taskCount}</span></>}</td>}
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
