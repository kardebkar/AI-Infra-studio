'use client';

import * as React from 'react';
import { cn } from '@ai-infra-studio/ui';

export function LineChart({
  points,
  height = 180,
  className,
}: {
  points: Array<{ ts: string; value: number }>;
  height?: number;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const tsMs = React.useMemo(() => points.map((p) => Date.parse(p.ts)), [points]);
  const minX = Math.min(...tsMs);
  const maxX = Math.max(...tsMs);
  const spanX = maxX - minX || 1;

  const values = React.useMemo(() => points.map((p) => p.value), [points]);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const spanY = maxY - minY || 1;

  const w = 520;
  const h = height;
  const padX = 10;
  const padY = 10;

  const xy = React.useMemo(() => {
    return points.map((p, i) => {
      const x = padX + ((tsMs[i]! - minX) / spanX) * (w - padX * 2);
      const y = padY + (1 - (p.value - minY) / spanY) * (h - padY * 2);
      return { x, y };
    });
  }, [points, tsMs, minX, spanX, minY, spanY, h]);

  const d = React.useMemo(() => {
    return xy
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
  }, [xy]);

  const onPointerMove = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = clamp01((x / rect.width) || 0);
    const target = minX + ratio * spanX;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < tsMs.length; i++) {
      const dist = Math.abs(tsMs[i]! - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  const onPointerLeave = () => setHoverIdx(null);

  const hover = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverPoint = hoverIdx !== null ? xy[hoverIdx] : null;

  return (
    <div ref={containerRef} className={cn('relative w-full', className)} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        className="rounded-lg border border-border bg-background/30"
        preserveAspectRatio="none"
        role="img"
        aria-label="Line chart"
      >
        <path d={d} fill="none" stroke="hsl(var(--ring))" strokeWidth="2" strokeLinejoin="round" />
        {hoverPoint ? (
          <>
            <line x1={hoverPoint.x} y1={padY} x2={hoverPoint.x} y2={h - padY} stroke="hsl(var(--border))" />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={3.5} fill="hsl(var(--ring))" />
          </>
        ) : null}
      </svg>

      {hover && hoverPoint ? (
        <div
          className="pointer-events-none absolute top-2 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg"
          style={{ left: `${(hoverPoint.x / w) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <div className="font-mono">{hover.value.toFixed(4)}</div>
          <div className="text-muted-foreground">{new Date(hover.ts).toLocaleTimeString()}</div>
        </div>
      ) : null}
    </div>
  );
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

