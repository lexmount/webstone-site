"use client";

import { useId, useState } from "react";
import MetricSelector from "./metric-selector";
import { radarAxes } from "../lib/radar";
import { sortProviders, type Benchmark, type Provider } from "../lib/results";

type Props = { benchmark: Benchmark; t: (text: string) => string };
const radius = 123;
const colors = ["#007d64", "#5163a8", "#ad5229", "#925c95", "#247a9c", "#926b18",
  "#ac4e67", "#507d35", "#674bc1", "#4d7373", "#aa4944", "#4e5c70"];

export default function Insights({ benchmark, t }: Props) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[] | null>(null);
  const descriptionId = useId();
  const availableAxes = radarAxes(benchmark);
  const defaultIds = availableAxes.filter(axis => axis.defaultSelected).map(axis => axis.id);
  const selectedIds = selectedMetrics ?? defaultIds;
  const axes = availableAxes.filter(axis => selectedIds.includes(axis.id)).map(axis => ({ ...axis, label: t(axis.label) }));
  const primary = benchmark.metrics.find(metric => metric.id === benchmark.primaryMetric);
  if (!primary || !benchmark.providers.length || defaultIds.length < 3) return null;

  const providers = sortProviders(benchmark.providers, primary.id, primary.direction)
    .map(provider => ({ provider, values: axes.map(axis => axis.value(provider)) }));

  function point(index: number, distance: number) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
    return [Math.cos(angle) * distance, Math.sin(angle) * distance];
  }
  const ring = (level: number) => axes.map((_, index) => point(index, radius * level).join(",")).join(" ");
  const visible = providers.filter(({ provider }) => !hidden.includes(provider.id));
  const methodName = (provider: Provider) => provider.name.split(" · ").map(t).join(" · ");
  const profileLabel = (provider: Provider) =>
    [methodName(provider), ...axes.map(axis => `${axis.label}: ${axis.display(provider)}`)].join(" · ");

  return <section id="insights" className="insights-section" aria-labelledby="comparison-heading">
    <div className="radar-heading">
      <h2 id="comparison-heading">{t("Capability profile")}</h2>
      <MetricSelector label="Chart metrics" options={availableAxes} selectedIds={selectedIds}
        defaultIds={defaultIds} onChange={setSelectedMetrics} t={t} />
    </div>
    <div className="radar-layout">
    <div className="radar-legend" role="group" aria-label={t("Methods to compare")}>
      {providers.map(({ provider }, index) => <label key={provider.id} style={{ color: colors[index % colors.length] }}>
        <input type="checkbox" checked={!hidden.includes(provider.id)} onChange={event => {
          const checked = event.currentTarget.checked;
          setHidden(current => checked ? current.filter(id => id !== provider.id) : [...current, provider.id]);
        }} />
        <span>{methodName(provider)}</span>
      </label>)}
    </div>
    <figure className="radar-figure">
      <div className="radar-scroll" tabIndex={0} role="region" aria-label={t("Capability profile")}>
        {axes.length >= 3 ? <svg viewBox="-285 -173 570 346" role="img" aria-label={t("Capability profile")} aria-describedby={descriptionId}>
          <desc id={descriptionId}>{visible.map(({ provider }) => profileLabel(provider)).join(". ")}</desc>
          {[.25, .5, .75, 1].map(level => <g key={level}>
            <polygon points={ring(level)} className="radar-grid" />
            <text x="5" y={-radius * level + 12} className="radar-tick">{level * 100}</text>
          </g>)}
          {axes.map((axis, index) => {
            const [x, y] = point(index, radius);
            const [labelX, labelY] = point(index, radius + 25);
            const words = axis.label.split(" ");
            const split = Math.ceil(words.length / 2);
            const lines = words.length > 1 && axis.label.length > 17
              ? [words.slice(0, split).join(" "), words.slice(split).join(" ")] : [axis.label];
            let anchor: "middle" | "start" | "end" = "middle";
            if (labelX > 10) anchor = "start";
            if (labelX < -10) anchor = "end";
            return <g key={axis.id}>
              <line x1="0" y1="0" x2={x} y2={y} className="radar-axis" />
              <text x={labelX} y={labelY} textAnchor={anchor} className="radar-label">
                {lines.map((line, i) => <tspan key={line} x={labelX} dy={i === 0 ? 0 : 14}>{line}</tspan>)}
              </text>
            </g>;
          })}
          {providers.map(({ provider, values }, index) => {
            if (hidden.includes(provider.id)) return null;
            const label = profileLabel(provider);
            const locations = values.map((value, i) => value && point(i, value[0] * radius));
            const isExact = values.map(value => value !== null && value[0] === value[1]);
            const complete = isExact.every(Boolean);
            return <g key={provider.id} className="radar-series" style={{ color: colors[index % colors.length] }}
              tabIndex={0} aria-label={label}>
              <title>{label}</title>
              {complete && values.length >= 3 && <polygon className="radar-shape" points={locations.join(" ")} />}
              {locations.map((location, i) => {
                if (!location) return null;
                const nextIndex = (i + 1) % locations.length;
                const next = locations[nextIndex];
                const [x, y] = location;
                const bounds = values[i]!;
                const [upperX, upperY] = point(i, bounds[1] * radius);
                return <g key={axes[i].id}>
                  {!complete && isExact[i] && isExact[nextIndex] && next && <line className="radar-edge" x1={x} y1={y} x2={next[0]} y2={next[1]} />}
                  {bounds[0] !== bounds[1] && <>
                    <line className="radar-range" x1={x} y1={y} x2={upperX} y2={upperY} />
                    <circle className="radar-dot" cx={upperX} cy={upperY} r="2.5" />
                  </>}
                  <circle className="radar-dot" cx={x} cy={y} r="2.5" />
                </g>;
              })}
            </g>;
          })}
        </svg> : <p className="chart-empty" role="status">{t("Select at least three metrics for a radar chart.")}</p>}
      </div>
      {visible.length === 0 && <p role="status">{t("Select a method to show its results.")}</p>}
      <figcaption>
        {t("Quality and category axes show a share of the maximum. Lower latency, memory and measured cost plot farther out when reported.")}
      </figcaption>
    </figure>
    </div>
  </section>;
}
