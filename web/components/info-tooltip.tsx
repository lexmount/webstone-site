"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

export default function InfoTooltip({ label, description, detailsLabel = "details", sources = [], sourcesLabel = "Official pricing" }: { label: string; description: string; detailsLabel?: string; sources?: { label: string; url: string }[]; sourcesLabel?: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; above: boolean } | null>(null);

  function show() {
    clearTimeout(timer.current);
    const rect = button.current!.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 24);
    const above = window.innerHeight - rect.bottom < 160 && rect.top > 160;
    setPosition({ width, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), top: above ? rect.top - 8 : rect.bottom + 8, above });
  }

  function hideSoon() {
    timer.current = setTimeout(() => setPosition(null), 120);
  }

  useEffect(() => {
    if (!position) return;
    const hide = () => { clearTimeout(timer.current); setPosition(null); };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { button.current?.focus(); hide(); } };
    const outside = (event: PointerEvent) => {
      if (!button.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) hide();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", outside);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", outside);
    };
  }, [position]);

  return <>
    <button ref={button} type="button" className="info-trigger" aria-label={`${label} ${detailsLabel}`} aria-describedby={position && sources.length === 0 ? id : undefined} aria-controls={position && sources.length > 0 ? id : undefined} aria-haspopup={sources.length > 0 ? "dialog" : undefined} aria-expanded={sources.length > 0 ? position !== null : undefined}
      onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={event => { if (!panel.current?.contains(event.relatedTarget as Node)) hideSoon(); }} onClick={show}>
      <CircleHelp size={13} strokeWidth={1.5} aria-hidden="true" />
    </button>
    {position && createPortal(<div ref={panel} id={id} role={sources.length > 0 ? "dialog" : "tooltip"} aria-label={sources.length > 0 ? `${label} ${detailsLabel}` : undefined} className="info-tooltip"
      style={{ left: position.left, top: position.top, width: position.width, transform: position.above ? "translateY(-100%)" : undefined }}
      onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={hideSoon} onFocus={() => clearTimeout(timer.current)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) hideSoon(); }}>
      <strong>{label}</strong><span>{description}</span>
      {sources.length > 0 && <div className="tooltip-sources"><strong>{sourcesLabel}</strong>{sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>)}</div>}
    </div>, document.body)}
  </>;
}
