import YAML from 'yaml';

import type {
  ApiPage,
  AuthoringConfig,
  AuthoringTemplate,
  ConfigLanguage,
  ConfigVersion,
  Deployment,
  Experiment,
  Id,
  LogLevel,
  LogLine,
  MetricPoint,
  Model,
  ModelVersion,
  Run,
  RunStatus,
  TimelineEvent,
  Trace,
} from '@ai-infra-studio/types';

import { AuthoringConfigSchema } from '@ai-infra-studio/types';
import { chance, clamp, createRng, pick, randomFloat, randomInt, type Rng } from './prng';
import { addHours, addMinutes, parseIsoMs, toIso } from './time';

export const DEFAULT_SEED = 'ai-infra-studio';

type RunData = {
  logs: LogLine[];
  metrics: Map<string, MetricPoint[]>;
  timeline: TimelineEvent[];
};

export type AuthoringTemplateWithVersions = AuthoringTemplate & {
  versions: ConfigVersion[];
};

export type MockStore = {
  seed: string;

  listExperiments(): Experiment[];
  getExperiment(id: Id): Experiment | null;
  listRunsByExperiment(experimentId: Id): Run[];
  getRun(id: Id): (Run & { timeline: TimelineEvent[] }) | null;
  getRunLogs(runId: Id, cursor: string | undefined, limit: number): ApiPage<LogLine>;
  getRunMetrics(runId: Id, name: string, from?: string, to?: string): MetricPoint[];

  listModels(): Model[];
  listModelVersions(modelId: Id): ModelVersion[];
  listDeployments(): Deployment[];
  getDeployment(deploymentId: Id): Deployment | null;
  simulateDeploymentIncident(deploymentId: Id): Deployment | null;
  advanceDeployment(deploymentId: Id): Deployment | null;
  rollbackDeployment(deploymentId: Id): Deployment | null;
  getTrace(id: Id): Trace | null;

  listAuthoringTemplates(): AuthoringTemplate[];
  getAuthoringTemplate(id: Id): AuthoringTemplateWithVersions | null;
  getConfigVersion(id: Id): ConfigVersion | null;

  createRunFromConfig(input: {
    experimentId?: Id;
    language: ConfigLanguage;
    content: string;
    parsed: AuthoringConfig;
  }): { run: Run; experiment: Experiment; configVersion: ConfigVersion };
};

function makeIdFactory(rng: Rng) {
  let counter = 0;
  return (prefix: string): Id => {
    counter += 1;
    const a = Math.floor(rng() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
    const b = counter.toString(16).padStart(4, '0');
    return `${prefix}_${a}${b}`;
  };
}

function formatCommit(rng: Rng) {
  const chars = 'abcdef0123456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(rng() * chars.length)]!;
  return out;
}

function formatRunName(rng: Rng) {
  const adjectives = [
    'amber',
    'brisk',
    'carbon',
    'delta',
    'ember',
    'flux',
    'glacier',
    'helium',
    'ivory',
    'jolt',
    'kinetic',
    'lumen',
  ] as const;
  const nouns = ['otter', 'falcon', 'orchid', 'quartz', 'satellite', 'kepler', 'gizmo'] as const;
  return `${pick(rng, adjectives)}-${pick(rng, nouns)}-${randomInt(rng, 10, 99)}`;
}

function makeConfig(rng: Rng, overrides?: Partial<AuthoringConfig>): AuthoringConfig {
  const owner = pick(rng, ['deb', 'sara', 'mika', 'chen', 'ravi', 'sam', 'noor', 'jules']);
  const datasetName = pick(rng, ['support_intents_v2', 'ranker_clicks_2025Q2', 'fraud_graph_v5']);
  const datasetVersion = `v${randomInt(rng, 2, 11)}.${randomInt(rng, 0, 9)}`;

  const config: AuthoringConfig = {
    name: `trainer/${formatRunName(rng)}`,
    description: 'Synthetic config generated for AI Infra Studio.',
    owner,
    tags: [pick(rng, ['baseline', 'ablation', 'sweep', 'stability', 'eval']), `ds:${datasetName}`],
    training: {
      dataset: { name: datasetName, version: datasetVersion },
      compute: {
        gpuType: pick(rng, ['A100-80GB', 'H100-80GB', 'L40S']),
        gpus: pick(rng, [1, 2, 4, 8]),
        mixedPrecision: chance(rng, 0.8),
      },
      hyperparams: {
        learningRate: Number(randomFloat(rng, 0.00005, 0.0015).toFixed(6)),
        batchSize: pick(rng, [16, 32, 64, 128]),
        epochs: pick(rng, [3, 5, 8, 12, 20]),
      },
    },
  };

  const merged = { ...config, ...overrides } as AuthoringConfig;
  return AuthoringConfigSchema.parse(merged);
}

function configToText(language: ConfigLanguage, config: AuthoringConfig) {
  if (language === 'json') return JSON.stringify(config, null, 2);
  return YAML.stringify(config, { indent: 2 });
}

function genMetricSeries(input: {
  rng: Rng;
  name: string;
  start: Date;
  durationMinutes: number;
  intervalSeconds: number;
  incidentAtMinute: number;
}) {
  const { rng, name, start, durationMinutes, intervalSeconds, incidentAtMinute } = input;
  const points: MetricPoint[] = [];
  const totalSeconds = durationMinutes * 60;
  const steps = Math.floor(totalSeconds / intervalSeconds);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const minutes = (i * intervalSeconds) / 60;
    const ts = toIso(addMinutes(start, minutes));
    let value = 0;

    if (name === 'loss') {
      const startLoss = randomFloat(rng, 2.0, 3.2);
      const endLoss = randomFloat(rng, 0.18, 0.6);
      value = endLoss + (startLoss - endLoss) * Math.exp(-4.2 * t);
      if (Math.abs(minutes - incidentAtMinute) < 3) value *= randomFloat(rng, 1.08, 1.25);
      value += randomFloat(rng, -0.03, 0.03);
      value = clamp(value, 0.05, 10);
    } else if (name === 'accuracy') {
      const startAcc = randomFloat(rng, 0.05, 0.2);
      const endAcc = randomFloat(rng, 0.78, 0.93);
      value = startAcc + (endAcc - startAcc) * (1 - Math.exp(-3.6 * t));
      if (Math.abs(minutes - incidentAtMinute) < 2) value -= randomFloat(rng, 0.03, 0.08);
      value += randomFloat(rng, -0.01, 0.01);
      value = clamp(value, 0, 1);
    } else if (name === 'throughput') {
      const base = randomFloat(rng, 180, 520);
      value = base + 30 * Math.sin(t * Math.PI * 6);
      if (Math.abs(minutes - incidentAtMinute) < 2) value *= randomFloat(rng, 0.65, 0.82);
      value += randomFloat(rng, -18, 18);
      value = clamp(value, 50, 1200);
    } else if (name === 'gpu_util') {
      value = randomFloat(rng, 72, 96);
      if (Math.abs(minutes - incidentAtMinute) < 2) value -= randomFloat(rng, 15, 30);
      value += randomFloat(rng, -3, 3);
      value = clamp(value, 0, 100);
    } else {
      value = randomFloat(rng, 0, 1);
    }

    points.push({ ts, name, value: Number(value.toFixed(4)) });
  }

  return points;
}

