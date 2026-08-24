# Bench runners

All runners speak raw CDP over WebSocket (no puppeteer/playwright dependency) and need a
headed Chrome started with a debugging port, e.g.:

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --remote-debugging-port=9222 --user-data-dir=/tmp/ballast-chrome about:blank

Frame-accurate measurement does not work in embedded browser panes (rAF throttling) —
use a real, visible Chrome window.

- `bench.mjs <url> [timeoutMs]` — opens a harness URL, waits for the scenario to finish,
  prints the HUD summary JSON. The scripted scenarios (stream / scrollup / rest) drive
  themselves.
- `wheelbench.mjs <url> <slow|flick>` — touch-gesture replay via Input.synthesizeScrollGesture
  (direct-manipulation physics); viewport-space reversal + jerk metrics.
- `livemeasure.mjs <urlSubstring> install|read` — attaches a PERSISTENT hand-feel sampler to an
  already-open tab (churn, entering-region pops, pop persistence); a human scrolls, then `read`.
- `jump.mjs <url> <api|naive>` — long-jump-to-bottom fill test.
- `probe.mjs <url> [secs]` — 250ms geometry samples (scrollTop/scrollHeight/pinErr/rows).
- `errs.mjs <url>` — page exception capture.
- `tabeval.mjs <tabId> <expr>` — evaluate in an open tab.

## Interaction probes

- `followprobe.mjs` — inside an active stream, nudge the viewport up by less than `endThreshold` and verify follow-at-end survives; reports pass/fail per sample.
- `logstreamprobe.mjs` — instruments astryx lab LogStream's own follow logic (`?list=logstream`).
- `anchorprobe.mjs` — imperative `anchorToKey` long jumps: blank frames, frames-to-land, final offset.
- `nudgestorm.mjs` — ~140 sub-threshold nudges at varied frame phases in one stream, reporting every disengage decision with the state that caused it.

Both need `scenario=stream` plus a long `dur` (e.g. `&dur=120000`) so all samples land inside one streaming window; sampling after the stream ends measures a static list and reads as false failures.
