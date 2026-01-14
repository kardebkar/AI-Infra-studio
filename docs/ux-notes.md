# UX Notes

This demo focuses on “dense tooling” UX patterns:

- Fast, keyboard-first navigation and global search
- High-signal tables with filtering and scanability
- Streaming observability (logs + metrics) with resilient reconnect UX
- Timeline-based debugging (“Time Warp Timeline”) and pinned moments

## “Design engineering” details

- App shell
  - Left nav + top bar
  - Dark mode default with a toggle
  - Landmark-friendly layout (`nav`, `header`, `main`)
- Loading patterns
  - Use skeletons for perceived speed and layout stability
  - Keep transitions subtle and avoid spinner-only screens
- Error patterns
  - Clear title + short “what happened”
  - Primary action: retry
  - Optional “details” disclosure with raw error payload for debugging
- Empty states
  - Explain what the user is looking at
  - Provide a next-step CTA (e.g., “Create run”, “Clear filters”)

## Dense tables

- Sticky headers to keep context while scrolling
- Row hover + focus-visible styles
- Quick filters (text search + owner/status/tag)
- Keep column typography compact and scannable (monospace for IDs/hashes)

## Observability (Run detail)

The run page is the flagship “debugging” experience:

- Live badge indicating WS state: connected/reconnecting/offline
- Metrics tab: multiple charts that update as streaming points arrive
- Logs tab:
  - virtualized rendering for large lists
  - level highlighting (INFO/WARN/ERROR)
  - search with highlight
  - “pin” a line to build a debugging narrative
- Timeline tab:
  - brush/zoom + hover inspect
  - pin moments that can jump you to logs around the same timestamp
  - compare two pinned moments (metric deltas + log pattern shifts)