function genLogs(input: {
  rng: Rng;
  start: Date;
  durationMinutes: number;
  incidentAtMinute: number;
  commitHash: string;
}) {
  const { rng, start, durationMinutes, incidentAtMinute, commitHash } = input;
  const totalMs = durationMinutes * 60_000;
  const lineCount = randomInt(rng, 1600, 3200);
  const baseIntervalMs = totalMs / lineCount;

  const sources = ['trainer', 'dataloader', 'eval', 'checkpoint', 'system'] as const;
  const lines: LogLine[] = [];

  for (let i = 0; i < lineCount; i++) {
    const jitter = randomFloat(rng, -0.35, 0.35) * baseIntervalMs;
    const at = addMs(start, i * baseIntervalMs + jitter);
    const minutes = (at.getTime() - start.getTime()) / 60_000;

    const inIncidentWindow = Math.abs(minutes - incidentAtMinute) < 2.5;
    const level = pickLogLevel(rng, inIncidentWindow);
    const source = pick(rng, sources);
    const message = formatLogMessage(rng, { level, source, commitHash, step: i, minutes });

    lines.push({ ts: toIso(at), level, source, message });

    if (inIncidentWindow && chance(rng, 0.08)) {
      const at2 = addMs(at, randomInt(rng, 20, 1800));
      lines.push({
        ts: toIso(at2),
        level: pick(rng, ['WARN', 'ERROR']),
        source: 'trainer',
        message: 'Gradient overflow detected; scaling down loss scale and retrying step.',
      });
    }
  }

  lines.sort((a, b) => parseIsoMs(a.ts) - parseIsoMs(b.ts));
  return lines;
}

function addMs(date: Date, ms: number) {
  return new Date(date.getTime() + ms);
}

function pickLogLevel(rng: Rng, incident: boolean): LogLevel {
  const x = rng();
  if (incident) {
    if (x < 0.06) return 'ERROR';
    if (x < 0.22) return 'WARN';
    if (x < 0.78) return 'INFO';
    return 'DEBUG';
  }
  if (x < 0.01) return 'ERROR';
  if (x < 0.07) return 'WARN';
  if (x < 0.7) return 'INFO';
  return 'DEBUG';
}

