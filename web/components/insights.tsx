"use client";

import { useId, useRef, useState } from "react";
import MetricSelector from "./metric-selector";
import { qualityMetrics, qualityScale } from "../lib/comparisons";
import { isEligibleResourceMetric, radarAxes } from "../lib/radar";
import { formatMetric, sortProviders, type Benchmark, type Metric, type Provider } from "../lib/results";

type Props = { benchmark: Benchmark; t: (text: string) => string };
const radius = 123;
const colors = ["#007d64", "#5163a8", "#ad5229", "#925c95", "#247a9c", "#926b18",
  "#ac4e67", "#507d35", "#674bc1", "#4d7373", "#aa4944", "#4e5c70"];

function twoAxisComparison(
  benchmark: Benchmark,
  availableAxes: ReturnType<typeof radarAxes>,
): { quality: Metric; resource: Metric } | null {
  if (benchmark.rankable === false || availableAxes.length >= 3) return null;
  const quality = qualityMetrics(benchmark).find(metric => metric.id === benchmark.primaryMetric);
  if (!quality) return null;
  const eligibleResources = benchmark.metrics.filter(metric => metric.id !== quality.id && isEligibleResourceMetric(metric));
  const availableIds = new Set(availableAxes.map(axis => axis.id));
  const availableResource = eligibleResources.find(metric => availableIds.has(metric.id));
  if (availableResource && availableAxes.length === 2 && availableIds.has(quality.id)) {
    return { quality, resource: availableResource };
  }
  if (availableAxes.length <= 1 && !availableAxes.some(axis => axis.id.startsWith("category:"))) {
    if (eligibleResources.length === 1) {
      return { quality, resource: eligibleResources[0] };
    }
  }
  return null;
}

function axisStep(span: number): number {
  if (span <= 20) return 5;
  if (span <= 40) return 10;
  return Math.ceil(span / 4);
}

type Box = { left: number; right: number; top: number; bottom: number };

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function labelBox(x: number, y: number, anchor: "start" | "middle" | "end", width: number): Box {
  if (anchor === "start") return { left: x - 2, right: x + width + 2, top: y - 11, bottom: y + 3 };
  if (anchor === "end") return { left: x - width - 2, right: x + 2, top: y - 11, bottom: y + 3 };
  return { left: x - width / 2 - 2, right: x + width / 2 + 2, top: y - 11, bottom: y + 3 };
}

type PairCluster = {
  id: string;
  kind: "disclosed" | "undisclosed";
  cx: number;
  cy: number;
  memberIds: string[];
};

type PairScale = {
  plotLeft: number;
  plotRight: number;
  dividerX: number;
  railCenter: number;
  plotTop: number;
  plotBottom: number;
  minY: number;
  maxY: number;
  yTicks: number[];
  yPos: (value: number) => number;
  uniqueCosts: number[];
  useLog: boolean;
  xPos: (value: number) => number;
  xTicks: number[];
};

function computePairScale(providers: Provider[], quality: Metric, resource: Metric): PairScale {
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
  const minY = maxY === 100 && scores.length > 0
    ? Math.max(0, Math.min(90, Math.floor((minScore - 3) / 5) * 5))
    : 0;
  const spanY = Math.max(1, maxY - minY);
  const stepY = axisStep(spanY);
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
    const lo = minCost - pad;
    const hi = maxCost + pad;
    return plotLeft + ((value - lo) / (hi - lo)) * plotWidth;
  };

  const xTicks: number[] = [];
  for (const value of uniqueCosts) {
    if (!xTicks.length || Math.abs(xPos(value) - xPos(xTicks.at(-1)!)) >= 52) xTicks.push(value);
  }

  return {
    plotLeft, plotRight, dividerX, railCenter, plotTop, plotBottom,
    minY, maxY, yTicks, yPos, uniqueCosts, useLog, xPos, xTicks,
  };
}

