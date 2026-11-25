"use client";

import { useId, useState } from "react";
import MetricSelector from "./metric-selector";
import { qualityScale } from "../lib/comparisons";
import { radarAxes } from "../lib/radar";
import { formatMetric, sortProviders, type Benchmark, type Metric, type Provider } from "../lib/results";

type Props = { benchmark: Benchmark; t: (text: string) => string };
const radius = 123;
const colors = ["#007d64", "#5163a8", "#ad5229", "#925c95", "#247a9c", "#926b18",
  "#ac4e67", "#507d35", "#674bc1", "#4d7373", "#aa4944", "#4e5c70"];

function twoAxisComparison(benchmark: Benchmark): { quality: Metric; resource: Metric } | null {
  const quality = benchmark.metrics.find(metric => metric.id === benchmark.primaryMetric);
  const resource = benchmark.metrics.find(metric => metric.id !== benchmark.primaryMetric
    && ["usd", "ms", "seconds", "mib"].includes(metric.unit)
    && benchmark.providers.some(provider => typeof provider.scores[metric.id] === "number"));
  return quality && resource ? { quality, resource } : null;
}

function PairChart({ benchmark, providers, hidden, quality, resource, descriptionId, methodName, t }: {
  benchmark: Benchmark;
  providers: Provider[];
  hidden: string[];
  quality: Metric;
  resource: Metric;
  descriptionId: string;
  methodName: (provider: Provider) => string;
  t: Props["t"];
}) {
  const plotLeft = 68;
  const plotRight = 432;
  const dividerX = 456;
  const railCenter = 524;
  const plotTop = 28;
  const plotBottom = 272;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = plotRight - plotLeft;

  const scores = providers.map(provider => provider.scores[quality.id]).filter((value): value is number => typeof value === "number");
  const maxY = qualityScale(quality);
  const minScore = scores.length ? Math.min(...scores) : 0;
  const minY = maxY === 100
    ? Math.max(0, Math.min(90, Math.floor((minScore - 3) / 5) * 5))
    : 0;
  const spanY = Math.max(1, maxY - minY);
  const stepY = spanY <= 20 ? 5 : spanY <= 40 ? 10 : Math.ceil(spanY / 4);
  const yTicks: number[] = [];
  for (let value = minY; value <= maxY; value += stepY) yTicks.push(value);
  if (yTicks.at(-1) !== maxY) yTicks.push(maxY);
  const yPos = (value: number) => plotBottom - ((value - minY) / spanY) * plotHeight;

  const costs = providers.map(provider => provider.scores[resource.id]).filter((value): value is number => typeof value === "number");
  const uniqueCosts = [...new Set(costs)].sort((a, b) => a - b);
  const minCost = uniqueCosts[0] ?? 0;
  const maxCost = uniqueCosts.at(-1) ?? 0;
  const useLog = uniqueCosts.length >= 2 && minCost > 0 && maxCost / minCost > 5;
  const xPos = (value: number) => {
    if (uniqueCosts.length <= 1) return plotLeft + plotWidth / 2;
    if (useLog) {
      const lo = Math.log10(minCost);
      const hi = Math.log10(maxCost);
      const pad = Math.max(0.12, (hi - lo) * 0.16);
      return plotLeft + ((Math.log10(value) - (lo - pad)) / ((hi + pad) - (lo - pad))) * plotWidth;
    }
    const pad = Math.max(0.01, (maxCost - minCost) * 0.22);
    const lo = Math.max(0, minCost - pad);
    const hi = maxCost + pad;
    return plotLeft + ((value - lo) / (hi - lo)) * plotWidth;
  };

  const xTicks: number[] = [];
  for (const value of uniqueCosts) {
    if (!xTicks.length || Math.abs(xPos(value) - xPos(xTicks.at(-1)!)) >= 52) xTicks.push(value);
  }

  const visibleEntries = providers.map((provider, index) => ({ provider, index }))
    .filter(({ provider }) => !hidden.includes(provider.id));
  const missingEntries = visibleEntries.filter(({ provider }) => typeof provider.scores[resource.id] !== "number")
    .sort((a, b) => (b.provider.scores[quality.id] ?? 0) - (a.provider.scores[quality.id] ?? 0));
  const missingOffsets = new Map<string, number>();
  let lastY = -Infinity;
  let stagger = 0;
  for (const { provider } of missingEntries) {
    const score = provider.scores[quality.id];
    if (typeof score !== "number") continue;
    const y = yPos(score);
    if (Math.abs(y - lastY) < 16) stagger = stagger === 0 ? 1 : stagger === 1 ? -1 : 0;
    else stagger = 0;
    missingOffsets.set(provider.id, stagger * 18);
    lastY = y;
  }

  const labelFor = (provider: Provider) =>
    `${methodName(provider)} · ${t(quality.label)}: ${formatMetric(provider.scores[quality.id], quality.unit, quality.decimals)} · ${t(resource.label)}: ${formatMetric(provider.scores[resource.id], resource.unit, resource.decimals)}`;

  return <svg viewBox="0 0 600 340" role="img" aria-label={t("Capability profile")} aria-describedby={descriptionId}>
    <desc id={descriptionId}>{visibleEntries.map(({ provider }) => labelFor(provider)).join(". ")}</desc>
    {yTicks.map(tick => {
      const y = yPos(tick);
      return <g key={tick}>
        <line x1={plotLeft} y1={y} x2={plotRight} y2={y} className="radar-grid" />
        <line x1={dividerX + 12} y1={y} x2={580} y2={y} className="radar-grid" />
        <text x={plotLeft - 10} y={y + 4} textAnchor="end" className="radar-tick">
          {formatMetric(tick, quality.unit, quality.unit === "percent" ? 0 : quality.decimals)}
        </text>
      </g>;
    })}
    <line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} className="radar-axis" />
    <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} className="radar-axis" />
    <line x1={dividerX} y1={plotTop} x2={dividerX} y2={plotBottom} className="radar-divider" />
    <line x1={dividerX + 12} y1={plotBottom} x2={580} y2={plotBottom} className="radar-axis" />
    {xTicks.map(tick => {
      const x = xPos(tick);
      return <g key={tick}>
        <line x1={x} y1={plotTop} x2={x} y2={plotBottom} className="radar-grid" />
        <text x={x} y={plotBottom + 20} textAnchor="middle" className="radar-tick">
          {formatMetric(tick, resource.unit, resource.decimals)}
        </text>
      </g>;
    })}
    <text x={(plotLeft + plotRight) / 2} y={322} textAnchor="middle" className="radar-label">{t(resource.label)}</text>
    <text x={railCenter} y={plotBottom + 20} textAnchor="middle" className="radar-tick">{t("Undisclosed")}</text>
    <text x={18} y={(plotTop + plotBottom) / 2} textAnchor="middle" className="radar-label" transform={`rotate(-90 18 ${(plotTop + plotBottom) / 2})`}>{t(quality.label)}</text>
    {visibleEntries.map(({ provider, index }) => {
      const score = provider.scores[quality.id];
      if (typeof score !== "number") return null;
      const cost = provider.scores[resource.id];
      const disclosed = typeof cost === "number";
      const cx = disclosed ? xPos(cost) : railCenter + (missingOffsets.get(provider.id) ?? 0);
      const cy = yPos(score);
      const label = labelFor(provider);
      const scoreText = formatMetric(score, quality.unit, quality.decimals);
      const costText = disclosed ? formatMetric(cost, resource.unit, resource.decimals) : null;
      const textRight = cx < plotRight - 72;
      return <g key={provider.id} className="radar-series" style={{ color: colors[index % colors.length] }}
        tabIndex={0} aria-label={label}>
        <title>{label}</title>
        <circle className={`radar-dot ${disclosed ? "" : "is-undisclosed"}`} cx={cx} cy={cy} r="5.5" />
        {disclosed && <text x={textRight ? cx + 10 : cx - 10} y={cy + 4} textAnchor={textRight ? "start" : "end"} className="comparison-value">
          {`${scoreText} · ${costText}`}
        </text>}
      </g>;
    })}
  </svg>;
}

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

  const sortedProviders = sortProviders(benchmark.providers, primary.id, primary.direction);
  const pair = availableAxes.length === 2 ? twoAxisComparison(benchmark) : null;
  const providers = sortedProviders.map(provider => ({ provider, values: axes.map(axis => axis.value(provider)) }));

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
      {!pair && <MetricSelector label="Chart metrics" options={availableAxes} selectedIds={selectedIds}
        defaultIds={defaultIds} onChange={setSelectedMetrics} t={t} />}
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
        {pair ? <PairChart benchmark={benchmark} providers={sortedProviders} hidden={hidden}
          quality={pair.quality} resource={pair.resource} descriptionId={descriptionId} methodName={methodName} t={t} />
          : axes.length >= 3 ? <svg viewBox="-285 -173 570 346" role="img" aria-label={t("Capability profile")} aria-describedby={descriptionId}>
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
        {t(pair
          ? "Higher quality plots higher; lower cost plots farther left. Methods without disclosed cost appear on the right."
          : "Quality and category axes show a share of the maximum. Lower latency, memory and measured cost plot farther out when reported.")}
      </figcaption>
    </figure>
    </div>
  </section>;
}