function formatLogMessage(
  rng: Rng,
  input: { level: LogLevel; source: string; commitHash: string; step: number; minutes: number },
) {
  const { level, source, commitHash, step, minutes } = input;
  const ms = Math.floor((minutes * 60_000) % 1000);
  const stepId = step.toString().padStart(6, '0');

  const templates: Record<LogLevel, readonly string[]> = {
    DEBUG: [
      'prefetch queue depth=#{n} batch=#{b}',
      'tokenizer cache hit rate=#{n}%',
      'scheduler tick: pending=#{n} running=#{b}',
      'cuda kernel launch latency=#{n}us',
    ],
    INFO: [
      'step=#{step} loss=#{loss} acc=#{acc} lr=#{lr}',
      'checkpoint saved: ckpt_#{n}.pt (#{mb}MB)',
      'eval: split=dev p95=#{n}ms acc=#{acc}',
      'data: shard=#{n}/#{b} throughput=#{tp}/s',
      'git: commit=#{commit}',
    ],
    WARN: [
      'dataloader stall detected: wait=#{n}ms',
      'gpu throttling: temp=#{n}C',
      'retrying request to feature store (attempt #{b})',
      'skipping batch: NaNs detected in input tensor',
    ],
    ERROR: [
      'CUDA out of memory: tried to allocate #{mb}MB',
      'checkpoint write failed: EIO (disk pressure)',
      'evaluation failed: invalid label index #{n}',
      'fatal: unrecoverable gradient explosion at step #{step}',
    ],
  };

  const base = pick(rng, templates[level]);
  const replacements: Record<string, string> = {
    '#{n}': randomInt(rng, 1, 99).toString(),
    '#{b}': randomInt(rng, 2, 24).toString(),
    '#{mb}': randomInt(rng, 12, 980).toString(),
    '#{tp}': randomInt(rng, 80, 1200).toString(),
    '#{acc}': (randomFloat(rng, 0.55, 0.92)).toFixed(3),
    '#{loss}': (randomFloat(rng, 0.12, 2.9)).toFixed(4),
    '#{lr}': (randomFloat(rng, 0.00001, 0.0015)).toFixed(6),
    '#{step}': stepId,
    '#{commit}': commitHash.slice(0, 12),
  };

  let message = base;
  for (const [k, v] of Object.entries(replacements)) {
    message = message.replaceAll(k, v);
  }

  return `[${source}] ${message}`;
}

function genTimeline(input: {
  rng: Rng;
  start: Date;
  durationMinutes: number;
  incidentAtMinute: number;
  commitHash: string;
}) {
  const { rng, start, durationMinutes, incidentAtMinute, commitHash } = input;
  const events: TimelineEvent[] = [];

  events.push({
    ts: toIso(start),
    type: 'commit',
    title: `code: ${commitHash.slice(0, 12)}`,
    severity: 'info',
    metadata: { branch: pick(rng, ['main', 'train/sweep', 'hotfix/metrics', 'exp/augments']) },
  });

  const ckptEvery = pick(rng, [10, 12, 15]);
  for (let m = ckptEvery; m < durationMinutes; m += ckptEvery) {
    events.push({
      ts: toIso(addMinutes(start, m)),
      type: 'checkpoint',
      title: `checkpoint @ ${m}m`,
      severity: 'info',
      metadata: { step: m * 120 },
    });
  }

  events.push({
    ts: toIso(addMinutes(start, incidentAtMinute)),
    type: 'alert',
    title: 'loss spike + GPU underutilization',
    severity: chance(rng, 0.5) ? 'critical' : 'warning',
    metadata: { detector: 'spike:v2', windowMin: 5 },
  });

  if (chance(rng, 0.45)) {
    events.push({
      ts: toIso(addMinutes(start, incidentAtMinute + randomInt(rng, 2, 10))),
      type: 'note',
      title: 'auto-mitigation: reduced batch size',
      severity: 'info',
      metadata: { action: 'batch_size', delta: '-50%' },
    });
  }

  if (chance(rng, 0.35)) {
    const deployAt = randomInt(rng, Math.floor(durationMinutes * 0.15), Math.floor(durationMinutes * 0.65));
    events.push({
      ts: toIso(addMinutes(start, deployAt)),
      type: 'deploy',
      title: 'linked deployment observed',
      severity: 'info',
      metadata: { stage: pick(rng, ['canary', 'ramp', 'prod']) },
    });
  }

  events.push({
    ts: toIso(addMinutes(start, incidentAtMinute - 1)),
    type: 'log_spike',
    title: 'log volume spike',
    severity: 'warning',
    metadata: { linesPerMin: randomInt(rng, 300, 1200) },
  });

  events.sort((a, b) => parseIsoMs(a.ts) - parseIsoMs(b.ts));
  return events;
}

function computeMetricsSummary(metrics: Map<string, MetricPoint[]>) {
  const summary: Record<string, number> = {};
  for (const [name, series] of metrics.entries()) {
    const last = series.at(-1);
    if (last) summary[name] = last.value;
  }
  return summary;
}

