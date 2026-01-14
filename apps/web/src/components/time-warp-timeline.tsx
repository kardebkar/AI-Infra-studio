'use client';

import * as React from 'react';

import type { MetricPoint, TimelineEvent } from '@ai-infra-studio/types';
import { Badge, Button, cn } from '@ai-infra-studio/ui';

type PinnedMoment = { id: string; ts: string; eventType?: string };

type Props = {
  runId: string;
  startedAt: string;
  endedAt?: string;
  events: TimelineEvent[];
  metrics: Record<string, MetricPoint[]>;
  pinned: PinnedMoment[];
  onPin: (event: TimelineEvent) => void;
};

const TRACKS: Array<{ key: TimelineEvent['type']; label: string }> = [
  { key: 'commit', label: 'Commit' },
  { key: 'deploy', label: 'Deploy' },
  { key: 'checkpoint', label: 'Checkpoints' },
  { key: 'alert', label: 'Alerts' },
  { key: 'log_spike', label: 'Log spikes' },
] as const;

function severityColor(severity?: TimelineEvent['severity']) {
  if (severity === 'critical') return 'text-red-200';
  if (severity === 'warning') return 'text-amber-200';
  return 'text-sky-200';
}

function severityFill(severity?: TimelineEvent['severity']) {
  if (severity === 'critical') return 'fill-red-400';
  if (severity === 'warning') return 'fill-amber-400';
  return 'fill-sky-400';
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function ms(iso: string) {
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : 0;
}

function nearestMetric(series: MetricPoint[], tsMs: number) {
  if (series.length === 0) return null;
  let best: MetricPoint | null = null;
  let bestDist = Infinity;
  for (const p of series) {
    const d = Math.abs(ms(p.ts) - tsMs);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export function TimeWarpTimeline(props: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const minimapRef = React.useRef<HTMLDivElement | null>(null);

  const fullStart = ms(props.startedAt);
  const fullEnd = React.useMemo(() => {
    if (props.endedAt) return ms(props.endedAt);
    const maxEvent = Math.max(0, ...props.events.map((e) => ms(e.ts)));
    const maxMetric = Math.max(
      0,
      ...Object.values(props.metrics)
        .flat()
        .map((p) => ms(p.ts)),
    );
    return Math.max(Date.now(), maxEvent, maxMetric);
  }, [props.endedAt, props.events, props.metrics]);

  const fullSpan = Math.max(1, fullEnd - fullStart);

  const [view, setView] = React.useState<{ start: number; end: number }>({ start: fullStart, end: fullEnd });

  React.useEffect(() => {
    setView({ start: fullStart, end: fullEnd });
  }, [fullStart, fullEnd]);

  const viewSpan = Math.max(1, view.end - view.start);

  const pinnedSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of props.pinned) {
      if (p.eventType) set.add(`${p.ts}_${p.eventType}`);
    }
    return set;
  }, [props.pinned]);

  const trackEvents = React.useMemo(() => {
    const map = new Map<TimelineEvent['type'], TimelineEvent[]>();
    for (const t of TRACKS) map.set(t.key, []);
    for (const e of props.events) {
      const list = map.get(e.type);
      if (list) list.push(e);
    }
    for (const list of map.values()) list.sort((a, b) => ms(a.ts) - ms(b.ts));
    return map;
  }, [props.events]);

  const [hover, setHover] = React.useState<{
    tsMs: number;
    xPx: number;
    yPx: number;
    nearestEvent: TimelineEvent | null;
  } | null>(null);

  const layout = React.useMemo(() => {
    const w = 980;
    const marginLeft = 120;
    const marginRight = 16;
    const rowH = 30;
    const rows = TRACKS.length;
    const h = 26 + rows * rowH + 10;
    const plotW = w - marginLeft - marginRight;
    return { w, h, marginLeft, marginRight, rowH, rows, plotW };
  }, []);

  const timeToX = React.useCallback(
    (tsMs: number) => {
      const t = (tsMs - view.start) / viewSpan;
      return layout.marginLeft + clamp01(t) * layout.plotW;
    },
    [layout.marginLeft, layout.plotW, view.start, viewSpan],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pointerXCoord = (x / rect.width) * layout.w;
    const pointerPlotCoord = Math.min(
      Math.max(pointerXCoord, layout.marginLeft),
      layout.w - layout.marginRight,
    );
    const plotRatio = (pointerPlotCoord - layout.marginLeft) / layout.plotW;
    const tsMs = view.start + clamp01(plotRatio) * viewSpan;

    let nearest: TimelineEvent | null = null;
    let bestDistPx = Infinity;
    for (const track of TRACKS) {
      const list = trackEvents.get(track.key) ?? [];
      for (const ev of list) {
        const evX = timeToX(ms(ev.ts));
        const distCoord = Math.abs(evX - pointerPlotCoord);
        const distPx = (distCoord / layout.w) * rect.width;
        if (distPx < bestDistPx) {
          bestDistPx = distPx;
          nearest = ev;
        }
      }
    }

    const threshold = 22;
    setHover({
      tsMs,
      xPx: x,
      yPx: y,
      nearestEvent: bestDistPx <= threshold ? nearest : null,
    });
  };

  const onPointerLeave = () => setHover(null);

  // Brush interactions
  const dragRef = React.useRef<{
    mode: 'none' | 'move' | 'resizeLeft' | 'resizeRight' | 'new';
    startClientX: number;
    startRange: { start: number; end: number };
    anchorRatio: number;
  }>({ mode: 'none', startClientX: 0, startRange: { start: view.start, end: view.end }, anchorRatio: 0 });

  const viewToRatios = React.useCallback(
    (v: { start: number; end: number }) => {
      const s = (v.start - fullStart) / fullSpan;
      const e = (v.end - fullStart) / fullSpan;
      return { s: clamp01(s), e: clamp01(e) };
    },
    [fullStart, fullSpan],
  );

  const ratiosToView = React.useCallback(
    (s: number, e: number) => {
      const start = fullStart + clamp01(s) * fullSpan;
      const end = fullStart + clamp01(e) * fullSpan;
      return { start: Math.min(start, end), end: Math.max(start, end) };
    },
    [fullStart, fullSpan],
  );

  const onBrushPointerDown = (e: React.PointerEvent) => {
    const el = minimapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = clamp01(x / rect.width);

    const { s, e: er } = viewToRatios(view);
    const pxThreshold = 10;
    const distLeftPx = Math.abs(x - s * rect.width);
    const distRightPx = Math.abs(x - er * rect.width);

    let mode: 'move' | 'resizeLeft' | 'resizeRight' | 'new' = 'new';
    if (distLeftPx <= pxThreshold) mode = 'resizeLeft';
    else if (distRightPx <= pxThreshold) mode = 'resizeRight';
    else if (ratio >= s && ratio <= er) mode = 'move';

    dragRef.current = {
      mode,
      startClientX: e.clientX,
      startRange: { start: view.start, end: view.end },
      anchorRatio: ratio,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onBrushPointerMove = (e: React.PointerEvent) => {
    const el = minimapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mode = dragRef.current.mode;
    if (mode === 'none') return;

    const minSpanMs = 2 * 60_000;
    const minSpanRatio = minSpanMs / fullSpan;

    const dx = e.clientX - dragRef.current.startClientX;
    const dxRatio = dx / rect.width;

    const start = dragRef.current.startRange;
    const r0 = viewToRatios(start);

    if (mode === 'move') {
      let s = r0.s + dxRatio;
      let er = r0.e + dxRatio;
      const span = er - s;
      if (s < 0) {
        s = 0;
        er = span;
      }
      if (er > 1) {
        er = 1;
        s = 1 - span;
      }
      setView(ratiosToView(s, er));
      return;
    }

    if (mode === 'resizeLeft') {
      let s = r0.s + dxRatio;
      s = Math.min(s, r0.e - minSpanRatio);
      setView(ratiosToView(s, r0.e));
      return;
    }

    if (mode === 'resizeRight') {
      let er = r0.e + dxRatio;
      er = Math.max(er, r0.s + minSpanRatio);
      setView(ratiosToView(r0.s, er));
      return;
    }

    // new selection
    const ratio = clamp01((e.clientX - rect.left) / rect.width);
    const s = clamp01(Math.min(dragRef.current.anchorRatio, ratio));
    const er = clamp01(Math.max(dragRef.current.anchorRatio, ratio));
    if (er - s < minSpanRatio) {
      const mid = (s + er) / 2;
      setView(ratiosToView(mid - minSpanRatio / 2, mid + minSpanRatio / 2));
    } else {
      setView(ratiosToView(s, er));
    }
  };

  const onBrushPointerUp = (e: React.PointerEvent) => {
    dragRef.current.mode = 'none';
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const metricsAtHover = React.useMemo(() => {
    if (!hover) return null;
    const out: Array<{ name: string; value: number | null }> = [];
    for (const [name, series] of Object.entries(props.metrics)) {
      const p = nearestMetric(series, hover.tsMs);
      out.push({ name, value: p?.value ?? null });
    }
    return out;
  }, [hover, props.metrics]);

  const { s: brushS, e: brushE } = viewToRatios(view);

  return (
    <div className="space-y-3" data-testid="time-warp-timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-mono text-foreground">{new Date(view.start).toLocaleTimeString()}</span> →{' '}
          <span className="font-mono text-foreground">{new Date(view.end).toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{props.events.length} events</Badge>
          <Button size="sm" variant="outline" onClick={() => setView({ start: fullStart, end: fullEnd })}>
            Reset zoom
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-background/30"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        role="region"
        aria-label="Time warp timeline"
      >
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width="100%" height={layout.h} preserveAspectRatio="none">
          {TRACKS.map((t, idx) => {
            const y = 32 + idx * layout.rowH;
            return (
              <g key={t.key}>
                <text x={12} y={y + 4} fontSize="11" fill="hsl(var(--muted-foreground))">
                  {t.label}
                </text>
                <line
                  x1={layout.marginLeft}
                  y1={y}
                  x2={layout.w - layout.marginRight}
                  y2={y}
                  stroke="hsl(var(--border))"
                />
                {(trackEvents.get(t.key) ?? [])
                  .filter((ev) => {
                    const tms = ms(ev.ts);
                    return tms >= view.start && tms <= view.end;
                  })
                  .map((ev) => {
                    const x = timeToX(ms(ev.ts));
                    const pinned = pinnedSet.has(`${ev.ts}_${ev.type}`);
                    return (
                      <g
                        key={`${ev.ts}_${ev.title}`}
                        onClick={() => props.onPin(ev)}
                        role="button"
                        aria-label={`Pin event: ${ev.title}`}
                        tabIndex={0}
                        onKeyDown={(e: React.KeyboardEvent<SVGGElement>) => {
                          if (e.key === 'Enter' || e.key === ' ') props.onPin(ev);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {renderMarker({ type: ev.type, x, y, severity: ev.severity })}
                        {pinned ? (
                          <circle
                            cx={x}
                            cy={y}
                            r={7.5}
                            fill="none"
                            stroke="hsl(var(--ring))"
                            strokeWidth={1.5}
                          />
                        ) : null}
                      </g>
                    );
                  })}
              </g>
            );
          })}

          {hover ? (
            <line
              x1={(hover.xPx / (containerRef.current?.getBoundingClientRect().width || 1)) * layout.w}
              y1={18}
              x2={(hover.xPx / (containerRef.current?.getBoundingClientRect().width || 1)) * layout.w}
              y2={layout.h - 8}
              stroke="hsl(var(--border))"
            />
          ) : null}
        </svg>

        {hover ? (
          <div
            className="pointer-events-none absolute z-10 max-w-[320px] rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl"
            style={{
              left: Math.min(Math.max(hover.xPx, 16), (containerRef.current?.clientWidth ?? 520) - 16),
              top: 14,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground">
                {hover.nearestEvent ? hover.nearestEvent.title : 'Inspect'}
              </div>
              <div className="font-mono text-muted-foreground">{new Date(hover.tsMs).toLocaleTimeString()}</div>
            </div>
            {hover.nearestEvent ? (
              <div className={cn('mt-1 text-xs', severityColor(hover.nearestEvent.severity))}>
                {hover.nearestEvent.type}
                {hover.nearestEvent.severity ? ` · ${hover.nearestEvent.severity}` : ''}
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">No nearby event</div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {metricsAtHover?.slice(0, 4).map((m) => (
                <div key={m.name} className="rounded-md border border-border bg-background/30 px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">{m.name}</div>
                  <div className="font-mono text-xs text-foreground">
                    {m.value === null ? '—' : Number.isFinite(m.value) ? m.value.toFixed(4) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Brush to zoom</div>
        <div
          ref={minimapRef}
          className="relative h-12 w-full rounded-xl border border-border bg-background/30"
          onPointerDown={onBrushPointerDown}
          onPointerMove={onBrushPointerMove}
          onPointerUp={onBrushPointerUp}
          role="region"
          aria-label="Timeline zoom brush"
        >
          <svg viewBox="0 0 980 48" width="100%" height="100%" preserveAspectRatio="none">
            <rect x={0} y={0} width={980} height={48} fill="transparent" />
            {props.events.slice(0, 120).map((e) => {
              const x = ((ms(e.ts) - fullStart) / fullSpan) * 980;
              const y = e.type === 'alert' ? 18 : 30;
              const fill =
                e.type === 'alert'
                  ? 'hsl(0 84% 60%)'
                  : e.type === 'checkpoint'
                    ? 'hsl(160 84% 39%)'
                    : 'hsl(220 91% 60%)';
              return <rect key={`${e.ts}_${e.type}`} x={x} y={y} width={2} height={10} fill={fill} opacity={0.55} />;
            })}

            <rect
              x={brushS * 980}
              y={6}
              width={Math.max(1, (brushE - brushS) * 980)}
              height={36}
              fill="hsl(var(--ring))"
              opacity={0.12}
              stroke="hsl(var(--ring))"
            />
            <rect x={brushS * 980} y={6} width={3} height={36} fill="hsl(var(--ring))" opacity={0.55} />
            <rect x={brushE * 980 - 3} y={6} width={3} height={36} fill="hsl(var(--ring))" opacity={0.55} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function renderMarker(input: { type: TimelineEvent['type']; x: number; y: number; severity?: TimelineEvent['severity'] }) {
  const fill = severityFill(input.severity);
  const stroke = 'hsl(var(--background))';

  if (input.type === 'alert') {
    const size = 7;
    const d = `M ${input.x} ${input.y - size} L ${input.x - size} ${input.y + size} L ${input.x + size} ${
      input.y + size
    } Z`;
    return <path d={d} className={fill} stroke={stroke} strokeWidth={1} />;
  }

  if (input.type === 'checkpoint') {
    return <circle cx={input.x} cy={input.y} r={5.5} className={fill} stroke={stroke} strokeWidth={1} />;
  }

  if (input.type === 'deploy') {
    return <rect x={input.x - 5} y={input.y - 5} width={10} height={10} className={fill} stroke={stroke} strokeWidth={1} rx={2} />;
  }

  if (input.type === 'commit') {
    const size = 6;
    const d = `M ${input.x} ${input.y - size} L ${input.x - size} ${input.y} L ${input.x} ${
      input.y + size
    } L ${input.x + size} ${input.y} Z`;
    return <path d={d} className={fill} stroke={stroke} strokeWidth={1} />;
  }

  // log_spike
  return <rect x={input.x - 2} y={input.y - 7} width={4} height={14} className={fill} stroke={stroke} strokeWidth={1} rx={2} />;
}