function groupDisclosedOverlaps(
  entries: Array<{ id: string; x: number; y: number }>,
): PairCluster[] {
  const entryById = new Map(entries.map(item => [item.id, item]));
  const visited = new Set<string>();
  const rawGroups: Array<Array<{ id: string; x: number; y: number }>> = [];
  for (const item of entries) {
    if (visited.has(item.id)) continue;
    const members = [item];
    visited.add(item.id);
    for (let index = 0; index < members.length; index++) {
      const current = members[index];
      for (const candidate of entries) {
        if (visited.has(candidate.id)) continue;
        if (Math.hypot(candidate.x - current.x, candidate.y - current.y) < DOT_RADIUS * 2) {
          visited.add(candidate.id);
          members.push(candidate);
        }
      }
    }
    if (members.length >= 2) rawGroups.push(members);
  }

  const pickAnchor = (
    members: Array<{ id: string; x: number; y: number }>,
    others: Array<{ id: string; x: number; y: number }>,
  ) => {
    const meanX = members.reduce((sum, entry) => sum + entry.x, 0) / members.length;
    const meanY = members.reduce((sum, entry) => sum + entry.y, 0) / members.length;
    const byCentroid = [...members].sort(
      (a, b) => Math.hypot(a.x - meanX, a.y - meanY) - Math.hypot(b.x - meanX, b.y - meanY),
    );
    const clear = byCentroid.find(member =>
      others.every(other => Math.hypot(member.x - other.x, member.y - other.y) >= CLUSTER_RADIUS + DOT_RADIUS + 1),
    );
    return clear ?? byCentroid[0];
  };

  let groups = rawGroups.map(members => ({
    memberIds: new Set(members.map(entry => entry.id)),
    cx: 0,
    cy: 0,
  }));

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      const members = [...groups[i].memberIds].map(id => entryById.get(id)!);
      const nonMembers = entries.filter(entry => !groups[i].memberIds.has(entry.id));
      const anchor = pickAnchor(members, nonMembers);
      groups[i].cx = Number(anchor.x.toFixed(2));
      groups[i].cy = Number(anchor.y.toFixed(2));
      for (const other of nonMembers) {
        if (Math.hypot(groups[i].cx - other.x, groups[i].cy - other.y) < CLUSTER_RADIUS + DOT_RADIUS + 1) {
          groups[i].memberIds.add(other.id);
          changed = true;
        }
      }
    }
    for (let i = 0; i < groups.length; i++) {
      for (let j = groups.length - 1; j > i; j--) {
        const sharesMember = [...groups[j].memberIds].some(id => groups[i].memberIds.has(id));
        const badgesCollide = Math.hypot(groups[i].cx - groups[j].cx, groups[i].cy - groups[j].cy) < CLUSTER_RADIUS * 2 + 1;
        if (sharesMember || badgesCollide) {
          for (const id of groups[j].memberIds) groups[i].memberIds.add(id);
          groups.splice(j, 1);
          changed = true;
        }
      }
    }
  }

  return groups.map(group => {
    const orderedIds = entries.filter(entry => group.memberIds.has(entry.id)).map(entry => entry.id);
    return {
      id: `disclosed:${orderedIds.join(",")}`,
      kind: "disclosed",
      cx: group.cx,
      cy: group.cy,
      memberIds: orderedIds,
    };
  });
}

