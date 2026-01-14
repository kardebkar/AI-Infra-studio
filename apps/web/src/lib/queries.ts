import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ApiPage,
  AuthoringTemplate,
  ConfigVersion,
  Deployment,
  Experiment,
  LogLine,
  MetricPoint,
  Model,
  ModelVersion,
  Run,
  TimelineEvent,
  Trace,
} from '@ai-infra-studio/types';

import { apiFetch } from './api';

export type DashboardAlert = {
  id: string;
  ts: string;
  title: string;
  severity: string;
  runId: string;
  experimentId: string;
};

export type DashboardResponse = {
  activeRuns: Run[];
  recentDeploys: Deployment[];
  alerts: DashboardAlert[];
  sparklines: Record<string, MetricPoint[]>;
};

export function useDashboard(chaos = false) {
  return useQuery({
    queryKey: ['dashboard', { chaos }] as const,
    queryFn: () => apiFetch<DashboardResponse>(`/dashboard${chaos ? '?chaos=1' : ''}`),
  });
}

export function useExperiments(chaos = false) {
  return useQuery({
    queryKey: ['experiments', { chaos }] as const,
    queryFn: () => apiFetch<Experiment[]>(`/experiments${chaos ? '?chaos=1' : ''}`),
  });
}

export function useExperiment(id: string, chaos = false) {
  return useQuery({
    queryKey: ['experiment', { id, chaos }] as const,
    queryFn: () => apiFetch<Experiment>(`/experiments/${id}${chaos ? '?chaos=1' : ''}`),
    enabled: Boolean(id),
  });
}

export function useExperimentRuns(id: string, chaos = false) {
  return useQuery({
    queryKey: ['experimentRuns', { id, chaos }] as const,
    queryFn: () => apiFetch<Run[]>(`/experiments/${id}/runs${chaos ? '?chaos=1' : ''}`),
    enabled: Boolean(id),
  });
}

export function useRun(id: string, chaos = false) {
  return useQuery({
    queryKey: ['run', { id, chaos }] as const,
    queryFn: () => apiFetch<Run & { timeline: TimelineEvent[] }>(`/runs/${id}${chaos ? '?chaos=1' : ''}`),
    enabled: Boolean(id),
  });
}

export function useRunMetrics(id: string, name: string, from?: string, to?: string, chaos = false) {
  return useQuery({
    queryKey: ['runMetrics', { id, name, from, to, chaos }] as const,
    queryFn: () => {
      const q = new URLSearchParams();
      q.set('name', name);
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      if (chaos) q.set('chaos', '1');
      return apiFetch<MetricPoint[]>(`/runs/${id}/metrics?${q.toString()}`);
    },
    enabled: Boolean(id && name),
  });
}

export function useRunLogs(id: string, limit = 300, chaos = false) {
  return useInfiniteQuery({
    queryKey: ['runLogs', { id, limit, chaos }] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams();
      if (pageParam) q.set('cursor', pageParam);
      q.set('limit', String(limit));
      if (chaos) q.set('chaos', '1');
      return apiFetch<ApiPage<LogLine>>(`/runs/${id}/logs?${q.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(id),
  });
}

export function useModels(chaos = false) {
  return useQuery({
    queryKey: ['models', { chaos }] as const,
    queryFn: () => apiFetch<Model[]>(`/registry/models${chaos ? '?chaos=1' : ''}`),
  });
}

export function useModelVersions(modelId: string, chaos = false) {
  return useQuery({
    queryKey: ['modelVersions', { modelId, chaos }] as const,
    queryFn: () => apiFetch<ModelVersion[]>(`/registry/models/${modelId}/versions${chaos ? '?chaos=1' : ''}`),
    enabled: Boolean(modelId),
  });
}

export function useDeployments(chaos = false) {
  return useQuery({
    queryKey: ['deployments', { chaos }] as const,
    queryFn: () => apiFetch<Deployment[]>(`/deployments${chaos ? '?chaos=1' : ''}`),
  });
}

export function useTrace(id: string, chaos = false) {
  return useQuery({
    queryKey: ['trace', { id, chaos }] as const,
    queryFn: () => apiFetch<Trace>(`/traces/${id}${chaos ? '?chaos=1' : ''}`),
    enabled: Boolean(id),
  });
}

export function useAuthoringTemplates(chaos = false) {
  return useQuery({
    queryKey: ['authoringTemplates', { chaos }] as const,
    queryFn: () => apiFetch<AuthoringTemplate[]>(`/authoring/templates${chaos ? '?chaos=1' : ''}`),
  });
}

export type AuthoringTemplateDetail = AuthoringTemplate & { versions: ConfigVersion[] };

export function useAuthoringTemplate(id: string, chaos = false) {
  return useQuery({
    queryKey: ['authoringTemplate', { id, chaos }] as const,
    queryFn: () => apiFetch<AuthoringTemplateDetail>(`/authoring/templates/${id}${chaos ? '?chaos=1' : ''}`),
    enabled: Boolean(id),
  });
}

export function useConfigVersion(id: string, chaos = false) {
  return useQuery({
    queryKey: ['configVersion', { id, chaos }] as const,
    queryFn: () => apiFetch<ConfigVersion>(`/config-versions/${id}${chaos ? '?chaos=1' : ''}`),
    enabled: Boolean(id),
  });
}

export type CreateRunInput = { language: 'yaml' | 'json'; content: string };
export type CreateRunResponse = { run: Run; experiment: Experiment; configVersion: ConfigVersion };

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRunInput) =>
      apiFetch<CreateRunResponse>('/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      await qc.invalidateQueries({ queryKey: ['experiments'] });
      await qc.invalidateQueries({ queryKey: ['deployments'] });
    },
  });
}

export function useSimulateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      apiFetch<Deployment>(`/deployments/${deploymentId}/simulate-incident`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['deployments'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAdvanceDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      apiFetch<Deployment>(`/deployments/${deploymentId}/advance`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['deployments'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRollbackDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      apiFetch<Deployment>(`/deployments/${deploymentId}/rollback`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['deployments'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
