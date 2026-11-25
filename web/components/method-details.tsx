"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { formatMetric, formatPricing, type Benchmark, type Provider } from "../lib/results";

export default function MethodDetails({ provider, benchmark, t, onClose }: { provider: Provider | null; benchmark: Benchmark; t: (text: string) => string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  function isBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget &&
      (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom);
  }

  useEffect(() => {
    if (provider && !dialog.current?.open) dialog.current?.showModal();
    else if (!provider && dialog.current?.open) dialog.current.close();
  }, [provider]);
  const scoredMetrics = benchmark.metrics.filter(metric => {
    const score = provider?.scores[metric.id];
    return score !== null && score !== undefined;
  });
  return <dialog ref={dialog} className="method-dialog" aria-labelledby="method-dialog-title" onClose={onClose}
    onPointerDown={event => { pressedBackdrop.current = isBackdrop(event); }}
    onClick={event => { if (pressedBackdrop.current && isBackdrop(event)) event.currentTarget.close(); }}>
    {provider && <>
      <div className="dialog-heading"><h2 id="method-dialog-title">{provider.name}</h2><button autoFocus className="icon-button" aria-label={t("Close details")} onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      {provider.description !== provider.name && <p className="method-description">{t(provider.description)}</p>}
      <dl className="method-meta">{provider.mode && provider.mode !== "Not specified" && <div><dt>{t("Configuration")}</dt><dd>{t(provider.mode)}</dd></div>}{(provider.pricing || provider.billingDescription) && <div><dt>{t("Billing basis")}</dt><dd>{provider.billingDescription ? t(provider.billingDescription) : provider.pricing ? <>{t(formatPricing(provider.pricing))} · {t(provider.pricing.description)}</> : t("Not supplied")}</dd></div>}</dl>
      <dl className="method-metrics">{scoredMetrics.map(metric => <div key={metric.id}><dt>{t(metric.label)}</dt><dd>{formatMetric(provider.scores[metric.id], metric.unit, metric.decimals, metric.signed, provider.counts?.[metric.id])}{metric.unit !== "count" && provider.counts?.[metric.id] && <small>{t("Count / total")}: {provider.counts[metric.id].count} / {provider.counts[metric.id].total}</small>}{provider.confidenceIntervals?.[metric.id] && <small>{t("95% confidence interval")}: {formatMetric(provider.confidenceIntervals[metric.id].lower, metric.unit, metric.decimals)}–{formatMetric(provider.confidenceIntervals[metric.id].upper, metric.unit, metric.decimals)}</small>}</dd></div>)}</dl>
    </>}
  </dialog>;
}
