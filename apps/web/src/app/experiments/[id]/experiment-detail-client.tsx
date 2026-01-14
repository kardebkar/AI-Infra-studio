'use client';

import * as React from 'react';
import Link from 'next/link';

import type { Run } from '@ai-infra-studio/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@ai-infra-studio/ui';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { TextDiff } from '@/components/text-diff';
import { useConfigVersion, useExperiment, useExperimentRuns } from '@/lib/queries';

function statusVariant(status: Run['status']): 'outline' | 'warning' | 'critical' | 'success' {
  if (status === 'running') return 'warning';
  if (status === 'failed') return 'critical';
  if (status === 'succeeded') return 'success';
  return 'outline';
}

function formatDuration(run: Run) {
  if (!run.endedAt) return '—';
  const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const m = Math.round(ms / 60_000);
  return `${m}m`;
}

export default function ExperimentDetailClient({ experimentId }: { experimentId: string }) {
  const exp = useExperiment(experimentId, false);
  const runs = useExperimentRuns(experimentId, false);

  const [selected, setSelected] = React.useState<string[]>([]);
  const selectedRuns = React.useMemo(() => {
    const map = new Map((runs.data ?? []).map((r) => [r.id, r] as const));
    return selected.map((id) => map.get(id)).filter((r): r is Run => Boolean(r)).slice(0, 2);
  }, [runs.data, selected]);

  const compare = selectedRuns.length === 2 ? { a: selectedRuns[0]!, b: selectedRuns[1]! } : null;

  const cfgA = useConfigVersion(compare?.a.configVersionId ?? '', false);
  const cfgB = useConfigVersion(compare?.b.configVersionId ?? '', false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {exp.isLoading ? (
            <Skeleton className="h-6 w-64" />
          ) : (
            <h1 className="text-lg font-semibold">{exp.data?.name ?? 'Experiment'}</h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {exp.data ? (
              <>
                <Badge variant="outline">{exp.data.owner}</Badge>
                <span>·</span>
                <span>{new Date(exp.data.createdAt).toLocaleString()}</span>
              </>
            ) : (
              <Skeleton className="h-5 w-52" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/authoring">Create run</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/experiments">Back</Link>
          </Button>
        </div>
      </div>

      {exp.isError ? (
        <ErrorState title="Experiment failed to load" error={exp.error} onRetry={() => exp.refetch()} />
      ) : null}
      {runs.isError ? (
        <ErrorState title="Runs failed to load" error={runs.error} onRetry={() => runs.refetch()} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exp.isLoading ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{exp.data?.description}</p>
          )}
          {exp.data ? (
            <div className="flex flex-wrap gap-1">
              {exp.data.tags.map((t) => (
                <Badge key={t} variant="default">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="space-y-0.5">
            <CardTitle>Runs</CardTitle>
            <div className="text-sm text-muted-foreground">
              Select two runs to compare metrics and config diffs.
            </div>
          </div>
          <Badge variant="outline">{runs.data?.length ?? 0}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {runs.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="mt-2 h-10 w-full" />
              <Skeleton className="mt-2 h-10 w-full" />
            </div>
          ) : (runs.data?.length ?? 0) === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No runs yet"
                description="Create a run from Authoring to populate this experiment."
                actionLabel="Create run"
                onAction={() => {
                  window.location.assign('/authoring');
                }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="border-b border-border px-4 py-2">
                      Compare
                    </th>
                    <th scope="col" className="border-b border-border px-4 py-2">
                      Run
                    </th>
                    <th scope="col" className="border-b border-border px-4 py-2">
                      Status
                    </th>
                    <th scope="col" className="border-b border-border px-4 py-2">
                      Started
                    </th>
                    <th scope="col" className="border-b border-border px-4 py-2">
                      Duration
                    </th>
                    <th scope="col" className="border-b border-border px-4 py-2">
                      Accuracy
                    </th>
                    <th scope="col" className="border-b border-border px-4 py-2">
                      Loss
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(runs.data ?? []).map((run) => {
                    const checked = selected.includes(run.id);
                    return (
                      <tr key={run.id} className="hover:bg-muted/30">
                        <td className="border-b border-border px-4 py-3">
                          <input
                            aria-label={`Select run ${run.id} for comparison`}
                            type="checkbox"
                            checked={checked}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              setSelected((prev) => {
                                const next = prev.filter((id) => id !== run.id);
                                if (e.target.checked) next.unshift(run.id);
                                return next.slice(0, 2);
                              });
                            }}
                          />
                        </td>
                        <td className="border-b border-border px-4 py-3">
                          <Link
                            href={`/runs/${run.id}`}
                            className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {run.id}
                          </Link>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {run.meta.dataset.name} · {run.meta.compute.gpus}×{run.meta.compute.gpuType}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3">
                          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                          {new Date(run.startedAt).toLocaleString()}
                        </td>
                        <td className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                          {formatDuration(run)}
                        </td>
                        <td className="border-b border-border px-4 py-3 font-mono text-xs">
                          {run.metricsSummary.accuracy?.toFixed?.(3) ??
                            String(run.metricsSummary.accuracy ?? '—')}
                        </td>
                        <td className="border-b border-border px-4 py-3 font-mono text-xs">
                          {run.metricsSummary.loss?.toFixed?.(4) ?? String(run.metricsSummary.loss ?? '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Compare runs</CardTitle>
            <div className="text-sm text-muted-foreground">
              {compare ? `${compare.a.id} vs ${compare.b.id}` : 'Select two runs above.'}
            </div>
          </div>
          <Badge variant="outline">{selectedRuns.length}/2</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {!compare ? (
            <EmptyState
              title="No comparison selected"
              description="Select two runs to see metric deltas, config diffs, and timeline alignment."
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-border/60 bg-muted/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Metric deltas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <MetricDelta
                      label="accuracy"
                      a={compare.a.metricsSummary.accuracy ?? null}
                      b={compare.b.metricsSummary.accuracy ?? null}
                      good="up"
                    />
                    <MetricDelta
                      label="loss"
                      a={compare.a.metricsSummary.loss ?? null}
                      b={compare.b.metricsSummary.loss ?? null}
                      good="down"
                    />
                    <MetricDelta
                      label="throughput"
                      a={compare.a.metricsSummary.throughput ?? null}
                      b={compare.b.metricsSummary.throughput ?? null}
                      good="up"
                    />
                    <MetricDelta
                      label="gpu_util"
                      a={compare.a.metricsSummary.gpu_util ?? null}
                      b={compare.b.metricsSummary.gpu_util ?? null}
                      good="up"
                    />
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-muted/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Timeline alignment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <div>
                      A started:{' '}
                      <span className="font-mono text-foreground">
                        {new Date(compare.a.startedAt).toISOString()}
                      </span>
                    </div>
                    <div>
                      B started:{' '}
                      <span className="font-mono text-foreground">
                        {new Date(compare.b.startedAt).toISOString()}
                      </span>
                    </div>
                    <div className="text-xs">
                      Tip: open each run’s Time Warp Timeline to pin incident moments and compare changes.
                    </div>
                    <div className="pt-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/runs/${compare.a.id}`}>Open run A</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="ml-2">
                        <Link href={`/runs/${compare.b.id}`}>Open run B</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Config diff</div>
                {(cfgA.isLoading || cfgB.isLoading) && <Skeleton className="h-52 w-full" />}
                {(cfgA.isError || cfgB.isError) && (
                  <ErrorState
                    title="Config versions failed to load"
                    error={{ a: cfgA.error, b: cfgB.error }}
                    onRetry={() => {
                      cfgA.refetch();
                      cfgB.refetch();
                    }}
                  />
                )}
                {cfgA.data && cfgB.data ? <TextDiff before={cfgA.data.content} after={cfgB.data.content} /> : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricDelta({
  label,
  a,
  b,
  good,
}: {
  label: string;
  a: number | null;
  b: number | null;
  good: 'up' | 'down';
}) {
  if (a === null || b === null) {
    return (
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground">{label}</div>
        <div className="font-mono text-xs text-muted-foreground">—</div>
      </div>
    );
  }

  const delta = b - a;
  const isGood = good === 'up' ? delta >= 0 : delta <= 0;
  const color = delta === 0 ? 'text-muted-foreground' : isGood ? 'text-emerald-200' : 'text-red-200';

  return (
    <div className="flex items-center justify-between">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono text-xs">
        <span className="text-foreground">{a.toFixed(4)}</span>{' '}
        <span className="text-muted-foreground">→</span>{' '}
        <span className="text-foreground">{b.toFixed(4)}</span>{' '}
        <span className={color}>
          ({delta >= 0 ? '+' : ''}
          {delta.toFixed(4)})
        </span>
      </div>
    </div>
  );
}
