import { cn } from '@ai-infra-studio/ui';

export function Sparkline({
  points,
  height = 56,
  className,
}: {
  points: Array<{ ts: string; value: number }>;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) {
    return <div className={cn('h-14 w-full rounded-lg border border-border bg-muted/20', className)} />;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const w = 320;
  const h = height;
  const pad = 6;

  const d = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p.value - min) / span) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const area = `${d} L ${(w - pad).toFixed(2)} ${(h - pad).toFixed(2)} L ${pad} ${(h - pad).toFixed(2)} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      className={cn('rounded-lg border border-border bg-background/30', className)}
      role="img"
      aria-label="Sparkline"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--ring))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--ring))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path d={d} fill="none" stroke="hsl(var(--ring))" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