function generateBaseStore(seed: string, nowFn: () => Date) {
  const rng = createRng(seed);
  const makeId = makeIdFactory(rng);

  const experiments = new Map<Id, Experiment>();
  const runs = new Map<Id, Run>();
  const runsByExperiment = new Map<Id, Id[]>();
  const runDataByRun = new Map<Id, RunData>();
  const configVersions = new Map<Id, ConfigVersion>();
  const templates = new Map<Id, AuthoringTemplateWithVersions>();

  const models = new Map<Id, Model>();
  const modelVersionsByModel = new Map<Id, ModelVersion[]>();
  const deployments = new Map<Id, Deployment>();
  const traces = new Map<Id, Trace>();

  const now = nowFn();

  const quickExperimentId = 'exp_quick';
  experiments.set(quickExperimentId, {
    id: quickExperimentId,
    name: 'Quick Runs',
    owner: 'you',
    createdAt: toIso(addHours(now, -6)),
    tags: ['ad-hoc', 'authoring'],
    description: 'Runs created from Model Authoring configs.',
  });
  runsByExperiment.set(quickExperimentId, []);

  const experimentCount = 9;
  const experimentNames = [
    'Ranker: cold-start stabilization',
    'Fraud: graph features ablation',
    'Support: intent finetune sweep',
    'Vision: robustness eval harness',
    'Search: latency-aware distillation',
    'RAG: retrieval scorer v3',
    'Ads: calibration reliability',
    'Safety: toxicity classifier refresh',
    'Infra: throughput tuning',
  ] as const;

  for (let i = 0; i < experimentCount; i++) {
    const id = makeId('exp');
    const createdAt = toIso(addHours(now, -randomInt(rng, 12, 240)));
    const owner = pick(rng, ['deb', 'sara', 'mika', 'chen', 'ravi', 'sam', 'noor', 'jules']);
    const tags = uniqueSample(rng, ['baseline', 'sweep', 'ablation', 'eval', 'stability', 'perf'], 2, 4);

    experiments.set(id, {
      id,
      name: experimentNames[i] ?? `Experiment ${i + 1}`,
      owner,
      createdAt,
      tags,
      description:
        'Synthetic experiment for demo UX: runs, compare mode, metrics/logs streaming, and debugging timeline.',
    });
    runsByExperiment.set(id, []);

    const runCount = randomInt(rng, 3, 6);
    for (let r = 0; r < runCount; r++) {
      const runId = makeId('run');
      const status = pickRunStatus(rng);
      const durationMinutes = randomInt(rng, 70, 140);

      const elapsedMinutes =
        status === 'running' ? randomInt(rng, 16, 86) : durationMinutes + randomInt(rng, -4, 9);
      const startDate =
        status === 'running'
          ? addMinutes(now, -elapsedMinutes)
          : addMinutes(addHours(now, -randomInt(rng, 2, 48)), -randomInt(rng, 0, 90));
      const startedAt = toIso(startDate);

      const incidentAtMinute = randomInt(rng, 10, Math.max(14, Math.min(elapsedMinutes - 6, durationMinutes - 15)));
      const commitHash = formatCommit(rng);

      const cfg = makeConfig(rng, { owner });
      const language: ConfigLanguage = chance(rng, 0.35) ? 'yaml' : 'json';
      const content = configToText(language, cfg);
      const configVersionId = makeId('cfg');
      configVersions.set(configVersionId, {
        id: configVersionId,
        createdAt: startedAt,
        title: `run config (${language.toUpperCase()})`,
        language,
        content,
        schemaVersion: 1,
      });

      const metrics = new Map<string, MetricPoint[]>();
      for (const name of ['loss', 'accuracy', 'throughput', 'gpu_util']) {
        metrics.set(
          name,
          genMetricSeries({
            rng,
            name,
            start: startDate,
            durationMinutes: status === 'running' ? elapsedMinutes : durationMinutes,
            intervalSeconds: 15,
            incidentAtMinute,
          }),
        );
      }

      const logs = genLogs({
        rng,
        start: startDate,
        durationMinutes: status === 'running' ? elapsedMinutes : durationMinutes,
        incidentAtMinute,
        commitHash,
      });

      const timeline = genTimeline({
        rng,
        start: startDate,
        durationMinutes: status === 'running' ? elapsedMinutes : durationMinutes,
        incidentAtMinute,
        commitHash,
      });

      const endedAt =
        status === 'running'
          ? undefined
          : toIso(addMinutes(startDate, durationMinutes + randomInt(rng, -4, 9)));

      const run: Run = {
        id: runId,
        experimentId: id,
        status,
        startedAt,
        endedAt,
        configVersionId,
        metricsSummary: computeMetricsSummary(metrics),
        artifacts: genArtifacts(rng, runId),
        meta: {
          dataset: cfg.training.dataset,
          compute: {
            gpuType: cfg.training.compute.gpuType,
            gpus: cfg.training.compute.gpus,
            spot: chance(rng, 0.35),
          },
          code: {
            commitHash,
            branch: pick(rng, ['main', 'train/sweep', 'hotfix/metrics', 'exp/augments']),
          },
          cluster: {
            name: pick(rng, ['orion', 'atlas', 'zephyr', 'nebula']),
            region: pick(rng, ['us-east', 'us-west', 'eu-central']),
          },
        },
      };

      runs.set(runId, run);
      runsByExperiment.get(id)!.push(runId);
      runDataByRun.set(runId, { logs, metrics, timeline });
    }
  }

  // Authoring templates with version history.
  const templateSpecs: Array<{
    title: string;
    description: string;
    language: ConfigLanguage;
    variants: Array<Partial<AuthoringConfig>>;
  }> = [
    {
      title: 'Batch Trainer (baseline)',
      description: 'A clean starting point with stable defaults and clear training metadata.',
      language: 'json',
      variants: [
        { training: { hyperparams: { learningRate: 0.0006, batchSize: 64, epochs: 8 } } },
        { training: { hyperparams: { learningRate: 0.0003, batchSize: 128, epochs: 8 } } },
        { training: { compute: { gpuType: 'H100-80GB', gpus: 8, mixedPrecision: true } } },
      ],
    },
    {
      title: 'Finetune Sweep (fast iterate)',
      description: 'Aggressive learning rate and lower epoch count to quickly validate direction.',
      language: 'yaml',
      variants: [
        { training: { hyperparams: { learningRate: 0.0012, batchSize: 32, epochs: 3 } } },
        { training: { hyperparams: { learningRate: 0.0009, batchSize: 32, epochs: 5 } } },
        { training: { hyperparams: { learningRate: 0.0007, batchSize: 64, epochs: 5 } } },
      ],
    },
    {
      title: 'Eval-Only (shadow run)',
      description: 'Runs evaluation wiring and artifacts without changing training knobs.',
      language: 'json',
      variants: [
        { tags: ['eval', 'shadow'], training: { hyperparams: { learningRate: 0.0005, batchSize: 64, epochs: 3 } } },
        { tags: ['eval', 'shadow'], training: { hyperparams: { learningRate: 0.0005, batchSize: 64, epochs: 5 } } },
      ],
    },
  ];

  for (const spec of templateSpecs) {
    const templateId = makeId('tpl');
    const base = makeConfig(rng, { name: `template/${spec.title.toLowerCase().replaceAll(' ', '-')}` });
    const versions: ConfigVersion[] = [];

    let parentId: Id | undefined;
    for (let i = 0; i < spec.variants.length; i++) {
      const cfg = makeConfig(rng, deepMerge(base, spec.variants[i]));
      const language = spec.language;
      const content = configToText(language, cfg);
      const id = makeId('cfg');
      const createdAt = toIso(addHours(now, -randomInt(rng, 2, 72)));
      const title = i === 0 ? 'v1' : `v${i + 1}`;

      versions.push({
        id,
        createdAt,
        title,
        language,
        content,
        schemaVersion: 1,
        parentId,
      });
      parentId = id;
      configVersions.set(id, versions.at(-1)!);
    }

    const latest = versions.at(-1)!;
    templates.set(templateId, {
      id: templateId,
      title: spec.title,
      description: spec.description,
      language: spec.language,
      latestConfigVersionId: latest.id,
      versions,
    });
  }

  // Registry models + versions (link best runs).
  const modelSpecs = [
    {
      name: 'SupportIntent',
      description: 'Multi-class intent model powering support triage and self-serve answers.',
    },
    { name: 'SearchRanker', description: 'Learning-to-rank model tuned for latency-aware relevance.' },
    { name: 'FraudScore', description: 'Graph-augmented risk model for real-time fraud scoring.' },
    { name: 'ImageModeration', description: 'Vision classifier for policy compliance and safety.' },
  ] as const;

  const allRunIds = Array.from(runs.keys());
  for (const spec of modelSpecs) {
    const modelId = makeId('model');
    models.set(modelId, { id: modelId, name: spec.name, description: spec.description });

    const versions: ModelVersion[] = [];
    for (let i = 0; i < 3; i++) {
      const bestRunId = pick(rng, allRunIds);
      versions.push({
        id: makeId('mv'),
        modelId,
        version: `v${i + 1}.${randomInt(rng, 0, 9)}`,
        createdAt: toIso(addHours(now, -randomInt(rng, 12, 240))),
        bestRunId,
        evalSummary: {
          accuracy: Number(randomFloat(rng, 0.7, 0.93).toFixed(3)),
          latencyP95Ms: Number(randomFloat(rng, 18, 120).toFixed(1)),
          robustness: Number(randomFloat(rng, 0.55, 0.92).toFixed(3)),
        },
        stage: i === 2 ? 'production' : i === 1 ? 'staging' : 'draft',
      });
    }
    modelVersionsByModel.set(modelId, versions);
  }

  // Deployments derived from model versions in staging/prod.
  for (const versions of modelVersionsByModel.values()) {
    for (const v of versions) {
      if (v.stage === 'draft') continue;
      const depId = makeId('dep');
      const stage = v.stage === 'production' ? 'prod' : pick(rng, ['canary', 'ramp']);
      const startedAt = toIso(addHours(now, -randomInt(rng, 1, 72)));
      const rolloutSteps = [
        { id: makeId('step'), title: 'Canary (1%)', status: stage === 'canary' ? 'active' : 'done' },
        { id: makeId('step'), title: 'Ramp (10% → 50%)', status: stage === 'ramp' ? 'active' : stage === 'prod' ? 'done' : 'pending' },
        { id: makeId('step'), title: 'Promote (100%)', status: stage === 'prod' ? 'active' : 'pending' },
      ] as const;

      deployments.set(depId, {
        id: depId,
        modelVersionId: v.id,
        stage,
        status: pick(rng, ['running', 'running', 'paused', 'succeeded']),
        startedAt,
        endedAt: chance(rng, 0.25) ? toIso(addHours(new Date(startedAt), randomInt(rng, 1, 6))) : undefined,
        rolloutSteps: rolloutSteps.map((s) => ({ ...s })),
        incidents: [],
      });
    }
  }

  // Traces.
  for (let i = 0; i < 18; i++) {
    const modelVersionIds = Array.from(modelVersionsByModel.values()).flat().map((v) => v.id);
    const modelVersionId = pick(rng, modelVersionIds);
    const traceId = makeId('trace');
    const createdAt = toIso(addHours(now, -randomInt(rng, 1, 48)));
    const requestId = `req_${Math.floor(rng() * 1e12).toString(16)}`;

    const errorStepIndex = chance(rng, 0.18) ? randomInt(rng, 1, 3) : -1;
    const steps = genTraceSteps(rng, createdAt, errorStepIndex);

    traces.set(traceId, {
      id: traceId,
      createdAt,
      requestId,
      modelVersionId,
      steps,
      tags: uniqueSample(rng, ['shadow', 'edge-case', 'baseline', 'canary', 'perf'], 1, 3),
    });
  }

  return {
    experiments,
    runs,
    runsByExperiment,
    runDataByRun,
    configVersions,
    templates,
    models,
    modelVersionsByModel,
    deployments,
    traces,
    quickExperimentId,
    makeId,
    rng,
  };
}

