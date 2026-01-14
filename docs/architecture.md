# Architecture

AI Infra Studio is a local-only demo of a fictional internal AI infrastructure platform.

- `apps/api`: Fastify REST + WebSocket streaming (synthetic events)
- `apps/web`: Next.js App Router UI (React Query, TanStack Table, virtualized logs)
- `packages/mock-data`: deterministic synthetic data generator + in-memory store
- `packages/types`: shared TypeScript types
- `packages/ui`: shared UI primitives and design tokens

## Data flow

```
apps/web (Next.js)
  ├─ REST fetches (React Query) ───────────────► apps/api (Fastify)
  │                                             └─ reads/writes in-memory store
  └─ WS subscription (/ws/runs/:id) ◄─────────── emits metric/log/timeline events
```

The API owns the “source of truth” for the session: a deterministic base dataset plus runtime mutations (create run, simulate incident, rollout changes).

## API surface

REST (selected):

- `GET /dashboard`
- `GET /experiments`
- `GET /experiments/:id`
- `GET /experiments/:id/runs`
- `GET /runs/:id`
- `GET /runs/:id/logs?cursor=&limit=`
- `GET /runs/:id/metrics?name=&from=&to=`
- `POST /runs` (create run from authoring config)
- `GET /registry/models`
- `GET /registry/models/:id/versions`
- `GET /deployments`
- `POST /deployments/:id/simulate-incident`
- `POST /deployments/:id/advance`
- `POST /deployments/:id/rollback`
- `GET /traces/:id`

WebSocket:

- `WS /ws/runs/:id`
  - emits every ~500–1500ms:
    - `metric_point`
    - `log_line`
    - `timeline_event`
  - can simulate disconnects via `WS_CHAOS_DISCONNECT=1`

## Web app architecture

- React Query is the primary “data plane”:
  - list/detail queries for experiments, runs, registry, deployments, traces
  - infinite query for logs pagination
- Run streaming:
  - the run page subscribes to WS events and merges updates into local state
  - UI shows connection status and recovers after disconnects
- Performance:
  - logs viewer uses `@tanstack/react-virtual` for virtualization
  - charts are lightweight SVG components (sparklines + line charts)

## The Time Warp Timeline

The timeline is a client component that renders:

- Multi-track event lanes (deploy markers, checkpoints, alerts, log spikes, commit markers)
- A brush/overview control that sets the visible window for the detail view
- Hover inspection:
  - nearest event at cursor time
  - metric values interpolated by nearest-point lookup
- Pinning:
  - click (or keyboard activate) an event to pin it
  - pins appear in a side panel and can be compared (metric deltas + log pattern shifts)

