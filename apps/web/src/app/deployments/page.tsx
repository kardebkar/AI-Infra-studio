'use client';

import * as React from 'react';

import type { Deployment } from '@ai-infra-studio/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@ai-infra-studio/ui';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { useAdvanceDeployment, useDeployments, useRollbackDeployment, useSimulateIncident } from '@/lib/queries';

function statusVariant(status: Deployment['status']): 'outline' | 'warning' | 'critical' | 'success' {
  if (status === 'running') return 'warning';
  if (status === 'paused') return 'critical';
  if (status === 'rolled_back') return 'critical';
  if (status === 'succeeded') return 'success';
  return 'outline';
}

function stageVariant(stage: Deployment['stage']): 'outline' | 'warning' | 'success' {
  if (stage === 'canary') return 'warning';
  if (stage === 'prod') return 'success';
  return 'outline';
}

export default function DeploymentsPage() {
  const deployments = useDeployments(false);
  const simulate = useSimulateIncident();
  const advance = useAdvanceDeployment();
  const rollback = useRollbackDeployment();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Deployments</h1>
        <p className="text-sm text-muted-foreground">
          Canary → ramp → prod workflows, incidents, and rollback drills (synthetic).
        </p>
      </div>

      {deployments.isError ? (
        <ErrorState title="Deployments failed to load" error={deployments.error} onRetry={() => deployments.refetch()} />
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>All deployments</CardTitle>
          {deployments.isLoading ? <Skeleton className="h-5 w-10" /> : <Badge variant="outline">{deployments.data?.length ?? 0}</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          {deployments.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="mt-2 h-10 w-full" />
              <Skeleton className="mt-2 h-10 w-full" />
            </div>
          ) : (deployments.data?.length ?? 0) === 0 ? (
            <div className="p-4">
              <EmptyState title="No deployments" description="The demo store returned no deployment records." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="border-b border-border px-4 py-2">Deployment</th>
                    <th className="border-b border-border px-4 py-2">Stage</th>
                    <th className="border-b border-border px-4 py-2">Status</th>
                    <th className="border-b border-border px-4 py-2">Rollout</th>
                    <th className="border-b border-border px-4 py-2">Incidents</th>
                    <th className="border-b border-border px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.data?.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/30">
                      <td className="border-b border-border px-4 py-3 align-top">
                        <div className="font-medium text-foreground">{d.id}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          modelVersion <span className="font-mono text-foreground">{d.modelVersionId}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          started <span className="font-mono text-foreground">{new Date(d.startedAt).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 align-top">
                        <Badge variant={stageVariant(d.stage)}>{d.stage}</Badge>
                      </td>
                      <td className="border-b border-border px-4 py-3 align-top">
                        <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
                      </td>
                      <td className="border-b border-border px-4 py-3 align-top">
                        <RolloutSteps steps={d.rolloutSteps} />
                      </td>
                      <td className="border-b border-border px-4 py-3 align-top">
                        {d.incidents.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-1">
                            {d.incidents.slice(0, 2).map((i) => (
                              <div key={i.id} className="text-xs">
                                <Badge variant={i.severity === 'critical' ? 'critical' : 'warning'}>{i.severity}</Badge>{' '}
                                <span className="text-muted-foreground">{i.title}</span>
                              </div>
                            ))}
                            {d.incidents.length > 2 ? (
                              <div className="text-xs text-muted-foreground">+{d.incidents.length - 2} more</div>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="border-b border-border px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={simulate.isPending}
                            onClick={() => simulate.mutate(d.id)}
                          >
                            Simulate incident
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={advance.isPending || d.status === 'rolled_back'}
                            onClick={() => advance.mutate(d.id)}
                          >
                            {d.stage === 'canary' ? 'Ramp' : d.stage === 'ramp' ? 'Promote' : 'Complete'}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={rollback.isPending || d.status === 'rolled_back'}
                            onClick={() => rollback.mutate(d.id)}
                          >
                            Rollback
                          </Button>
                        </div>

                        {d.incidents.length > 0 && d.status !== 'rolled_back' ? (
                          <div className="mt-2 rounded-lg border border-red-900/40 bg-red-950/20 p-2 text-xs text-red-200">
                            Incident detected. Recommended action: pause rollout and consider rollback.
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RolloutSteps({ steps }: { steps: Deployment['rolloutSteps'] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {steps.map((s) => (
          <div
            key={s.id}
            className={[
              'h-2 w-10 rounded-full',
              s.status === 'done'
                ? 'bg-emerald-400/70'
                : s.status === 'active'
                  ? 'bg-amber-400/70'
                  : s.status === 'failed'
                    ? 'bg-red-400/70'
                    : 'bg-muted/40',
            ].join(' ')}
            title={`${s.title}: ${s.status}`}
            aria-label={`${s.title}: ${s.status}`}
          />
        ))}
      </div>
      <div className="space-y-1">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{s.title}</span>
            <Badge variant={s.status === 'done' ? 'success' : s.status === 'active' ? 'warning' : s.status === 'failed' ? 'critical' : 'outline'}>
              {s.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

