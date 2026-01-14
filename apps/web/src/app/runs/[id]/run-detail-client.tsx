'use client';

import * as React from 'react';
import Link from 'next/link';

import type { LogLine, MetricPoint, TimelineEvent } from '@ai-infra-studio/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@ai-infra-studio/ui';

import { ErrorState } from '@/components/error-state';
import { LogViewer } from '@/components/log-viewer';
import { LineChart } from '@/components/line-chart';
import { TimeWarpTimeline } from '@/components/time-warp-timeline';
import { fingerprintLogMessage, formatBytes } from '@/lib/format';
import { useConfigVersion, useRun, useRunLogs, useRunMetrics } from '@/lib/queries';
import { useRunStream } from '@/lib/run-stream';

type PinnedMoment = {
  id: string;
  ts: string;
  title: string;
  kind: 'timeline' | 'log';
  eventType?: string;
  severity?: string;
};

export default function RunDetailClient({ runId }: { runId: string }) {
  const runQuery = useRun(runId, false);
  const run = runQuery.data ?? null;

  const cfg = useConfigVersion(run?.configVersionId ?? '', false);

  const loss = useRunMetrics(runId, 'loss', undefined, undefined, false);
  const accuracy = useRunMetrics(runId, 'accuracy', undefined, undefined, false);
  const throughput = useRunMetrics(runId, 'throughput', undefined, undefined, false);
  const gpu = useRunMetrics(runId, 'gpu_util', undefined, undefined, false);

  const logsQuery = useRunLogs(runId, 600, false);
  const stream = useRunStream(runId);

  const [tab, setTab] = React.useState('overview');
  const [pinned, setPinned] = React.useState<PinnedMoment[]>([]);
  const [jumpToTs, setJumpToTs] = React.useState<string | null>(null);

  // Preload all log pages in the background for search/jump-to-time.
  React.useEffect(() => {
    if (!logsQuery.hasNextPage || logsQuery.isFetchingNextPage) return;
    void logsQuery.fetchNextPage();
  }, [logsQuery.hasNextPage, logsQuery.isFetchingNextPage, logsQuery.fetchNextPage, logsQuery.dataUpdatedAt]);

  const logs = React.useMemo(() => {
    const base = logsQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const merged = mergeLogs(base, stream.logs);
    return merged;
  }, [logsQuery.data, stream.logs]);

  const timelineEvents = React.useMemo(() => {
    const base = (run?.timeline ?? []) as TimelineEvent[];
    return mergeTimeline(base, stream.timeline);
  }, [run?.timeline, stream.timeline]);

  const metrics = React.useMemo(() => {
    return {
      loss: mergeMetricPoints(loss.data ?? [], stream.metrics.loss),
      accuracy: mergeMetricPoints(accuracy.data ?? [], stream.metrics.accuracy),
      throughput: mergeMetricPoints(throughput.data ?? [], stream.metrics.throughput),
      gpu_util: mergeMetricPoints(gpu.data ?? [], stream.metrics.gpu_util),
    };
  }, [loss.data, accuracy.data, throughput.data, gpu.data, stream.metrics]);

  const onPinTimelineEvent = (e: TimelineEvent) => {
    const id = `t_${e.ts}_${e.type}`;
    setPinned((prev) => (prev.some((p) => p.id === id) ? prev : [{ id, ts: e.ts, title: e.title, kind: 'timeline', eventType: e.type, severity: e.severity }, ...prev]));
  };

  const onPinLogLine = (line: LogLine) => {
    const id = `l_${line.ts}_${line.source}_${line.level}_${line.message}`;
    setPinned((prev) => (prev.some((p) => p.id === id) ? prev : [{ id, ts: line.ts, title: line.message, kind: 'log' }, ...prev]));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold">Run {runId}</h1>
            {run ? <Badge variant={statusVariant(run.status)}>{run.status}</Badge> : <Skeleton className="h-5 w-20" />}
            <WsBadge status={stream.status} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {run ? (
              <>
                {run.meta.dataset.name} · {run.meta.compute.gpus}×{run.meta.compute.gpuType} · commit{' '}
                <span className="font-mono text-foreground">{run.meta.code.commitHash.slice(0, 12)}</span>
              </>
            ) : (
              <Skeleton className="h-4 w-96" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/experiments/${run?.experimentId ?? ''}`}>Experiment</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/experiments">All experiments</Link>
          </Button>
        </div>
      </div>

      {runQuery.isError ? (
        <ErrorState title="Run failed to load" error={runQuery.error} onRetry={() => runQuery.refetch()} />
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Run overview</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                <OverviewRow label="Status" value={run ? run.status : '—'} />
                <OverviewRow label="Duration" value={run ? formatRunDuration(run.startedAt, run.endedAt) : '—'} />
                <OverviewRow label="Dataset" value={run ? `${run.meta.dataset.name} (${run.meta.dataset.version})` : '—'} />
                <OverviewRow label="Compute" value={run ? `${run.meta.compute.gpus}×${run.meta.compute.gpuType}${run.meta.compute.spot ? ' (spot)' : ''}` : '—'} />
                <OverviewRow label="Cluster" value={run ? `${run.meta.cluster.name} · ${run.meta.cluster.region}` : '—'} />
                <OverviewRow label="Branch" value={run ? run.meta.code.branch : '—'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Config</CardTitle>
                {cfg.data ? <Badge variant="outline">{cfg.data.language.toUpperCase()}</Badge> : <Skeleton className="h-5 w-14" />}
              </CardHeader>
              <CardContent className="space-y-3">
                {cfg.isLoading ? (
                  <>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </>
                ) : cfg.isError ? (
                  <ErrorState title="Config failed to load" error={cfg.error} onRetry={() => cfg.refetch()} />
                ) : cfg.data ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      Version: <span className="font-mono text-foreground">{cfg.data.title}</span>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">Show config</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-background/40 p-3 font-mono text-xs leading-5 text-foreground">
                        {cfg.data.content}
                      </pre>
                    </details>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <div className="grid gap-4 lg:grid-cols-2">
            <MetricCard title="Loss" points={metrics.loss} />
            <MetricCard title="Accuracy" points={metrics.accuracy} />
            <MetricCard title="Throughput" points={metrics.throughput} />
            <MetricCard title="GPU util" points={metrics.gpu_util} />
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <LogViewer
            logs={logs}
            isLoading={logsQuery.isLoading}
            isReconnecting={stream.status === 'reconnecting'}
            onPin={onPinLogLine}
            jumpToTs={jumpToTs}
            onJumpHandled={() => setJumpToTs(null)}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Time Warp Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {run ? (
                  <TimeWarpTimeline
                    runId={run.id}
                    startedAt={run.startedAt}
                    endedAt={run.endedAt}
                    events={timelineEvents}
                    metrics={{
                      loss: metrics.loss,
                      accuracy: metrics.accuracy,
                      throughput: metrics.throughput,
                      gpu_util: metrics.gpu_util,
                    }}
                    pinned={pinned}
                    onPin={onPinTimelineEvent}
                  />
                ) : (
                  <Skeleton className="h-80 w-full" />
                )}
              </CardContent>
            </Card>

            <PinnedMomentsPanel
              pinned={pinned}
              onRemove={(id) => setPinned((prev) => prev.filter((p) => p.id !== id))}
              onJumpToLogs={(ts) => {
                setTab('logs');
                setJumpToTs(ts);
              }}
              metrics={metrics}
              logs={logs}
              configText={cfg.data?.content ?? null}
            />
          </div>
        </TabsContent>

        <TabsContent value="artifacts">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Artifacts</CardTitle>
              {run ? <Badge variant="outline">{run.artifacts.length}</Badge> : <Skeleton className="h-5 w-8" />}
            </CardHeader>
            <CardContent className="space-y-2">
              {run?.artifacts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.kind} · {formatBytes(a.sizeBytes)}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(a.name)}>
                    Copy name
                  </Button>
                </div>
              ))}
              {run && run.artifacts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No artifacts for this run.</div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debug">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader>
                <CardTitle>Incident moments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {timelineEvents.filter((e) => e.type === 'alert').length === 0 ? (
                  <div className="text-sm text-muted-foreground">No alerts detected for this run.</div>
                ) : (
                  timelineEvents
                    .filter((e) => e.type === 'alert')
                    .slice(0, 6)
                    .map((e) => (
                      <div key={`${e.ts}_${e.title}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{e.title}</div>
                          <div className="text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => onPinTimelineEvent(e)}>
                          Pin
                        </Button>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            <PinnedMomentsPanel
              pinned={pinned}
              onRemove={(id) => setPinned((prev) => prev.filter((p) => p.id !== id))}
              onJumpToLogs={(ts) => {
                setTab('logs');
                setJumpToTs(ts);
              }}
              metrics={metrics}
              logs={logs}
              configText={cfg.data?.content ?? null}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function statusVariant(status: string): 'outline' | 'warning' | 'critical' | 'success' {
  if (status === 'running') return 'warning';
  if (status === 'failed') return 'critical';
  if (status === 'succeeded') return 'success';
  return 'outline';
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-xs text-foreground">{value}</div>
    </div>
  );
}

function MetricCard({ title, points }: { title: string; points: MetricPoint[] }) {
  const last = points.at(-1)?.value;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant="outline">{last !== undefined ? last.toFixed(3) : '—'}</Badge>
      </CardHeader>
      <CardContent>{points.length === 0 ? <Skeleton className="h-40 w-full" /> : <LineChart points={points} />}</CardContent>
    </Card>
  );
}

function WsBadge({ status }: { status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' }) {
  const variant =
    status === 'connected' ? 'success' : status === 'reconnecting' ? 'warning' : status === 'error' ? 'critical' : 'outline';
  const label =
    status === 'connected' ? 'Live' : status === 'reconnecting' ? 'Reconnecting…' : status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Offline' : '—';
  return (
    <Badge variant={variant} data-testid="ws-status">
      {label}
    </Badge>
  );
}

function formatRunDuration(startedAt: string, endedAt?: string) {
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function mergeMetricPoints(base: MetricPoint[], streamed: MetricPoint[]) {
  const key = (p: MetricPoint) => `${p.ts}_${p.name}`;
  const map = new Map<string, MetricPoint>();
  for (const p of base) map.set(key(p), p);
  for (const p of streamed) map.set(key(p), p);
  return Array.from(map.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

function mergeLogs(base: LogLine[], streamed: LogLine[]) {
  const key = (l: LogLine) => `${l.ts}_${l.level}_${l.source}_${l.message}`;
  const map = new Map<string, LogLine>();
  for (const l of base) map.set(key(l), l);
  for (const l of streamed) map.set(key(l), l);
  return Array.from(map.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

function mergeTimeline(base: TimelineEvent[], streamed: TimelineEvent[]) {
  const key = (e: TimelineEvent) => `${e.ts}_${e.type}_${e.title}`;
  const map = new Map<string, TimelineEvent>();
  for (const e of base) map.set(key(e), e);
  for (const e of streamed) map.set(key(e), e);
  return Array.from(map.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

function PinnedMomentsPanel(input: {
  pinned: PinnedMoment[];
  onRemove: (id: string) => void;
  onJumpToLogs: (ts: string) => void;
  metrics: Record<string, MetricPoint[]>;
  logs: LogLine[];
  configText: string | null;
}) {
  const [aId, setAId] = React.useState<string>('');
  const [bId, setBId] = React.useState<string>('');

  React.useEffect(() => {
    if (input.pinned.length >= 2) {
      if (!aId) setAId(input.pinned[0]!.id);
      if (!bId) setBId(input.pinned[1]!.id);
    }
  }, [input.pinned, aId, bId]);

  const a = input.pinned.find((p) => p.id === aId) ?? null;
  const b = input.pinned.find((p) => p.id === bId) ?? null;

  const compare = a && b ? compareMoments({ a, b, metrics: input.metrics, logs: input.logs }) : null;

  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Pinned moments</CardTitle>
        <Badge variant="outline" data-testid="pinned-count">
          {input.pinned.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {input.pinned.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Click events on the timeline or pin a log line to start building a debugging narrative.
          </div>
        ) : (
          <div className="space-y-2">
            {input.pinned.slice(0, 8).map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-muted/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{p.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.ts).toLocaleString()} · {p.kind}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Remove pin" onClick={() => input.onRemove(p.id)}>
                    ×
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => input.onJumpToLogs(p.ts)}>
                    Jump to logs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(`${new Date(p.ts).toISOString()} ${p.title}`)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/10 p-3">
          <div className="text-sm font-medium text-foreground">Compare two pins</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={aId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAId(e.target.value)}
              aria-label="Select pinned moment A"
            >
              <option value="">Pin A…</option>
              {input.pinned.map((p) => (
                <option key={p.id} value={p.id}>
                  {new Date(p.ts).toLocaleTimeString()} · {p.kind}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={bId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBId(e.target.value)}
              aria-label="Select pinned moment B"
            >
              <option value="">Pin B…</option>
              {input.pinned.map((p) => (
                <option key={p.id} value={p.id}>
                  {new Date(p.ts).toLocaleTimeString()} · {p.kind}
                </option>
              ))}
            </select>
          </div>

          {compare ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2">
                {compare.metricDeltas.map((m) => (
                  <div key={m.name} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{m.name}</span>
                    <span className="font-mono text-foreground">
                      {m.a.toFixed(3)} → {m.b.toFixed(3)}{' '}
                      <span className={m.delta >= 0 ? 'text-emerald-200' : 'text-red-200'}>
                        ({m.delta >= 0 ? '+' : ''}
                        {m.delta.toFixed(3)})
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-xs font-medium text-foreground">Top log patterns changed</div>
                <ul className="mt-2 space-y-1 text-xs">
                  {compare.logChanges.length === 0 ? (
                    <li className="text-muted-foreground">No strong pattern shift in ±60s window.</li>
                  ) : (
                    compare.logChanges.map((c) => (
                      <li key={c.fingerprint} className="flex items-center justify-between gap-2">
                        <span className="truncate text-muted-foreground">{c.fingerprint}</span>
                        <span className="font-mono text-foreground">
                          {c.a} → {c.b}{' '}
                          <span className={c.b - c.a >= 0 ? 'text-emerald-200' : 'text-red-200'}>
                            ({c.b - c.a >= 0 ? '+' : ''}
                            {c.b - c.a})
                          </span>
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="text-xs text-muted-foreground">
                Config diffs: <span className="text-foreground">{input.configText ? 'no runtime config changes recorded' : 'config unavailable'}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted-foreground">
              Select two pinned moments to compare metrics, log patterns, and config hints.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function compareMoments(input: {
  a: PinnedMoment;
  b: PinnedMoment;
  metrics: Record<string, MetricPoint[]>;
  logs: LogLine[];
}) {
  const aMs = Date.parse(input.a.ts);
  const bMs = Date.parse(input.b.ts);

  const metricNames = ['loss', 'accuracy', 'throughput', 'gpu_util'] as const;
  const metricDeltas = metricNames
    .map((name) => {
      const series = input.metrics[name] ?? [];
      const aV = nearestValue(series, aMs);
      const bV = nearestValue(series, bMs);
      if (aV === null || bV === null) return null;
      return { name, a: aV, b: bV, delta: bV - aV };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const windowMs = 60_000;
  const aLogs = input.logs.filter((l) => Math.abs(Date.parse(l.ts) - aMs) <= windowMs);
  const bLogs = input.logs.filter((l) => Math.abs(Date.parse(l.ts) - bMs) <= windowMs);

  const aCounts = countFingerprints(aLogs);
  const bCounts = countFingerprints(bLogs);
  const fingerprints = new Set([...Object.keys(aCounts), ...Object.keys(bCounts)]);
  const logChanges = Array.from(fingerprints)
    .map((fp) => ({ fingerprint: fp, a: aCounts[fp] ?? 0, b: bCounts[fp] ?? 0 }))
    .filter((x) => x.a !== x.b)
    .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))
    .slice(0, 5);

  return { metricDeltas, logChanges };
}

function countFingerprints(lines: LogLine[]) {
  const counts: Record<string, number> = {};
  for (const l of lines) {
    const fp = fingerprintLogMessage(l.message);
    counts[fp] = (counts[fp] ?? 0) + 1;
  }
  return counts;
}

function nearestValue(series: MetricPoint[], tsMs: number) {
  if (series.length === 0) return null;
  let best: MetricPoint | null = null;
  let bestDist = Infinity;
  for (const p of series) {
    const d = Math.abs(Date.parse(p.ts) - tsMs);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best ? best.value : null;
}