function genArtifacts(rng: Rng, runId: Id): Run['artifacts'] {
  const artifacts: Run['artifacts'] = [];
  const ckpts = randomInt(rng, 2, 5);
  for (let i = 0; i < ckpts; i++) {
    artifacts.push({
      id: `${runId}_a${i}`,
      name: `checkpoint_${(i + 1).toString().padStart(2, '0')}.pt`,
      kind: 'checkpoint',
      sizeBytes: randomInt(rng, 80_000_000, 460_000_000),
    });
  }
  artifacts.push({
    id: `${runId}_report`,
    name: 'eval_report.json',
    kind: 'report',
    sizeBytes: randomInt(rng, 14_000, 220_000),
  });
  artifacts.push({
    id: `${runId}_plot`,
    name: 'metrics.png',
    kind: 'plot',
    sizeBytes: randomInt(rng, 48_000, 380_000),
  });
  return artifacts;
}

function pickRunStatus(rng: Rng): RunStatus {
  const x = rng();
  if (x < 0.12) return 'running';
  if (x < 0.2) return 'failed';
  if (x < 0.26) return 'canceled';
  return 'succeeded';
}

function uniqueSample<T>(rng: Rng, items: readonly T[], minCount: number, maxCount: number) {
  const count = clamp(randomInt(rng, minCount, maxCount), 0, items.length);
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const idx = randomInt(rng, 0, pool.length - 1);
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return picked;
}

