'use client';

import * as React from 'react';

import type { TraceStep } from '@ai-infra-studio/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@ai-infra-studio/ui';

import { ErrorState } from '@/components/error-state';
import { useTrace } from '@/lib/queries';

function statusVariant(status: TraceStep['status']): 'outline' | 'critical' | 'success' {
  return status === 'error' ? 'critical' : 'success';
}

export default function TraceClient({ traceId }: { traceId: string }) {
  const trace = useTrace(traceId, false);
  const [replays, setReplays] = React.useState(0);
  const [lastReplayAt, setLastReplayAt] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Trace debugger</h1>
        <p className="text-sm text-muted-foreground">
          Synthetic request tracing: inspect each step’s latency, payload preview, and errors.
        </p>
      </div>

      {trace.isError ? (
        <ErrorState title="Trace failed to load" error={trace.error} onRetry={() => trace.refetch()} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Request trace</CardTitle>
              {trace.isLoading ? <Skeleton className="h-5 w-36" /> : <Badge variant="outline">{trace.data?.requestId}</Badge>}
            </div>
            {trace.data ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  trace <span className="font-mono text-foreground">{trace.data.id}</span>
                </span>
                <span>·</span>
                <span>{new Date(trace.data.createdAt).toLocaleString()}</span>
                <span>·</span>
                <span>
                  modelVersion <span className="font-mono text-foreground">{trace.data.modelVersionId}</span>
                </span>
              </div>
            ) : (
              <Skeleton className="h-4 w-72" />
            )}
            {trace.data?.tags?.length ? (
              <div className="flex flex-wrap gap-1">
                {trace.data.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {trace.isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              trace.data?.steps.map((s, idx) => (
                <div key={s.id} className="relative rounded-xl border border-border bg-muted/10 p-4">
                  {idx !== 0 ? (
                    <div className="absolute -top-3 left-6 h-3 w-px bg-border" aria-hidden />
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-foreground">{s.title}</div>
                        <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                        <Badge variant="outline">{s.durationMs}ms</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {s.kind} · started {new Date(s.startedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Payload preview</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <div className="text-[11px] font-medium text-muted-foreground">Input</div>
                        <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs text-foreground">
                          {s.inputPreview}
                        </pre>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <div className="text-[11px] font-medium text-muted-foreground">Output</div>
                        <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs text-foreground">
                          {s.outputPreview}
                        </pre>
                      </div>
                    </div>
                    {s.status === 'error' ? (
                      <div className="mt-2 rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-200">
                        {s.errorMessage ?? 'Unknown error'}
                      </div>
                    ) : null}
                  </details>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Reproduce</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Replay the synthetic payload to simulate a reproducible debugging loop.
            </div>
            <Button
              size="sm"
              onClick={() => {
                setReplays((n) => n + 1);
                setLastReplayAt(new Date().toLocaleTimeString());
              }}
              disabled={!trace.data}
            >
              Replay payload
            </Button>
            <div className="text-xs text-muted-foreground">
              Replays: <span className="font-mono text-foreground">{replays}</span>
              {lastReplayAt ? (
                <>
                  {' '}
                  · last <span className="font-mono text-foreground">{lastReplayAt}</span>
                </>
              ) : null}
            </div>
            <div className="rounded-xl border border-border bg-background/30 p-3">
              <div className="text-[11px] font-medium text-muted-foreground">Sample payload</div>
              <pre className="mt-2 max-h-64 overflow-auto font-mono text-xs text-foreground">
                {trace.data?.steps?.[0]?.inputPreview ?? '—'}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
