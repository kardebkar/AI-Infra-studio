import { z } from 'zod';

export type Id = string;
export type IsoDateString = string;

export type ConfigLanguage = 'yaml' | 'json';

export type ConfigVersion = {
  id: Id;
  createdAt: IsoDateString;
  title: string;
  language: ConfigLanguage;
  content: string;
  schemaVersion: number;
  parentId?: Id;
};

export type Experiment = {
  id: Id;
  name: string;
  owner: string;
  createdAt: IsoDateString;
  tags: string[];
  description: string;
};

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export type RunMeta = {
  dataset: { name: string; version: string };
  compute: { gpuType: string; gpus: number; spot: boolean };
  code: { commitHash: string; branch: string };
  cluster: { name: string; region: string };
};

export type Run = {
  id: Id;
  experimentId: Id;
  status: RunStatus;
  startedAt: IsoDateString;
  endedAt?: IsoDateString;
  configVersionId: Id;
  metricsSummary: Record<string, number>;
  artifacts: { id: Id; name: string; kind: 'checkpoint' | 'report' | 'plot'; sizeBytes: number }[];
  meta: RunMeta;
};

export type MetricPoint = {
  ts: IsoDateString;
  name: string;
  value: number;
};

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type LogLine = {
  ts: IsoDateString;
  level: LogLevel;
  message: string;
  source: string;
};

export type TimelineEventType =
  | 'deploy'
  | 'checkpoint'
  | 'alert'
  | 'log_spike'
  | 'commit'
  | 'note';

export type TimelineEvent = {
  ts: IsoDateString;
  type: TimelineEventType;
  title: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, string | number | boolean | null>;
};

export type Model = {
  id: Id;
  name: string;
  description: string;
};

export type ModelVersionStage = 'draft' | 'staging' | 'production' | 'archived';

export type ModelVersion = {
  id: Id;
  modelId: Id;
  version: string;
  createdAt: IsoDateString;
  bestRunId: Id;
  evalSummary: {
    accuracy: number;
    latencyP95Ms: number;
    robustness: number;
  };
  stage: ModelVersionStage;
};

export type DeploymentStage = 'canary' | 'ramp' | 'prod';
export type DeploymentStatus = 'running' | 'paused' | 'succeeded' | 'rolled_back';

export type Deployment = {
  id: Id;
  modelVersionId: Id;
  stage: DeploymentStage;
  status: DeploymentStatus;
  startedAt: IsoDateString;
  endedAt?: IsoDateString;
  rolloutSteps: { id: Id; title: string; status: 'pending' | 'active' | 'done' | 'failed' }[];
  incidents: { id: Id; createdAt: IsoDateString; title: string; severity: 'warning' | 'critical' }[];
};

export type TraceStep = {
  id: Id;
  title: string;
  kind: 'fetch' | 'inference' | 'transform' | 'response';
  startedAt: IsoDateString;
  durationMs: number;
  status: 'ok' | 'error';
  inputPreview: string;
  outputPreview: string;
  errorMessage?: string;
};

export type Trace = {
  id: Id;
  createdAt: IsoDateString;
  requestId: string;
  modelVersionId: Id;
  steps: TraceStep[];
  tags: string[];
};

export type AuthoringTemplate = {
  id: Id;
  title: string;
  description: string;
  language: ConfigLanguage;
  latestConfigVersionId: Id;
};

export const AuthoringConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  owner: z.string().min(1),
  tags: z.array(z.string()).default([]),
  training: z.object({
    dataset: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
    }),
    compute: z.object({
      gpuType: z.string().min(1),
      gpus: z.number().int().min(1).max(32),
      mixedPrecision: z.boolean().default(true),
    }),
    hyperparams: z.object({
      learningRate: z.number().positive(),
      batchSize: z.number().int().min(1),
      epochs: z.number().int().min(1).max(200),
    }),
  }),
});

export type AuthoringConfig = z.infer<typeof AuthoringConfigSchema>;

export type ApiPage<T> = {
  items: T[];
  nextCursor?: string;
};

export type WsRunEvent =
  | { type: 'metric_point'; runId: Id; point: MetricPoint }
  | { type: 'log_line'; runId: Id; line: LogLine }
  | { type: 'timeline_event'; runId: Id; event: TimelineEvent }
  | { type: 'status'; runId: Id; status: RunStatus };

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};
