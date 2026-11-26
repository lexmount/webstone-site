"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpenText, Bot, CircleDashed, Clipboard, FileJson2, Globe2, Layers3, Search, Star } from "lucide-react";
import { benchmarkHref, evaluationReports, DATASETS_URL, EVALUATION_URL, EVALUATION_SKILL, SUBMISSION_SKILL, SUBMISSION_URL, WEBSTONE_REPOSITORY_URL, navigationGroups, trackOverview } from "../lib/overview";
import ExampleDialog from "./example-dialog";
import type { Language } from "../lib/i18n";
import type { BenchmarkInfo, Catalog, Snapshot } from "../lib/results";

type Props = { catalog: Catalog; snapshots: Snapshot[]; language?: Language; t: (value: string) => string };
export const TRACK_ICONS: Record<string, typeof Globe2> = { webfetch: Globe2, websearch: Search, "trajectory-replay": Bot, webextract: FileJson2 };

export function EvaluationReports({ catalog, snapshots, t, current, language = "en" }: Props & { current?: BenchmarkInfo }) {
  const reports = evaluationReports(catalog, snapshots, current, language);
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(reports.length / 6);
  const selectedPage = Math.min(page, Math.max(0, pageCount - 1));
  if (reports.length === 0) return null;
  return <section className="evaluation-articles" id="reports" aria-labelledby="reports-heading">
    <h2 id="reports-heading">{t("Reports")}</h2>
    <div className="article-grid">{reports.slice(selectedPage * 6, (selectedPage + 1) * 6).map(article => {
      const Icon = TRACK_ICONS[article.track.id] ?? BookOpenText;
      return <article key={article.source} className="article-card" data-track={article.track.id}>
        <div className="article-topic"><Icon size={18} aria-hidden="true" /><span>{t(article.track.name)}</span></div>
        <h3><a href={article.href} hrefLang={article.language} target="_blank" rel="noreferrer">{t(article.title)}{"\u00a0"}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> ({t("opens in a new tab")})</span></a></h3>
        <p>{t(article.summary)}</p>
        <div className="article-date">{t("Published")} <time dateTime={article.publishedAt}>{article.date}</time></div>
        <div className="article-related"><span>{t("Track")}</span><a href={benchmarkHref(article.trackLanding.id)}>{t(article.track.name)} <ArrowRight size={12} aria-hidden="true" /></a></div>
        <div className="article-tags">
          <span className="article-related-label">{t("Benchmarks")}</span>
          {article.benchmarks.map(benchmark => <a key={benchmark.id} href={benchmarkHref(benchmark.id)}>{t(benchmark.name)} <ArrowRight size={12} aria-hidden="true" /></a>)}
        </div>
      </article>;
    })}</div>
    {pageCount > 1 && <nav className="report-pagination" aria-label={t("Report pages")}>
      <button disabled={selectedPage === 0} onClick={() => setPage(selectedPage - 1)}>{t("Previous")}</button>
      <span role="status">{selectedPage + 1} / {pageCount}</span>
      <button disabled={selectedPage + 1 === pageCount} onClick={() => setPage(selectedPage + 1)}>{t("Next")}</button>
    </nav>}
  </section>;
}

