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
- `repriceprobe.mjs` — holds a declared `anchorToKey` and checks the invariant a
  running-average move must not break: scrollTop and the geometry's own
  `offsetOf(anchorKey)` have to agree once everything settles (docs/RESULTS.md
  § 11). It reports `skip` when the averages never moved — which is what it does
  against the current corpora, because they settle during mount. The reproduction
  that DOES arm lives in `bench/tanstack-suite/`; keep this one as the invariant
  check against a corpus that can move the averages after a jump.

## Cross-library suites

- `tanstack-suite/` — an adapter making ballast an arm of TanStack Virtual's own
  Playwright benchmark suite (mount/settle/landing-accuracy/heap), plus
  `repriceprobe.mjs`, the validated reproduction of the § 11 repricing race
  (2/10 misses before the fix, 0/12 after). See its README for setup; it is the
  one thing here that is not raw CDP, for reasons documented in the file.

Both need `scenario=stream` plus a long `dur` (e.g. `&dur=120000`) so all samples land inside one streaming window; sampling after the stream ends measures a static list and reads as false failures.

## Regression matrix

`bench/matrix.mjs` runs the standard 8-profile matrix. It needs a dedicated
bench Chrome whose occluded windows keep a real frame clock (plain background
TABS are useless — `document.hidden` gates rAF off entirely):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9224 --user-data-dir=/tmp/chrome-bench-9224 \
  --no-first-run --disable-background-timer-throttling \
  --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
  --disable-features=IntensiveWakeUpThrottling &
PORT=9224 node bench/matrix.mjs           # parallel smoke, ~35s
CONC=1 PORT=9224 node bench/matrix.mjs    # serial, ~2min — use for receipts
```

Parallel mode contends for GPU/CPU with anything else running (including a
human hand-testing in another Chrome): use it as a smoke test, and re-run
failures serially on a quiet machine before believing them.
