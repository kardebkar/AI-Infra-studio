import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import YAML from 'yaml';

import { getMockStore } from '@ai-infra-studio/mock-data';
import { AuthoringConfigSchema, type ApiError, type WsRunEvent } from '@ai-infra-studio/types';

function shouldChaosFail(requestUrl: string) {
  if (process.env.NODE_ENV === 'test') return false;
  const url = new URL(requestUrl, 'http://localhost');
  const chaos = url.searchParams.get('chaos');
  if (chaos !== '1') return false;
  const rate = Number(process.env.CHAOS_RATE ?? 0.18);
  return Math.random() < (Number.isFinite(rate) ? rate : 0.18);
}

function sendError(reply: { status: (code: number) => unknown; send: (payload: unknown) => unknown }, input: ApiError, status = 500) {
  return reply.status(status).send(input);
}

export async function createServer() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await server.register(cors, { origin: true });
  await server.register(websocket);

  const store = getMockStore();

  server.addHook('preHandler', async (request, reply) => {
    if (shouldChaosFail(request.url)) {
      return sendError(
        reply,
        {
          code: 'CHAOS_500',
          message: 'Synthetic 500 (chaos mode). Retry should recover.',
          details: { hint: 'Remove ?chaos=1 to disable failures.' },
        },
        500,
      );
    }
  });

  server.get('/health', async () => ({ ok: true, seed: store.seed }));

  server.get('/dashboard', async () => {
    const experiments = store.listExperiments();
    const allRuns = experiments.flatMap((e) => store.listRunsByExperiment(e.id));

    const activeRuns = allRuns
      .filter((r) => r.status === 'running')
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, 6);

    const recentDeploys = store.listDeployments().slice(0, 6);

    const alerts = allRuns
      .flatMap((r) => {
        const run = store.getRun(r.id);
        const timeline = run?.timeline ?? [];
        return timeline
          .filter((e) => e.type === 'alert')
          .map((e) => ({
            id: `${r.id}_${e.ts}`,
            ts: e.ts,
            title: e.title,
            severity: e.severity ?? 'warning',
            runId: r.id,
            experimentId: r.experimentId,
          }));
      })
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 8);

    return {
      activeRuns,
      recentDeploys,
      alerts,
      sparklines: {
        gpu_util: makeSparkline('gpu_util', 60, store.seed),
        throughput: makeSparkline('throughput', 60, store.seed),
      },
    };
  });

  // Experiments
  server.get('/experiments', async () => store.listExperiments());
  server.get('/experiments/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const exp = store.getExperiment(id);
    if (!exp) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Experiment not found: ${id}` }, 404);
    }
    return exp;
  });
  server.get('/experiments/:id/runs', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const exp = store.getExperiment(id);
    if (!exp) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Experiment not found: ${id}` }, 404);
    }
    return store.listRunsByExperiment(id);
  });

  // Runs
  server.get('/runs/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const run = store.getRun(id);
    if (!run) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Run not found: ${id}` }, 404);
    }
    return run;
  });
  server.get('/runs/:id/logs', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const run = store.getRun(id);
    if (!run) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Run not found: ${id}` }, 404);
    }
    const query = request.query as { cursor?: string; limit?: string };
    const limit = Number(query.limit ?? 200);
    return store.getRunLogs(id, query.cursor, Number.isFinite(limit) ? limit : 200);
  });
  server.get('/runs/:id/metrics', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const run = store.getRun(id);
    if (!run) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Run not found: ${id}` }, 404);
    }
    const query = request.query as { name?: string; from?: string; to?: string };
    const name = query.name?.trim();
    if (!name) {
      return sendError(reply, { code: 'BAD_REQUEST', message: 'Missing required query param: name' }, 400);
    }
    return store.getRunMetrics(id, name, query.from, query.to);
  });

  // Model Registry
  server.get('/registry/models', async () => store.listModels());
  server.get('/registry/models/:id/versions', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const model = store.listModels().find((m) => m.id === id);
    if (!model) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Model not found: ${id}` }, 404);
    }
    return store.listModelVersions(id);
  });

  // Deployments
  server.get('/deployments', async () => store.listDeployments());
  server.post('/deployments/:id/simulate-incident', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updated = store.simulateDeploymentIncident(id);
    if (!updated) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Deployment not found: ${id}` }, 404);
    }
    return updated;
  });
  server.post('/deployments/:id/advance', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updated = store.advanceDeployment(id);
    if (!updated) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Deployment not found: ${id}` }, 404);
    }
    return updated;
  });
  server.post('/deployments/:id/rollback', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const updated = store.rollbackDeployment(id);
    if (!updated) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Deployment not found: ${id}` }, 404);
    }
    return updated;
  });

  // Traces
  server.get('/traces/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const trace = store.getTrace(id);
    if (!trace) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Trace not found: ${id}` }, 404);
    }
    return trace;
  });

  // Authoring
  server.get('/authoring/templates', async () => store.listAuthoringTemplates());
  server.get('/authoring/templates/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const tpl = store.getAuthoringTemplate(id);
    if (!tpl) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Template not found: ${id}` }, 404);
    }
    return tpl;
  });
  server.get('/config-versions/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const v = store.getConfigVersion(id);
    if (!v) {
      return sendError(reply, { code: 'NOT_FOUND', message: `Config version not found: ${id}` }, 404);
    }
    return v;
  });
  server.post('/runs', async (request, reply) => {
    const body = request.body as unknown;
    const parsed = parseCreateRunBody(body);
    if (!parsed.ok) {
      return sendError(reply, { code: 'BAD_REQUEST', message: parsed.error }, 400);
    }

    const { language, content } = parsed.value;
    const raw = parseConfigText({ language, content });
    if (!raw.ok) {
      return sendError(reply, { code: 'CONFIG_PARSE_ERROR', message: raw.error }, 400);
    }

    const validated = AuthoringConfigSchema.safeParse(raw.value);
    if (!validated.success) {
      return sendError(
        reply,
        {
          code: 'CONFIG_SCHEMA_ERROR',
          message: 'Config failed schema validation.',
          details: validated.error.format(),
        },
        400,
      );
    }

    const created = store.createRunFromConfig({
      language,
      content,
      parsed: validated.data,
    });

    return reply.status(201).send(created);
  });

  // WebSocket streaming: run events
  server.get(
    '/ws/runs/:id',
    { websocket: true },
    (connection, request) => {
      const id = (request.params as { id: string }).id;
      const run = store.getRun(id);

      if (!run) {
        connection.socket.send(
          JSON.stringify({ code: 'NOT_FOUND', message: `Run not found: ${id}` } satisfies ApiError),
        );
        connection.socket.close();
        return;
      }

      const send = (event: WsRunEvent) => connection.socket.send(JSON.stringify(event));

      send({ type: 'status', runId: id, status: run.status });

      const metricNames = ['loss', 'accuracy', 'throughput', 'gpu_util'] as const;
      const metricValues = new Map<string, number>();
      for (const m of metricNames) {
        const series = store.getRunMetrics(id, m);
        metricValues.set(m, series.at(-1)?.value ?? seedMetric(m));
      }

      let step = 0;
      let closed = false;
      const timers = new Set<NodeJS.Timeout>();

      const chaosDisconnectEnabled = (process.env.WS_CHAOS_DISCONNECT ?? '1') !== '0';
      if (chaosDisconnectEnabled) {
        const min = Number(process.env.WS_DISCONNECT_MIN_MS ?? 20_000);
        const max = Number(process.env.WS_DISCONNECT_MAX_MS ?? 45_000);
        const ms = randomBetween(isFiniteNumber(min) ? min : 20_000, isFiniteNumber(max) ? max : 45_000);
        const t = setTimeout(() => {
          connection.socket.close(1012, 'Synthetic disconnect (demo)');
        }, ms);
        timers.add(t);
      }

      connection.socket.on('close', () => {
        closed = true;
        for (const t of timers) clearTimeout(t);
      });

      const tick = () => {
        if (closed) return;
        step += 1;

        const r = Math.random();
        if (r < 0.5) {
          const line = genStreamLogLine({ runId: id, step, metrics: metricValues });
          send({ type: 'log_line', runId: id, line });
        } else if (r < 0.9) {
          const name = metricNames[Math.floor(Math.random() * metricNames.length)]!;
          const value = nextMetricValue(name, metricValues.get(name) ?? seedMetric(name));
          metricValues.set(name, value);
          send({
            type: 'metric_point',
            runId: id,
            point: { ts: new Date().toISOString(), name, value },
          });
        } else {
          const event = genStreamTimelineEvent(step);
          send({ type: 'timeline_event', runId: id, event });
        }

        const delayMs = randomBetween(500, 1500);
        const t = setTimeout(tick, delayMs);
        timers.add(t);
      };

      tick();
    },
  );

  return server;
}

function isFiniteNumber(n: number) {
  return Number.isFinite(n);
}

function randomBetween(minMs: number, maxMs: number) {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseCreateRunBody(body: unknown):
  | { ok: true; value: { language: 'yaml' | 'json'; content: string } }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected JSON body.' };
  const b = body as Record<string, unknown>;
  const language = b.language;
  const content = b.content;
  if (language !== 'yaml' && language !== 'json') {
    return { ok: false, error: 'Expected language to be "yaml" or "json".' };
  }
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { ok: false, error: 'Expected content to be a non-empty string.' };
  }
  return { ok: true, value: { language, content } };
}

function parseConfigText(input: { language: 'yaml' | 'json'; content: string }):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  try {
    if (input.language === 'json') return { ok: true, value: JSON.parse(input.content) as unknown };
    const doc = YAML.parse(input.content);
    return { ok: true, value: doc as unknown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse config.' };
  }
}

function seedMetric(name: string) {
  switch (name) {
    case 'loss':
      return 0.7;
    case 'accuracy':
      return 0.82;
    case 'throughput':
      return 420;
    case 'gpu_util':
      return 88;
    default:
      return 0;
  }
}

function nextMetricValue(name: string, prev: number) {
  const noise = () => (Math.random() - 0.5) * 2;
  if (name === 'loss') return Math.max(0.02, prev + noise() * 0.02 - 0.003);
  if (name === 'accuracy') return clamp01(prev + noise() * 0.004 + 0.001);
  if (name === 'throughput') return Math.max(1, prev + noise() * 12);
  if (name === 'gpu_util') return clamp01((prev + noise() * 1.8) / 100) * 100;
  return prev;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function genStreamLogLine(input: { runId: string; step: number; metrics: Map<string, number> }): LogLine {
  const loss = input.metrics.get('loss') ?? 0.7;
  const acc = input.metrics.get('accuracy') ?? 0.82;
  const lr = 0.0005 + (Math.sin(input.step / 40) * 0.00008);
  const level = pickStreamLogLevel(input.step);
  const source = level === 'ERROR' ? 'trainer' : level === 'WARN' ? 'system' : 'trainer';
  const msg =
    level === 'INFO'
      ? `[trainer] step=${input.step.toString().padStart(6, '0')} loss=${loss.toFixed(4)} acc=${acc.toFixed(3)} lr=${lr.toFixed(6)}`
      : level === 'WARN'
        ? `[system] gpu throttling: temp=${Math.floor(70 + Math.random() * 22)}C`
        : level === 'ERROR'
          ? '[trainer] checkpoint write failed: EIO (simulated)'
          : `[trainer] scheduler tick: pending=${Math.floor(Math.random() * 18)} running=${Math.floor(
              1 + Math.random() * 6,
            )}`;

  return { ts: new Date().toISOString(), level, source, message: msg };
}

function pickStreamLogLevel(step: number): LogLevel {
  const x = Math.random();
  const inSpike = step % 40 >= 34;
  if (inSpike && x < 0.12) return 'ERROR';
  if (inSpike && x < 0.35) return 'WARN';
  if (x < 0.01) return 'ERROR';
  if (x < 0.08) return 'WARN';
  if (x < 0.76) return 'INFO';
  return 'DEBUG';
}

function genStreamTimelineEvent(step: number): TimelineEvent {
  const ts = new Date().toISOString();
  const kind = step % 3 === 0 ? 'checkpoint' : step % 3 === 1 ? 'alert' : 'log_spike';
  if (kind === 'checkpoint') {
    return { ts, type: 'checkpoint', title: 'checkpoint saved', severity: 'info', metadata: { step } };
  }
  if (kind === 'log_spike') {
    return { ts, type: 'log_spike', title: 'log spike (stream)', severity: 'warning', metadata: { linesPerMin: 900 } };
  }
  return { ts, type: 'alert', title: 'anomaly detected: p95 latency drift', severity: 'warning', metadata: { step } };
}

function makeSparkline(name: string, minutes: number, seed: string) {
  const now = Date.now();
  const bucket = Math.floor(now / 60_000);
  const rng = createSparkRng(`${seed}:${name}:${minutes}:${bucket}`);
  const points: Array<{ ts: string; name: string; value: number }> = [];
  for (let i = minutes - 1; i >= 0; i--) {
    const ts = new Date(now - i * 60_000).toISOString();
    const t = (minutes - i) / minutes;
    let value = 0;
    if (name === 'gpu_util') {
      value = 82 + 6 * Math.sin(t * Math.PI * 2) + (rng() - 0.5) * 6;
      value = Math.max(0, Math.min(100, value));
    } else if (name === 'throughput') {
      value = 410 + 60 * Math.sin(t * Math.PI * 3) + (rng() - 0.5) * 40;
      value = Math.max(50, value);
    } else {
      value = (rng() - 0.5) * 2;
    }
    points.push({ ts, name, value: Number(value.toFixed(2)) });
  }
  return points;
}

function createSparkRng(seed: string) {
  let state = sparkHash(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sparkHash(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
