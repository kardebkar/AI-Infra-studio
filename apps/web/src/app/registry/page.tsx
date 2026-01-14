'use client';

import * as React from 'react';
import Link from 'next/link';

import type { ModelVersion } from '@ai-infra-studio/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@ai-infra-studio/ui';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { useModelVersions, useModels } from '@/lib/queries';

function stageVariant(stage: ModelVersion['stage']): 'outline' | 'success' | 'warning' {
  if (stage === 'production') return 'success';
  if (stage === 'staging') return 'warning';
  return 'outline';
}

export default function RegistryPage() {
  const models = useModels(false);
  const [modelId, setModelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!modelId && models.data?.[0]?.id) setModelId(models.data[0].id);
  }, [modelId, models.data]);

  const versions = useModelVersions(modelId ?? '', false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Model registry</h1>
        <p className="text-sm text-muted-foreground">Models, versions, best runs, and promotion stages.</p>
      </div>

      {models.isError ? (
        <ErrorState title="Models failed to load" error={models.error} onRetry={() => models.refetch()} />
      ) : null}
      {versions.isError ? (
        <ErrorState title="Versions failed to load" error={versions.error} onRetry={() => versions.refetch()} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Models</CardTitle>
            {models.isLoading ? <Skeleton className="h-5 w-10" /> : <Badge variant="outline">{models.data?.length ?? 0}</Badge>}
          </CardHeader>
          <CardContent className="space-y-2">
            {models.isLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (models.data?.length ?? 0) === 0 ? (
              <EmptyState title="No models" description="The API returned no registry entries." />
            ) : (
              models.data?.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModelId(m.id)}
                  className={[
                    'w-full rounded-lg border border-border p-3 text-left hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    m.id === modelId ? 'bg-muted/20' : '',
                  ].join(' ')}
                >
                  <div className="text-sm font-medium text-foreground">{m.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{m.description}</div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Versions</CardTitle>
            {versions.isLoading ? <Skeleton className="h-5 w-10" /> : <Badge variant="outline">{versions.data?.length ?? 0}</Badge>}
          </CardHeader>
          <CardContent className="p-0">
            {versions.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="mt-2 h-10 w-full" />
                <Skeleton className="mt-2 h-10 w-full" />
              </div>
            ) : (versions.data?.length ?? 0) === 0 ? (
              <div className="p-4">
                <EmptyState title="No versions" description="Select a model to see versions." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="border-b border-border px-4 py-2">Version</th>
                      <th className="border-b border-border px-4 py-2">Stage</th>
                      <th className="border-b border-border px-4 py-2">Eval</th>
                      <th className="border-b border-border px-4 py-2">Best run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.data?.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/30">
                        <td className="border-b border-border px-4 py-3">
                          <div className="font-medium text-foreground">{v.version}</div>
                          <div className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</div>
                        </td>
                        <td className="border-b border-border px-4 py-3">
                          <Badge variant={stageVariant(v.stage)}>{v.stage}</Badge>
                        </td>
                        <td className="border-b border-border px-4 py-3">
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div>
                              acc <span className="font-mono text-foreground">{v.evalSummary.accuracy.toFixed(3)}</span>
                            </div>
                            <div>
                              p95 <span className="font-mono text-foreground">{v.evalSummary.latencyP95Ms.toFixed(1)}ms</span>
                            </div>
                            <div>
                              robust <span className="font-mono text-foreground">{v.evalSummary.robustness.toFixed(3)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/runs/${v.bestRunId}`}>{v.bestRunId}</Link>
                          </Button>
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
    </div>
  );
}

