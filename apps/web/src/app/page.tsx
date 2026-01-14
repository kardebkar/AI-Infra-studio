'use client';

import Link from 'next/link';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@ai-infra-studio/ui';

import { ErrorState } from '@/components/error-state';
import { useDashboard } from '@/lib/queries';
import { Sparkline } from '@/components/sparkline';

export default function DashboardPage() {
  const dashboard = useDashboard(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Active runs, recent deploys, and alerts — all synthetic, all local.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/authoring">Create run</Link>
          </Button>
        </div>
      </div>

      {dashboard.isError ? (
        <ErrorState title="Dashboard failed to load" error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Active runs</CardTitle>
            {dashboard.data ? (
              <Badge variant="outline">{dashboard.data.activeRuns.length}</Badge>
            ) : (
              <Skeleton className="h-5 w-8" />
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : dashboard.data && dashboard.data.activeRuns.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No active runs right now. Create one from Authoring.
              </div>
            ) : (
              dashboard.data?.activeRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{run.id}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {run.meta.dataset.name} · {run.meta.compute.gpus}×{run.meta.compute.gpuType}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/runs/${run.id}`} data-testid={`open-run-${run.id}`}>
                      Open
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent deploys</CardTitle>
            {dashboard.data ? (
              <Badge variant="outline">{dashboard.data.recentDeploys.length}</Badge>
            ) : (
              <Skeleton className="h-5 w-8" />
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              dashboard.data?.recentDeploys.map((dep) => (
                <div key={dep.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{dep.id}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {dep.stage} · {dep.status}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/deployments">View</Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Alerts</CardTitle>
            {dashboard.data ? <Badge variant="outline">{dashboard.data.alerts.length}</Badge> : <Skeleton className="h-5 w-8" />}
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              dashboard.data?.alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {new Date(a.ts).toLocaleString()} · run {a.runId}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/runs/${a.runId}`}>Inspect</Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>GPU utilization (last 60m)</CardTitle>
            <Badge variant="outline">synthetic</Badge>
          </CardHeader>
          <CardContent>
            {dashboard.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <Sparkline points={dashboard.data?.sparklines.gpu_util ?? []} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Throughput (last 60m)</CardTitle>
            <Badge variant="outline">synthetic</Badge>
          </CardHeader>
          <CardContent>
            {dashboard.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <Sparkline points={dashboard.data?.sparklines.throughput ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
