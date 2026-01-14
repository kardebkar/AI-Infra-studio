# Decisions (ADRs)

## ADR-0001: Synthetic data only

All workflows (experiments, runs, deployments, traces) use deterministic synthetic data generated from a seed. The API keeps an in-memory store for runtime mutations like “Create Run” and “Simulate incident”.

## ADR-0002: WebSocket event model

The API streams run events (`metric_point`, `log_line`, `timeline_event`) over `WS /ws/runs/:id`. The web app subscribes on the run detail page and merges incremental updates into cached queries.

## ADR-0003: Charts are lightweight SVG

Instead of a heavyweight charting library, charts are rendered with small custom SVG components (sparklines + simple line charts) for performance and control.

## ADR-0004: Timeline-first debugging narrative

The run detail page centers on a “Time Warp Timeline” component that lets users:

- zoom into time ranges via a brush
- pin moments (events/log spikes/alerts)
- compare two pins to answer “what changed?”

This mirrors real AI infra workflows where a run’s “story” is reconstructed across metrics, logs, and events.

## ADR-0005: Workspace packages export source

`packages/ui`, `packages/types`, and `packages/mock-data` export TypeScript source via `package.json#exports` for simplicity in a local demo:

- Next.js can transpile workspace packages via `transpilePackages`
- The API runs with `tsx` in dev mode

This avoids a separate build pipeline for shared packages while keeping the monorepo easy to iterate on.