function allocateDisclosedLabels(
  entries: Array<{ id: string; x: number; y: number; text: string }>,
  disclosedClusters: PairCluster[],
  bounds: { left: number; right: number; top: number; bottom: number },
): Map<string, { lx: number; ly: number; anchor: "start" | "middle" | "end"; leader: boolean }> {
  const overlapMemberIds = new Set(disclosedClusters.flatMap(cluster => cluster.memberIds));
  const markerBoxes: Box[] = [
    ...entries.map(point => ({
      left: point.x - 7, right: point.x + 7, top: point.y - 7, bottom: point.y + 7,
    })),
    ...disclosedClusters.map(cluster => ({
      left: cluster.cx - (CLUSTER_RADIUS + 2),
      right: cluster.cx + (CLUSTER_RADIUS + 2),
      top: cluster.cy - (CLUSTER_RADIUS + 2),
      bottom: cluster.cy + (CLUSTER_RADIUS + 2),
    })),
  ];
  const occupiedLabels: Box[] = [];
  const result = new Map<string, { lx: number; ly: number; anchor: "start" | "middle" | "end"; leader: boolean }>();

  for (const point of entries) {
    const width = Math.max(48, point.text.length * 6.5);
    const preferRight = point.x < bounds.right - width - 10;
    const offset = overlapMemberIds.has(point.id) ? 13 : 10;
    const sideCandidates: Array<{ lx: number; ly: number; anchor: "start" | "middle" | "end" }> = preferRight
      ? [
        { lx: point.x + offset, ly: point.y + 4, anchor: "start" },
        { lx: point.x - offset, ly: point.y + 4, anchor: "end" },
      ]
      : [
        { lx: point.x - offset, ly: point.y + 4, anchor: "end" },
        { lx: point.x + offset, ly: point.y + 4, anchor: "start" },
      ];
    const gridCandidates: Array<{ lx: number; ly: number; anchor: "start" | "middle" | "end" }> = [];
    const xOffsets = [0, -(width + 12), width + 12];
    for (const dy of [-16, 20, -30, 34, -44, 48]) {
      const ly = point.y + dy;
      for (const dx of xOffsets) {
        const clampedX = Math.max(bounds.left + width / 2, Math.min(bounds.right - width / 2, point.x + dx));
        gridCandidates.push({ lx: clampedX, ly, anchor: "middle" });
      }
    }
    const candidates = [...sideCandidates, ...gridCandidates];
    let chosen: { lx: number; ly: number; anchor: "start" | "middle" | "end" } | null = null;
    let chosenBox: Box | null = null;
    for (const candidate of candidates) {
      const box = labelBox(candidate.lx, candidate.ly, candidate.anchor, width);
      const inside = box.left >= bounds.left - 6 && box.right <= bounds.right + 6 && box.top >= bounds.top - 8 && box.bottom <= bounds.bottom + 8;
      if (!inside) continue;
      if (occupiedLabels.some(existing => boxesOverlap(box, existing))) continue;
      if (markerBoxes.some(marker => boxesOverlap(box, marker))) continue;
      chosen = candidate;
      chosenBox = box;
      break;
    }
    if (!chosen || !chosenBox) continue;
    occupiedLabels.push(chosenBox);
    result.set(point.id, {
      lx: Number(chosen.lx.toFixed(2)),
      ly: Number(chosen.ly.toFixed(2)),
      anchor: chosen.anchor,
      leader: Math.abs(chosen.ly - (point.y + 4)) > 6 || Math.abs(chosen.lx - point.x) > width / 2 + 14,
    });
  }
  return result;
}

const DOT_RADIUS = 5.5;
const CLUSTER_RADIUS = 9.5;

