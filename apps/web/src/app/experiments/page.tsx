'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

import type { Experiment, Run } from '@ai-infra-studio/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton, cn } from '@ai-infra-studio/ui';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { apiFetch } from '@/lib/api';
import { useExperiments } from '@/lib/queries';

type ExperimentRow = {
  experiment: Experiment;
  runs: Run[] | null;
  derived: {
    status: Run['status'] | 'none';
    lastRunId?: string;
    lastStartedAt?: string;
    runCount: number;
  };
};

function deriveExperimentStatus(runs: Run[]) {
  if (runs.length === 0) return { status: 'none' as const, runCount: 0 };
  const sorted = runs.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const last = sorted[0]!;
  const hasRunning = runs.some((r) => r.status === 'running');
  return {
    status: hasRunning ? 'running' : last.status,
    lastRunId: last.id,
    lastStartedAt: last.startedAt,
    runCount: runs.length,
  } as const;
}

function statusBadgeVariant(status: string): 'warning' | 'critical' | 'success' | 'outline' {
  if (status === 'running') return 'warning';
  if (status === 'failed') return 'critical';
  if (status === 'succeeded') return 'success';
  return 'outline';
}

export default function ExperimentsPage() {
  const experiments = useExperiments(false);
  const list = experiments.data ?? [];

  const runsQueries = useQueries({
    queries: list.map((exp) => ({
      queryKey: ['experimentRuns', { id: exp.id, chaos: false }] as const,
      queryFn: () => apiFetch<Run[]>(`/experiments/${exp.id}/runs`),
      enabled: experiments.isSuccess,
    })),
  });

  const rows: ExperimentRow[] = React.useMemo(() => {
    return list.map((exp, i) => {
      const runs = runsQueries[i]?.data ?? null;
      return {
        experiment: exp,
        runs,
        derived: runs ? deriveExperimentStatus(runs) : { status: 'none', runCount: 0 },
      };
    });
  }, [list, runsQueries]);

  const owners = React.useMemo(() => {
    const set = new Set(rows.map((r) => r.experiment.owner));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const [q, setQ] = React.useState('');
  const [owner, setOwner] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [tag, setTag] = React.useState('');

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      const haystack = `${r.experiment.name} ${r.experiment.description}`.toLowerCase();
      if (q.trim() && !haystack.includes(q.trim().toLowerCase())) return false;
      if (owner !== 'all' && r.experiment.owner !== owner) return false;
      if (status !== 'all' && r.derived.status !== status) return false;
      if (tag.trim() && !r.experiment.tags.some((t) => t.toLowerCase().includes(tag.trim().toLowerCase())))
        return false;
      return true;
    });
  }, [rows, q, owner, status, tag]);

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  const columns = React.useMemo<ColumnDef<ExperimentRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Experiment',
        accessorFn: (r) => r.experiment.name,
        cell: ({ row }) => (
          <div>
            <Link
              href={`/experiments/${row.original.experiment.id}`}
              className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.experiment.name}
            </Link>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {row.original.experiment.description}
            </div>
          </div>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        accessorFn: (r) => r.experiment.owner,
        cell: ({ row }) => <Badge variant="outline">{row.original.experiment.owner}</Badge>,
      },
      {
        id: 'tags',
        header: 'Tags',
        accessorFn: (r) => r.experiment.tags.join(','),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.experiment.tags.slice(0, 4).map((t) => (
              <Badge key={t} variant="default">
                {t}
              </Badge>
            ))}
            {row.original.experiment.tags.length > 4 ? (
              <Badge variant="outline">+{row.original.experiment.tags.length - 4}</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Last run',
        accessorFn: (r) => r.derived.status,
        cell: ({ row }) => {
          const d = row.original.derived;
          return row.original.runs === null ? (
            <Skeleton className="h-5 w-28" />
          ) : d.status === 'none' ? (
            <span className="text-xs text-muted-foreground">No runs</span>
          ) : (
            <div className="space-y-1">
              <Badge variant={statusBadgeVariant(d.status)}>{d.status}</Badge>
              <div className="text-xs text-muted-foreground">{d.runCount} runs</div>
            </div>
          );
        },
      },
      {
        id: 'createdAt',
        header: 'Created',
        accessorFn: (r) => r.experiment.createdAt,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.experiment.createdAt).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Experiments</h1>
          <p className="text-sm text-muted-foreground">
            Filter, drill into runs, and compare configs and metrics.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/authoring">New run</Link>
        </Button>
      </div>

      {experiments.isError ? (
        <ErrorState title="Experiments failed to load" error={experiments.error} onRetry={() => experiments.refetch()} />
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Browse</CardTitle>
            {experiments.isLoading ? <Skeleton className="h-5 w-20" /> : <Badge variant="outline">{filtered.length}</Badge>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Input
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                placeholder="Search experiments…"
                aria-label="Search experiments"
              />
            </div>
            <select
              aria-label="Filter by owner"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={owner}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOwner(e.target.value)}
            >
              <option value="all">All owners</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="running">running</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="canceled">canceled</option>
              <option value="queued">queued</option>
            </select>
            <div className="w-full sm:w-52">
              <Input
                value={tag}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTag(e.target.value)}
                placeholder="Tag contains…"
                aria-label="Filter by tag"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {experiments.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="mt-2 h-10 w-full" />
              <Skeleton className="mt-2 h-10 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No experiments match your filters"
                description="Try clearing filters or create a new run from Authoring."
                actionLabel="Clear filters"
                onAction={() => {
                  setQ('');
                  setOwner('all');
                  setStatus('all');
                  setTag('');
                }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="text-left text-xs text-muted-foreground">
                      {hg.headers.map((h) => {
                        const canSort = h.column.getCanSort();
                        const sorted = h.column.getIsSorted();
                        return (
                          <th
                            key={h.id}
                            scope="col"
                            className={cn(
                              'border-b border-border px-4 py-2',
                              canSort && 'cursor-pointer select-none hover:text-foreground',
                            )}
                            onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                          >
                            <div className="flex items-center gap-2">
                              {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                              {sorted ? (
                                <span className="text-[10px] text-muted-foreground">
                                  {sorted === 'asc' ? '↑' : '↓'}
                                </span>
                              ) : null}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="border-b border-border px-4 py-3 align-top">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
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