export default function Home({ catalog, snapshots, t, language = "en" }: Props) {
  const tracks = trackOverview(catalog);
  const [exampleTrack, setExampleTrack] = useState<(typeof tracks)[number] | null>(null);
  const count = tracks.reduce((sum, track) => sum + track.benchmarks.length, 0);
  const maxBenchmarks = Math.max(1, ...tracks.map(track => track.benchmarks.length));
  const firstBenchmark = tracks.flatMap(track => track.benchmarks)[0];
  const evaluationPrompt = t("Install and use the Webstone evaluation skill at {skill} to evaluate [the tools or models I want to compare].").replace("{skill}", EVALUATION_SKILL);
  const submissionPrompt = t("Install the Webstone submission skill at {skill} and use it to submit these benchmark results and public evidence as a pull request to lexmount/webstone-site.").replace("{skill}", SUBMISSION_SKILL);

  return <div className="overview">
    <section className="overview-hero">
      <div>
        <h1>Webstone</h1>
        <p>{t("Find the right tools for your agent to browse the web.")}</p>
        <p className="overview-summary">{t("Compare web tools, browsers and browser agents on real tasks.")}</p>
        <div className="overview-actions">
          {firstBenchmark && <a href={benchmarkHref(firstBenchmark.id)} className="overview-primary">{t("Explore leaderboards")} <ArrowRight size={17} aria-hidden="true" /></a>}
          <a className="overview-star" href={WEBSTONE_REPOSITORY_URL} target="_blank" rel="noreferrer"><Star size={16} aria-hidden="true" />{t("Star Webstone")} <ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
        <p className="overview-star-note">{t("If Webstone helps, give it a star.")}</p>
      </div>
      <dl className="overview-stats">
        <div><dt>{t("Tracks")}</dt><dd>{tracks.length}</dd></div>
        <div><dt>{t("Benchmarks")}</dt><dd>{count}</dd></div>
        <div><dt>{t("Reports")}</dt><dd>{evaluationReports(catalog, snapshots).length}</dd></div>
      </dl>
    </section>
    <section className="getting-started" aria-label={t("Get started")}>
      <article id="run-evaluation" className="getting-started-card">
        <Bot size={23} aria-hidden="true" />
        <h2>{t("Run an evaluation")}</h2>
        <p>{t("Choose benchmarks, run tools and score results with Webstone.")}</p>
        <div className="getting-started-actions"><AgentPrompt id="evaluation-prompt" prompt={evaluationPrompt} t={t} /><a href={EVALUATION_URL} target="_blank" rel="noreferrer">webstone <ArrowUpRight size={14} aria-hidden="true" /></a></div>
      </article>
      <article id="submit-results" className="getting-started-card">
        <FileJson2 size={23} aria-hidden="true" />
        <h2>{t("Submit results")}</h2>
        <p>{t("Send measured results and public evidence to the leaderboard.")}</p>
        <div className="getting-started-actions"><AgentPrompt id="submission-prompt" prompt={submissionPrompt} t={t} /><a href={SUBMISSION_URL} target="_blank" rel="noreferrer">webstone-site <ArrowUpRight size={14} aria-hidden="true" /></a></div>
      </article>
      <article className="getting-started-card">
        <img src="/huggingface.svg" width={25} height={25} alt="" aria-hidden="true" />
        <h2>{t("Get datasets")}</h2>
        <p>{t("Browse the dataset cards, tasks and reference data.")}</p>
        <div className="getting-started-actions"><a className="dataset-action" href={DATASETS_URL} target="_blank" rel="noreferrer">{t("Datasets")} <ArrowUpRight size={16} aria-hidden="true" /></a></div>
      </article>
    </section>
    <section className="track-overview" aria-labelledby="track-overview-heading">
      <h2 id="track-overview-heading">{t("Explore by track")}</h2>
      <div className="track-overview-grid">{tracks.map(track => {
        const Icon = TRACK_ICONS[track.id] ?? Layers3;
        const landing = track.benchmarks[0];
        if (!landing) return null;
        return <div key={track.id} className="track-card" data-track={track.id}>
          <span className="track-group-label">{t(track.groupName)}</span>
          <h3><a href={benchmarkHref(landing.id)}><Icon size={18} aria-hidden="true" />{t(track.name)}<ArrowRight size={15} aria-hidden="true" /></a></h3>
          <p className="track-description">{t(track.description)}</p>
          <button type="button" className="example-open" aria-haspopup="dialog" onClick={() => setExampleTrack(track)}>{t("See an example")}</button>
          <div className="track-volume" aria-label={`${track.benchmarks.length} ${t("Benchmarks")}`}>
            {Array.from({ length: maxBenchmarks }, (_, index) => <span key={index} className={index < track.benchmarks.length ? "filled" : ""} aria-hidden="true" />)}
          </div>
          <p className="track-volume-label">{track.benchmarks.length} {t("benchmarks")}</p>
          <ul>{track.benchmarks.map(benchmark => <li key={benchmark.id}><a href={benchmarkHref(benchmark.id)}>{t(benchmark.name)}</a></li>)}</ul>
        </div>;
      })}
      {navigationGroups(catalog).filter(group => group.upcoming.length > 0).map(group => <div key={group.id} className="track-card upcoming-track"><span className="track-group-label">{t(group.name)}</span><h3><CircleDashed size={18} aria-hidden="true" />{group.upcoming.map(item => t(item.name)).join(" · ")}</h3><span className="upcoming-badge">{t("Coming soon")}</span><p>{t("Benchmarks are in development. Stay tuned.")}</p></div>)}
      </div>
    </section>
    {exampleTrack && <ExampleDialog key={exampleTrack.id} title={exampleTrack.name} description={exampleTrack.description} benchmarks={exampleTrack.benchmarks} onClose={() => setExampleTrack(null)} t={t} />}
    <EvaluationReports catalog={catalog} snapshots={snapshots} t={t} language={language} />
  </div>;
}

function AgentPrompt({ id, prompt, t }: { id: string; prompt: string; t: Props["t"] }) {
  const [copyStatus, setCopyStatus] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      setCopyStatus("Select and copy the prompt below.");
      promptRef.current?.focus();
      promptRef.current?.select();
      return;
    }
    setCopyStatus("Prompt copied");
  }

  return (
    <div className="prompt-panel">
      <button type="button" onClick={copyPrompt}><Clipboard size={16} aria-hidden="true" />{t(copyStatus === "Prompt copied" ? copyStatus : "Copy prompt")}</button>
      <span className="sr-only" role="status">{copyStatus && t(copyStatus)}</span>
      {copyStatus === "Select and copy the prompt below." && <textarea ref={promptRef} id={id} aria-label={t("Copy prompt")} readOnly value={prompt} autoFocus onFocus={event => event.currentTarget.select()} />}
      {copyStatus === "Select and copy the prompt below." && <p className="copy-hint">{t("Prompt selected. Use your device’s copy command.")}</p>}
    </div>
  );
}