function allocateUndisclosedRail(
  entries: Array<{ id: string; y: number }>,
  railLeft: number,
  railRight: number,
): { positions: Map<string, number>; overflowClusters: PairCluster[] } {
  const center = (railLeft + railRight) / 2;
  const lanes: number[] = [center];
  for (let offset = 16; center - offset >= railLeft && center + offset <= railRight; offset += 16) {
    lanes.push(center - offset, center + offset);
  }

  type SingleMarker = { kind: "single"; id: string; cx: number; cy: number; r: number };
  type BadgeMarker = { kind: "badge"; cx: number; cy: number; r: number; members: Array<{ id: string; y: number }> };
  const placed: Array<SingleMarker | BadgeMarker> = [];

  const collides = (ax: number, ay: number, ar: number, bx: number, by: number, br: number) =>
    Math.hypot(ax - bx, ay - by) < ar + br + 1;

  const findClearLane = (y: number, ignore?: SingleMarker | BadgeMarker): number | null => {
    for (const laneX of lanes) {
      const blocked = placed.some(other => other !== ignore && collides(laneX, y, DOT_RADIUS, other.cx, other.cy, other.r));
      if (!blocked) return laneX;
    }
    return null;
  };

  for (const item of entries) {
    const matchingBadge = placed.find(
      (marker): marker is BadgeMarker => marker.kind === "badge" && Math.abs(marker.cy - item.y) < DOT_RADIUS * 2 + 1,
    );
    if (matchingBadge) {
      matchingBadge.members.push(item);
      matchingBadge.cy = Number((matchingBadge.members.reduce((sum, member) => sum + member.y, 0) / matchingBadge.members.length).toFixed(2));
      continue;
    }
    const laneX = findClearLane(item.y);
    if (laneX !== null) {
      placed.push({ kind: "single", id: item.id, cx: laneX, cy: item.y, r: DOT_RADIUS });
      continue;
    }
    const members: Array<{ id: string; y: number }> = [item];
    for (let index = placed.length - 1; index >= 0; index--) {
      const existing = placed[index];
      const threshold = existing.kind === "badge" ? CLUSTER_RADIUS + CLUSTER_RADIUS + 1 : DOT_RADIUS + DOT_RADIUS + 1;
      if (Math.abs(existing.cy - item.y) < threshold) {
        if (existing.kind === "badge") members.push(...existing.members);
        else members.push({ id: existing.id, y: existing.cy });
        placed.splice(index, 1);
      }
    }
    const badgeY = Number((members.reduce((sum, member) => sum + member.y, 0) / members.length).toFixed(2));
    placed.push({ kind: "badge", cx: center, cy: badgeY, r: CLUSTER_RADIUS, members });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < placed.length; i++) {
      const first = placed[i];
      if (first.kind !== "badge") continue;
      for (let j = placed.length - 1; j >= 0; j--) {
        if (i === j) continue;
        const second = placed[j];
        if (!collides(first.cx, first.cy, first.r, second.cx, second.cy, second.r)) continue;
        if (second.kind === "single") {
          const relocated = findClearLane(second.cy, second);
          if (relocated !== null) {
            second.cx = relocated;
            changed = true;
            continue;
          }
          first.members.push({ id: second.id, y: second.cy });
        } else {
          first.members.push(...second.members);
        }
        placed.splice(j, 1);
        if (j < i) i--;
        first.cy = Number((first.members.reduce((sum, member) => sum + member.y, 0) / first.members.length).toFixed(2));
        changed = true;
      }
    }
  }

  const positions = new Map<string, number>();
  const overflowClusters: PairCluster[] = [];
  for (const marker of placed) {
    if (marker.kind === "single") {
      positions.set(marker.id, Number(marker.cx.toFixed(2)));
    } else {
      const sortedMembers = [...marker.members].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
      overflowClusters.push({
        id: `undisclosed:${sortedMembers.map(member => member.id).join(",")}`,
        kind: "undisclosed",
        cx: marker.cx,
        cy: marker.cy,
        memberIds: sortedMembers.map(member => member.id),
      });
    }
  }
  return { positions, overflowClusters };
}

function computePairLayout(
  visibleEntries: Array<{ provider: Provider; index: number }>,
  quality: Metric,
  resource: Metric,
  scale: PairScale,
) {
  const { plotLeft, plotRight, dividerX, plotTop, plotBottom, yPos, xPos } = scale;
  const undisclosedScored = visibleEntries
    .flatMap(({ provider }) => {
      const score = provider.scores[quality.id];
      if (typeof score !== "number" || typeof provider.scores[resource.id] === "number") return [];
      return [{ id: provider.id, y: yPos(score) }];
    })
    .sort((a, b) => a.y - b.y);
  const { positions: undisclosedX, overflowClusters } = allocateUndisclosedRail(undisclosedScored, dividerX + 20, 572);
  const disclosedScored = visibleEntries.flatMap(({ provider }) => {
    const score = provider.scores[quality.id];
    const cost = provider.scores[resource.id];
    if (typeof score !== "number" || typeof cost !== "number") return [];
    const scoreText = formatMetric(score, quality.unit, quality.decimals);
    const costText = formatMetric(cost, resource.unit, resource.decimals);
    return [{ id: provider.id, x: Number(xPos(cost).toFixed(2)), y: Number(yPos(score).toFixed(2)), text: `${scoreText} · ${costText}` }];
  });
  const disclosedClusters = groupDisclosedOverlaps(disclosedScored);
  const disclosedLabels = allocateDisclosedLabels(disclosedScored, disclosedClusters, {
    left: plotLeft + 8, right: plotRight - 8, top: plotTop + 8, bottom: plotBottom - 8,
  });
  return {
    undisclosedX,
    overflowClusters,
    overflowMemberIds: new Set(overflowClusters.flatMap(cluster => cluster.memberIds)),
    disclosedClusters,
    disclosedLabels,
    allClusters: [...disclosedClusters, ...overflowClusters],
  };
}

