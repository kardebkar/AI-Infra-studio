'use client';

import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { LogLevel, LogLine } from '@ai-infra-studio/types';
import { Badge, Button, Input, Skeleton, cn } from '@ai-infra-studio/ui';

import { EmptyState } from './empty-state';

const LEVELS: readonly LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

function levelColor(level: LogLevel) {
  if (level === 'ERROR') return 'text-red-200';
  if (level === 'WARN') return 'text-amber-200';
  if (level === 'INFO') return 'text-sky-200';
  return 'text-muted-foreground';
}

function levelBg(level: LogLevel) {
  if (level === 'ERROR') return 'bg-red-950/30';
  if (level === 'WARN') return 'bg-amber-950/30';
  if (level === 'INFO') return 'bg-sky-950/30';
  return 'bg-transparent';
}

export function LogViewer({
  logs,
  isLoading,
  isReconnecting,
  onPin,
  jumpToTs,
  onJumpHandled,
}: {
  logs: LogLine[];
  isLoading: boolean;
  isReconnecting: boolean;
  onPin: (line: LogLine) => void;
  jumpToTs: string | null;
  onJumpHandled: () => void;
}) {
  const [q, setQ] = React.useState('');
  const [levels, setLevels] = React.useState<Set<LogLevel>>(new Set(LEVELS));
  const [highlightTs, setHighlightTs] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (!levels.has(l.level)) return false;
      if (!query) return true;
      return l.message.toLowerCase().includes(query) || l.source.toLowerCase().includes(query);
    });
  }, [logs, q, levels]);

  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 14,
  });

  React.useEffect(() => {
    if (!jumpToTs) return;
    const targetMs = Date.parse(jumpToTs);
    if (!Number.isFinite(targetMs) || filtered.length === 0) return;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < filtered.length; i++) {
      const dist = Math.abs(Date.parse(filtered[i]!.ts) - targetMs);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    rowVirtualizer.scrollToIndex(best, { align: 'center' });
    setHighlightTs(filtered[best]!.ts);
    onJumpHandled();
  }, [jumpToTs, filtered, rowVirtualizer, onJumpHandled]);

  React.useEffect(() => {
    if (!highlightTs) return;
    const t = window.setTimeout(() => setHighlightTs(null), 2400);
    return () => window.clearTimeout(t);
  }, [highlightTs]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            placeholder="Search logs…"
            aria-label="Search logs"
          />
          {isReconnecting ? <Badge variant="warning">Reconnecting…</Badge> : null}
          <Badge variant="outline">{filtered.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {LEVELS.map((lvl) => {
            const active = levels.has(lvl);
            return (
              <Button
                key={lvl}
                size="sm"
                variant={active ? 'secondary' : 'outline'}
                onClick={() => {
                  setLevels((prev) => {
                    const next = new Set(prev);
                    if (next.has(lvl)) next.delete(lvl);
                    else next.add(lvl);
                    return next.size === 0 ? new Set(LEVELS) : next;
                  });
                }}
                aria-pressed={active}
              >
                {lvl}
              </Button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching logs" description="Try a different query or re-enable log levels." />
      ) : (
        <div
          ref={parentRef}
          className="h-[620px] overflow-auto rounded-xl border border-border bg-background/30"
          role="region"
          aria-label="Log viewer"
        >
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtual) => {
              const line = filtered[virtual.index]!;
              const isHighlight = highlightTs === line.ts;
              return (
                <div
                  key={virtual.key}
                  className={cn(
                    'group absolute left-0 right-0 flex items-start gap-3 border-b border-border/60 px-3 py-1 font-mono text-xs leading-5 hover:bg-muted/20',
                    isHighlight && 'bg-accent/40',
                    levelBg(line.level),
                  )}
                  style={{
                    transform: `translateY(${virtual.start}px)`,
                  }}
                >
                  <div className="w-[110px] shrink-0 text-muted-foreground">
                    {new Date(line.ts).toLocaleTimeString()}
                  </div>
                  <div className={cn('w-[64px] shrink-0', levelColor(line.level))}>{line.level}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="text-muted-foreground">[{line.source}]</span>{' '}
                      <Highlighted text={line.message} query={q} />
                    </div>
                  </div>
                  <div className="ml-auto hidden items-center gap-1 group-hover:flex">
                    <Button size="sm" variant="outline" onClick={() => onPin(line)} aria-label="Pin log line">
                      Pin
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(`${line.ts} ${line.level} ${line.source} ${line.message}`)}
                      aria-label="Copy log line"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;

  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;

  const before = text.slice(0, idx);
  const hit = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);

  return (
    <>
      {before}
      <mark className="rounded bg-amber-300/20 px-1 text-amber-100">{hit}</mark>
      {after}
    </>
  );
}
