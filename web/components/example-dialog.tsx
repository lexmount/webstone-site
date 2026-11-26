"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { BenchmarkInfo } from "../lib/results";

export default function ExampleDialog({ title, description, benchmarks, onClose, t }: {
  title: string; description: string; benchmarks: BenchmarkInfo[]; onClose: () => void; t: (text: string) => string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const pressedBackdrop = useRef(false);
  const isBackdrop = (event: React.MouseEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  const [selected, setSelected] = useState(benchmarks[0]?.id);
  const benchmark = benchmarks.find(item => item.id === selected) ?? benchmarks[0];
  const example = benchmark?.example;
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="example-dialog" aria-labelledby={heading} onClose={onClose}
    onPointerDown={event => { pressedBackdrop.current = isBackdrop(event); }}
    onClick={event => { if (pressedBackdrop.current && isBackdrop(event)) event.currentTarget.close(); }}>
    <div className="dialog-heading"><h2 id={heading}>{t(title)}</h2><button autoFocus type="button" className="icon-button" aria-label={t("Close example")} onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button></div>
    <p className="example-intro">{t(description)}</p>
    {benchmarks.length > 1 && <div className="example-switcher" role="group" aria-label={t("Choose an example")}>
      {benchmarks.map(item => <button type="button" key={item.id} aria-pressed={item.id === benchmark.id} onClick={() => setSelected(item.id)}>{t(item.name)}</button>)}
    </div>}
    {example && <>
      <p className="example-source"><span>{t("Task")} <code>{example.taskId}</code></span><a href={example.sourceUrl} target="_blank" rel="noopener noreferrer">{t("View source task")} <ArrowUpRight size={13} aria-hidden="true" /><span className="sr-only"> ({t("opens in a new tab")})</span></a></p>
      {example.referenceUrl && <a className="example-reference" href={example.referenceUrl} target="_blank" rel="noopener noreferrer">{t("View reference")} ↗<span className="sr-only"> ({t("opens in a new tab")})</span></a>}
      <div className="example-flow">
        <section><h3><span>1</span>{t("Input")}</h3><pre>{example.input}</pre></section>
        <section><h3><span>2</span>{t("Run")}</h3><ol>{example.steps.map(step => <li key={step}>{t(step)}</li>)}</ol></section>
        <section><h3><span>3</span>{t(example.outputLabel)}</h3><pre>{example.output}</pre><p>{t(example.check)}</p></section>
      </div>
      {example.recording ? <p className="example-note">{example.recording.provider} · {t("Recorded response excerpt.")} <a href={example.recording.reportUrl} target="_blank" rel="noopener noreferrer">{t("View evaluation report")} ↗</a></p> : <p className="example-note">{t("This dataset example explains the task. Reference values are not a measured result for the selected version.")}</p>}
    </>}
  </dialog>;
}