function PairChart({ visibleEntries, quality, resource, scale, layout, activeProviderId, selectedClusterId, onSelectCluster, descriptionId, methodName, t }: {
  visibleEntries: Array<{ provider: Provider; index: number }>;
  quality: Metric;
  resource: Metric;
  scale: PairScale;
  layout: ReturnType<typeof computePairLayout>;
  activeProviderId: string | null;
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string | null, trigger?: HTMLElement | SVGElement | null) => void;
  descriptionId: string;
  methodName: (provider: Provider) => string;
  t: Props["t"];
}) {
  const { plotLeft, plotRight, dividerX, railCenter, plotTop, plotBottom, yTicks, yPos, useLog, xPos, xTicks } = scale;
  const { undisclosedX, overflowMemberIds, disclosedLabels, allClusters } = layout;
  const providerLookup = new Map(visibleEntries.map(entry => [entry.provider.id, entry]));

  const labelFor = (provider: Provider) =>
    `${methodName(provider)} · ${t(quality.label)}: ${formatMetric(provider.scores[quality.id], quality.unit, quality.decimals)} · ${t(resource.label)}: ${formatMetric(provider.scores[resource.id], resource.unit, resource.decimals)}`;

  const orderedEntries = activeProviderId
    ? [...visibleEntries.filter(entry => entry.provider.id !== activeProviderId), ...visibleEntries.filter(entry => entry.provider.id === activeProviderId)]
    : visibleEntries;

  const resourceAxisLabel = useLog ? `${t(resource.label)} (${t("log scale")})` : t(resource.label);

  return <svg viewBox="0 0 600 340" role="group" aria-label={t("Capability profile")} aria-describedby={descriptionId}>
    <desc id={descriptionId}>{visibleEntries.map(({ provider }) => labelFor(provider)).join(". ")}</desc>
    {yTicks.map(tick => {
      const y = yPos(tick);
      const tickDecimals = quality.unit === "percent" ? 0 : quality.decimals;
      return <g key={tick}>
        <line x1={plotLeft} y1={y} x2={plotRight} y2={y} className="radar-grid" />
        <line x1={dividerX + 12} y1={y} x2={580} y2={y} className="radar-grid" />
        <text x={plotLeft - 10} y={y + 4} textAnchor="end" className="radar-tick">
          {formatMetric(tick, quality.unit, tickDecimals)}
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
    <text x={(plotLeft + plotRight) / 2} y={322} textAnchor="middle" className="radar-label">{resourceAxisLabel}</text>
    <text x={railCenter} y={plotBottom + 20} textAnchor="middle" className="radar-tick">{t("Undisclosed")}</text>
    <text x={18} y={(plotTop + plotBottom) / 2} textAnchor="middle" className="radar-label" transform={`rotate(-90 18 ${(plotTop + plotBottom) / 2})`}>{t(quality.label)}</text>
    {orderedEntries.map(({ provider, index }) => {
      const score = provider.scores[quality.id];
      const cost = provider.scores[resource.id];
      const disclosed = typeof cost === "number";
      if (!disclosed && overflowMemberIds.has(provider.id)) return null;
      const label = labelFor(provider);
      const seriesColor = colors[index % colors.length];
      const activeClass = activeProviderId === provider.id ? "radar-series is-active" : "radar-series";
      if (typeof score !== "number") {
        const tickX = disclosed ? xPos(cost) : null;
        return <g key={provider.id} className={activeClass} style={{ color: seriesColor }}
          tabIndex={0} aria-label={label}>
          <title>{label}</title>
          {tickX !== null && <line x1={tickX} y1={plotBottom - 5} x2={tickX} y2={plotBottom + 5} stroke="currentColor" strokeWidth="2.5" />}
        </g>;
      }
      const cx = disclosed ? Number(xPos(cost).toFixed(2)) : (undisclosedX.get(provider.id) ?? railCenter);
      const cy = Number(yPos(score).toFixed(2));
      const labelPlacement = disclosed ? disclosedLabels.get(provider.id) : null;
      const scoreText = formatMetric(score, quality.unit, quality.decimals);
      const costText = disclosed ? formatMetric(cost, resource.unit, resource.decimals) : null;
      const dotClass = disclosed ? "radar-dot" : "radar-dot is-undisclosed";
      let leaderY = cy;
      if (labelPlacement) {
        leaderY = labelPlacement.ly > cy ? labelPlacement.ly - 10 : labelPlacement.ly + 3;
      }
      return <g key={provider.id} className={activeClass} style={{ color: seriesColor }}
        tabIndex={0} aria-label={label}>
        <title>{label}</title>
        {labelPlacement?.leader && <line className="radar-leader" x1={cx} y1={cy} x2={labelPlacement.lx} y2={leaderY} />}
        <circle className={dotClass} cx={cx} cy={cy} r="5.5" />
        {labelPlacement && <text x={labelPlacement.lx} y={labelPlacement.ly} textAnchor={labelPlacement.anchor} className="comparison-value">
          {`${scoreText} · ${costText}`}
        </text>}
      </g>;
    })}
    {allClusters.map(cluster => {
      const members = cluster.memberIds.map(id => providerLookup.get(id)).filter((item): item is { provider: Provider; index: number } => Boolean(item));
      const summary = members.map(({ provider }) => labelFor(provider)).join("\n");
      const heading = t("{count} overlapping methods").replace("{count}", String(members.length));
      const isSelected = selectedClusterId === cluster.id;
      const clusterClass = cluster.kind === "undisclosed" ? "pair-cluster is-undisclosed" : "pair-cluster";
      const toggleCluster = (trigger: SVGGElement) => onSelectCluster(isSelected ? null : cluster.id, trigger);
      return <g key={cluster.id} className={isSelected ? `${clusterClass} is-selected` : clusterClass}
        role="button" tabIndex={0} aria-expanded={isSelected}
        aria-label={`${heading}: ${members.map(({ provider }) => labelFor(provider)).join("; ")}`}
        onClick={event => toggleCluster(event.currentTarget)}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleCluster(event.currentTarget);
          } else if (event.key === "Escape" && isSelected) {
            onSelectCluster(null, event.currentTarget);
          }
        }}>
        <title>{`${heading}\n${summary}`}</title>
        <circle className="pair-cluster-badge" cx={cluster.cx} cy={cluster.cy} r="9.5" />
        <text className="pair-cluster-count" x={cluster.cx} y={cluster.cy + 3.5} textAnchor="middle">{members.length}</text>
      </g>;
    })}
  </svg>;
}