function deepMerge<T extends object>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const existing = out[key];
      out[key] =
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>)
          : deepMerge({}, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function genTraceSteps(rng: Rng, createdAtIso: string, errorIndex: number): Trace['steps'] {
  const startedAt = new Date(createdAtIso);
  const steps: Trace['steps'] = [];

  const mk = (
    title: string,
    kind: Trace['steps'][number]['kind'],
    durationMs: number,
    status: Trace['steps'][number]['status'],
    inputPreview: string,
    outputPreview: string,
    errorMessage?: string,
  ): Trace['steps'][number] => ({
    id: `step_${Math.floor(rng() * 1e9).toString(16)}`,
    title,
    kind,
    startedAt: toIso(addMs(startedAt, steps.reduce((sum, s) => sum + s.durationMs, 0))),
    durationMs,
    status,
    inputPreview,
    outputPreview,
    errorMessage,
  });

  steps.push(
    mk(
      'Request',
      'fetch',
      randomInt(rng, 2, 9),
      'ok',
      '{"query":"reset password","locale":"en-US"}',
      '{"features":["q_len","has_verb","lang"]}',
    ),
  );
  steps.push(
    mk(
      'Feature fetch',
      'fetch',
      randomInt(rng, 6, 28),
      errorIndex === 1 ? 'error' : 'ok',
      '{"userId":"u_49201","plan":"pro"}',
      errorIndex === 1 ? '{}' : '{"sparse":[...],"dense":[...]}',
      errorIndex === 1 ? 'Timeout contacting feature store shard 03' : undefined,
    ),
  );
  steps.push(
    mk(
      'Model inference',
      'inference',
      randomInt(rng, 18, 84),
      errorIndex === 2 ? 'error' : 'ok',
      '{"input":"<vector:768>"}',
      errorIndex === 2 ? '{}' : '{"label":"account_access","p":0.87}',
      errorIndex === 2 ? 'Tensor shape mismatch in attention block (expected 768)' : undefined,
    ),
  );
  steps.push(
    mk(
      'Post-processing',
      'transform',
      randomInt(rng, 4, 20),
      errorIndex === 3 ? 'error' : 'ok',
      '{"label":"account_access","p":0.87}',
      errorIndex === 3 ? '{}' : '{"decision":"route_to_flow","confidence":"high"}',
      errorIndex === 3 ? 'Rule engine failed to parse expression: "p >> 0.8"' : undefined,
    ),
  );
  steps.push(
    mk(
      'Response',
      'response',
      randomInt(rng, 1, 6),
      'ok',
      '{"decision":"route_to_flow","confidence":"high"}',
      '{"status":200,"body":"ok"}',
    ),
  );

  return steps;
}

export function createMockStore(input?: { seed?: string; now?: () => Date }): MockStore {
  const seed = input?.seed ?? DEFAULT_SEED;
  const nowFn = input?.now ?? (() => new Date());
  const state = generateBaseStore(seed, nowFn);

  function listExperiments() {
    return Array.from(state.experiments.values()).sort(
      (a, b) => parseIsoMs(b.createdAt) - parseIsoMs(a.createdAt),
    );
  }

  function getExperiment(id: Id) {
    return state.experiments.get(id) ?? null;
  }

  function listRunsByExperiment(experimentId: Id) {
    const ids = state.runsByExperiment.get(experimentId) ?? [];
    return ids
      .map((id) => state.runs.get(id))
      .filter((r): r is Run => Boolean(r))
      .sort((a, b) => parseIsoMs(b.startedAt) - parseIsoMs(a.startedAt));
  }

  function getRun(id: Id) {
    const run = state.runs.get(id);
    if (!run) return null;
    const data = state.runDataByRun.get(id);
    return { ...run, timeline: data?.timeline ?? [] };
  }

  function getRunLogs(runId: Id, cursor: string | undefined, limit: number): ApiPage<LogLine> {
    const data = state.runDataByRun.get(runId);
    const items = data?.logs ?? [];

    const safeLimit = clamp(limit, 1, 1000);

    const beforeIndexRaw = cursor ? Number(cursor) : items.length;
    const beforeIndex =
      Number.isFinite(beforeIndexRaw) && beforeIndexRaw >= 0 ? Math.min(beforeIndexRaw, items.length) : items.length;
    const startIndex = Math.max(0, beforeIndex - safeLimit);

    const slice = items.slice(startIndex, beforeIndex);
    const next = startIndex > 0 ? String(startIndex) : undefined;

    return { items: slice, nextCursor: next };
  }

  function getRunMetrics(runId: Id, name: string, from?: string, to?: string): MetricPoint[] {
    const data = state.runDataByRun.get(runId);
    const series = data?.metrics.get(name) ?? [];
    const fromMs = from ? parseIsoMs(from) : -Infinity;
    const toMs = to ? parseIsoMs(to) : Infinity;

    if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) return series;
    return series.filter((p) => {
      const ms = parseIsoMs(p.ts);
      return ms >= fromMs && ms <= toMs;
    });
  }

  function listModels() {
    return Array.from(state.models.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function listModelVersions(modelId: Id) {
    return (state.modelVersionsByModel.get(modelId) ?? []).slice().sort((a, b) => {
      return parseIsoMs(b.createdAt) - parseIsoMs(a.createdAt);
    });
  }

  function listDeployments() {
    return Array.from(state.deployments.values()).sort(
      (a, b) => parseIsoMs(b.startedAt) - parseIsoMs(a.startedAt),
    );
  }

  function getDeployment(deploymentId: Id) {
    return state.deployments.get(deploymentId) ?? null;
  }

  function simulateDeploymentIncident(deploymentId: Id) {
    const dep = state.deployments.get(deploymentId);
    if (!dep) return null;
    const incident = {
      id: state.makeId('inc'),
      createdAt: toIso(nowFn()),
      title: pick(state.rng, [
        'p95 latency regression',
        'error rate spike',
        'canary divergence detected',
        'CPU saturation on inference workers',
      ]),
      severity: chance(state.rng, 0.55) ? 'critical' : 'warning',
    } as const;
    dep.incidents.unshift(incident);
    dep.status = 'paused';
    return dep;
  }

  function advanceDeployment(deploymentId: Id) {
    const dep = state.deployments.get(deploymentId);
    if (!dep) return null;
    if (dep.status === 'rolled_back') return dep;

    if (dep.stage === 'canary') {
      dep.stage = 'ramp';
      dep.rolloutSteps = dep.rolloutSteps.map((s, idx) => ({
        ...s,
        status: idx === 0 ? 'done' : idx === 1 ? 'active' : 'pending',
      }));
      dep.status = 'running';
      return dep;
    }

    if (dep.stage === 'ramp') {
      dep.stage = 'prod';
      dep.rolloutSteps = dep.rolloutSteps.map((s, idx) => ({
        ...s,
        status: idx <= 1 ? 'done' : 'active',
      }));
      dep.status = 'running';
      return dep;
    }

    // prod: complete
    dep.status = 'succeeded';
    dep.endedAt = toIso(nowFn());
    dep.rolloutSteps = dep.rolloutSteps.map((s) => ({ ...s, status: 'done' }));
    return dep;
  }

  function rollbackDeployment(deploymentId: Id) {
    const dep = state.deployments.get(deploymentId);
    if (!dep) return null;
    dep.status = 'rolled_back';
    dep.endedAt = toIso(nowFn());
    dep.rolloutSteps = dep.rolloutSteps.map((s, idx) => ({
      ...s,
      status: idx === 0 ? 'done' : idx === 1 && dep.stage !== 'canary' ? 'done' : idx === 2 ? 'failed' : s.status,
    }));
    return dep;
  }

  function getTrace(id: Id) {
    return state.traces.get(id) ?? null;
  }

  function listAuthoringTemplates(): AuthoringTemplate[] {
    return Array.from(state.templates.values())
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        language: t.language,
        latestConfigVersionId: t.latestConfigVersionId,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function getAuthoringTemplate(id: Id): AuthoringTemplateWithVersions | null {
    return state.templates.get(id) ?? null;
  }

  function getConfigVersion(id: Id): ConfigVersion | null {
    return state.configVersions.get(id) ?? null;
  }

  function createRunFromConfig(input: {
    experimentId?: Id;
    language: ConfigLanguage;
    content: string;
    parsed: AuthoringConfig;
  }) {
    const experimentId = input.experimentId ?? state.quickExperimentId;
    const existingExperiment = state.experiments.get(experimentId);
    const experiment: Experiment =
      existingExperiment ??
      (() => {
        const id = experimentId;
        const createdAt = toIso(nowFn());
        const exp: Experiment = {
          id,
          name: 'Quick Runs',
          owner: input.parsed.owner,
          createdAt,
          tags: ['ad-hoc', 'authoring'],
          description: 'Runs created from Model Authoring configs.',
        };
        state.experiments.set(id, exp);
        state.runsByExperiment.set(id, []);
        return exp;
      })();

    const runId = state.makeId('run');
    const startedAt = toIso(nowFn());
    const durationMinutes = randomInt(state.rng, 70, 140);
    const incidentAtMinute = randomInt(state.rng, 18, Math.max(22, durationMinutes - 15));
    const commitHash = formatCommit(state.rng);

    const configVersionId = state.makeId('cfg');
    const configVersion: ConfigVersion = {
      id: configVersionId,
      createdAt: startedAt,
      title: 'authoring draft',
      language: input.language,
      content: input.content,
      schemaVersion: 1,
    };
    state.configVersions.set(configVersionId, configVersion);

    const startDate = new Date(startedAt);
    const metrics = new Map<string, MetricPoint[]>();
    for (const name of ['loss', 'accuracy', 'throughput', 'gpu_util']) {
      metrics.set(
        name,
        genMetricSeries({
          rng: state.rng,
          name,
          start: startDate,
          durationMinutes,
          intervalSeconds: 15,
          incidentAtMinute,
        }),
      );
    }

    const logs = genLogs({
      rng: state.rng,
      start: startDate,
      durationMinutes,
      incidentAtMinute,
      commitHash,
    });

    const timeline = genTimeline({
      rng: state.rng,
      start: startDate,
      durationMinutes,
      incidentAtMinute,
      commitHash,
    });

    const run: Run = {
      id: runId,
      experimentId,
      status: 'running',
      startedAt,
      endedAt: undefined,
      configVersionId,
      metricsSummary: computeMetricsSummary(metrics),
      artifacts: genArtifacts(state.rng, runId),
      meta: {
        dataset: input.parsed.training.dataset,
        compute: {
          gpuType: input.parsed.training.compute.gpuType,
          gpus: input.parsed.training.compute.gpus,
          spot: chance(state.rng, 0.35),
        },
        code: { commitHash, branch: 'authoring/draft' },
        cluster: { name: pick(state.rng, ['orion', 'atlas', 'zephyr', 'nebula']), region: 'us-east' },
      },
    };

    state.runs.set(runId, run);
    const list = state.runsByExperiment.get(experimentId);
    if (list) list.unshift(runId);
    else state.runsByExperiment.set(experimentId, [runId]);
    state.runDataByRun.set(runId, { logs, metrics, timeline });

    return { run, experiment, configVersion };
  }

  return {
    seed,
    listExperiments,
    getExperiment,
    listRunsByExperiment,
    getRun,
    getRunLogs,
    getRunMetrics,
    listModels,
    listModelVersions,
    listDeployments,
    getDeployment,
    simulateDeploymentIncident,
    advanceDeployment,
    rollbackDeployment,
    getTrace,
    listAuthoringTemplates,
    getAuthoringTemplate,
    getConfigVersion,
    createRunFromConfig,
  };
}

let singleton: MockStore | null = null;

export function getMockStore() {
  singleton ??= createMockStore();
  return singleton;
}