export default function Insights({ benchmark, t }: Props) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[] | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const clusterTriggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const descriptionId = useId();
  function handleSelectCluster(clusterId: string | null, trigger?: HTMLElement | SVGElement | null) {
    if (trigger) clusterTriggerRef.current = trigger;
    setSelectedClusterId(clusterId);
  }
  function dismissCluster() {
    setSelectedClusterId(null);
    const trigger = clusterTriggerRef.current;
    if (trigger && trigger.isConnected) {
      trigger.focus();
    }
  }
  const availableAxes = radarAxes(benchmark);
  const defaultIds = availableAxes.filter(axis => axis.defaultSelected).map(axis => axis.id);
  const selectedIds = selectedMetrics ?? defaultIds;
  const axes = availableAxes.filter(axis => selectedIds.includes(axis.id)).map(axis => ({ ...axis, label: t(axis.label) }));
  const primary = benchmark.metrics.find(metric => metric.id === benchmark.primaryMetric);
  if (!primary || !benchmark.providers.length) return null;

  const sortedProviders = sortProviders(benchmark.providers, primary.id, primary.direction);
  const pair = twoAxisComparison(benchmark, availableAxes);
  if (!pair && defaultIds.length < 3) return null;
  const pairScale = pair ? computePairScale(sortedProviders, pair.quality, pair.resource) : null;
  const providers = sortedProviders.map(provider => ({ provider, values: axes.map(axis => axis.value(provider)) }));

  function point(index: number, distance: number) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
    return [Math.cos(angle) * distance, Math.sin(angle) * distance];
  }
  const ring = (level: number) => axes.map((_, index) => point(index, radius * level).join(",")).join(" ");
  const visible = providers.filter(({ provider }) => !hidden.includes(provider.id));
  const missingPrimaryOnly = Boolean(pair && visible.length > 0 && visible.every(({ provider }) => typeof provider.scores[pair.quality.id] !== "number"));
  const methodName = (provider: Provider) => provider.name.split(" · ").map(t).join(" · ");
  const profileLabel = (provider: Provider) =>
    [methodName(provider), ...axes.map(axis => `${axis.label}: ${axis.display(provider)}`)].join(" · ");

  const visibleIndexed = sortedProviders.map((provider, index) => ({ provider, index })).filter(({ provider }) => !hidden.includes(provider.id));
  const pairLayout = pair && pairScale ? computePairLayout(visibleIndexed, pair.quality, pair.resource, pairScale) : null;
  let activeClusterMembers: Array<{ provider: Provider; index: number }> = [];
  let activeClusterKind: "disclosed" | "undisclosed" | null = null;
  if (pairLayout && selectedClusterId) {
    const lookup = new Map(visibleIndexed.map(item => [item.provider.id, item]));
    const matched = pairLayout.allClusters.find(cluster => cluster.id === selectedClusterId);
    if (matched) {
      activeClusterKind = matched.kind;
      activeClusterMembers = matched.memberIds.map(id => lookup.get(id)).filter((item): item is { provider: Provider; index: number } => Boolean(item));
    }
  }

  let caption = t("Quality and category axes show a share of the maximum. Lower latency, memory and measured cost plot farther out when reported.");
  if (pair && pairScale) {
    const parts = [
      t("Higher {quality} plots higher; lower {resource} plots farther left. Methods without a disclosed value appear on the right.")
        .replaceAll("{quality}", t(pair.quality.label))
        .replaceAll("{resource}", t(pair.resource.label)),
    ];
    if (pairScale.useLog) {
      parts.push(t("Horizontal {resource} axis uses a logarithmic scale.").replaceAll("{resource}", t(pair.resource.label)));
    }
    if (pairScale.minY > 0) {
      const baselineDecimals = pair.quality.unit === "percent" ? 0 : pair.quality.decimals;
      const minYText = formatMetric(pairScale.minY, pair.quality.unit, baselineDecimals);
      parts.push(t("Vertical {quality} axis starts at {minY} rather than zero.")
        .replaceAll("{quality}", t(pair.quality.label))
        .replaceAll("{minY}", minYText));
    }
    caption = parts.join(" ");
  }

  let chart = <p className="chart-empty" role="status">{t("Select at least three metrics for a radar chart.")}</p>;
  if (pair && pairScale && pairLayout) {
    chart = <PairChart visibleEntries={visibleIndexed}
      quality={pair.quality} resource={pair.resource} scale={pairScale} layout={pairLayout}
      activeProviderId={activeProviderId} selectedClusterId={selectedClusterId} onSelectCluster={handleSelectCluster}
      descriptionId={descriptionId} methodName={methodName} t={t} />;
  } else if (axes.length >= 3) {
    chart = <svg viewBox="-285 -173 570 346" role="img" aria-label={t("Capability profile")} aria-describedby={descriptionId}>
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
    </svg>;
  }

  return <section id="insights" className="insights-section" aria-labelledby="comparison-heading">
    <div className="radar-heading">
      <h2 id="comparison-heading">{t("Capability profile")}</h2>
      {!pair && <MetricSelector label="Chart metrics" options={availableAxes} selectedIds={selectedIds}
        defaultIds={defaultIds} onChange={setSelectedMetrics} t={t} />}
    </div>
    <div className="radar-layout">
    <div className="radar-legend" role="group" aria-label={t("Methods to compare")}>
      {providers.map(({ provider }, index) => <label key={provider.id} style={{ color: colors[index % colors.length] }}
        onMouseEnter={() => setActiveProviderId(provider.id)}
        onMouseLeave={() => setActiveProviderId(current => current === provider.id ? null : current)}
        onFocus={() => setActiveProviderId(provider.id)}
        onBlur={() => setActiveProviderId(current => current === provider.id ? null : current)}>
        <input type="checkbox" checked={!hidden.includes(provider.id)} onChange={event => {
          const checked = event.currentTarget.checked;
          setHidden(current => checked ? current.filter(id => id !== provider.id) : [...current, provider.id]);
        }} />
        <span>{methodName(provider)}</span>
      </label>)}
    </div>
    <figure className="radar-figure">
      <div className="radar-scroll" tabIndex={0} role="region" aria-label={t("Capability profile")}>
        {chart}
      </div>
      {pair && pairLayout && pairLayout.allClusters.length > 0 && <div className="pair-cluster-controls" role="group" aria-label={t("Overlapping method groups")}>
        {pairLayout.allClusters.map(cluster => {
          const isSelected = selectedClusterId === cluster.id;
          const lead = sortedProviders.find(provider => provider.id === cluster.memberIds[0]);
          const qualitySummary = lead ? formatMetric(lead.scores[pair.quality.id], pair.quality.unit, pair.quality.decimals) : "";
          let resourceSummary = "";
          if (cluster.kind === "undisclosed") {
            resourceSummary = t("Undisclosed");
          } else if (lead) {
            resourceSummary = formatMetric(lead.scores[pair.resource.id], pair.resource.unit, pair.resource.decimals);
          }
          const buttonLabel = `${t("{count} overlapping methods").replace("{count}", String(cluster.memberIds.length))} (${qualitySummary} · ${resourceSummary})`;
          return <button key={cluster.id} type="button" className={isSelected ? "pair-cluster-button is-selected" : "pair-cluster-button"}
            aria-expanded={isSelected}
            onClick={event => handleSelectCluster(isSelected ? null : cluster.id, event.currentTarget)}>
            {buttonLabel}
          </button>;
        })}
      </div>}
      {pair && activeClusterMembers.length > 0 && <div className="pair-inspector" role="region"
        aria-label={t(activeClusterKind === "undisclosed" ? "Undisclosed methods" : "Overlapping methods")}
        onKeyDown={event => { if (event.key === "Escape") dismissCluster(); }}>
        <div className="pair-inspector-header">
          <strong>{t("{count} overlapping methods").replace("{count}", String(activeClusterMembers.length))}</strong>
          <button type="button" className="text-button" onClick={dismissCluster}>{t("Close group details")}</button>
        </div>
        <ul>
          {activeClusterMembers.map(({ provider, index }) => <li key={provider.id} style={{ "--series-color": colors[index % colors.length] } as React.CSSProperties}>
            <span className="pair-inspector-swatch" aria-hidden="true" />
            <span className="pair-inspector-name">{methodName(provider)}</span>
            <span className="pair-inspector-values">
              {formatMetric(provider.scores[pair.quality.id], pair.quality.unit, pair.quality.decimals)}
              {" · "}
              {formatMetric(provider.scores[pair.resource.id], pair.resource.unit, pair.resource.decimals)}
            </span>
          </li>)}
        </ul>
      </div>}
      {visible.length === 0 && <p role="status">{t("Select a method to show its results.")}</p>}
      {missingPrimaryOnly && <p role="status">{t("Selected methods do not disclose the primary quality metric.")}</p>}
      <figcaption>{caption}</figcaption>
    </figure>
    </div>
  </section>;
}
