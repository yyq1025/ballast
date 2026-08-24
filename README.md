# ballast

An experimental virtualized list for React web, built for AI chat/feed transcripts and measured into existence: every design decision in this repo traces to a benchmark result, most of them collected against TanStack Virtual, LegendList web, virtua, and react-virtuoso's commercial Message List on the same corpus.

**Status: experimental.** ~300 lines, Chromium-verified only. Not production software; the receipts below say exactly what has and hasn't been proven.

## The design

Three ideas, each borrowed from a production system that independently converged on it, composed for the first time:

1. **Aggregate top/bottom spacers** — rendered rows stay in normal document flow between two placeholder divs (the architecture Claude Desktop's in-house virtualizer uses). O(1) placeholder nodes; native-flow semantics for mounted rows.
2. **Bottom-distance bookkeeping** — the desired position is stored as *px from the bottom edge* (the coordinate system ChatGPT's transcript uses). Above-viewport estimate→measured swaps and pinned tail growth are both identity operations in this frame, so the two most common disturbance classes in a chat workload need no compensation at all.
3. **Identity-anchor override** — while the user reads history, position is re-derived from an anchored row (the LegendList/mvcp philosophy). Corrections re-derive from a reference instead of accumulating deltas, so a single miss self-heals — the compensation-delta bug class (measured in two competitors) structurally cannot occur.

Plus a **switchable measurement pipeline**, which the ablation below shows is the single most important knob in this design space:

- `measureMode: 'sync'` — forced-layout measurement inside the commit's layout effect. Corrections are atomic with the content change; zero observable transients. Costs a forced synchronous layout per commit — affordable for chat-sized windows (~20 rows, 57fps held), the classic thrashing risk for large/heavy pages.
- `measureMode: 'ro'` — ResizeObserver measurement, plus a **first-mount sync backstop**: a row whose size was never measured is read once (`offsetHeight`) in its mount commit. In document flow an unmeasured row paints at its real height while the geometry still carries its estimate, displacing the whole viewport by (real − est) for a frame — an artifact class absolute-positioning designs don't have, and the entire pure-RO scroll-up deficit (20.9% → 0% measured). Growth and reflow of already-measured rows stay on the RO pipeline; steady-state commits do no forced layout.

Supporting machinery that the benchmarks forced into existence (each was a measured failure first):

- **Echo-matching** for programmatic-scroll discrimination (a time window swallows real user scrolls; measured 59% jitter before the fix).
- **Live-anchor refresh** at correction time (scroll events lag rAF scrolls by a frame; 11.3% residual before the fix).
- **Convergence protection** (`converging`): declarative targets (mount landing, `scrollToDistanceFromBottomPx`) are protected from mode-flips until reached; only intent signals (wheel/touchstart) break in early. Without it, a transient clamp mid-bootstrap reads as a user scroll and anchors the list mid-flight (measured: full freeze).
- **Phase-0 spacer writes** before any forced layout read, killing the transient-collapse → browser-clamp window on window-shift commits.
- **Entry/exit claim**: a correction pass snapshots scrollTop on entry and claims the exit value if it moved — a silent browser clamp during a transient layout inside the pass is machinery movement, and its scroll event must not read as a user scroll (measured: mid-stream mode hijack, 84% unpinned).
- **Sticky echo**: k offset changes in one frame queue up to k scroll events dispatched across successive frames, each reading the same final scrollTop; a consume-once echo slot matches the first and misreads every duplicate as a user scroll. The expectation stays armed while events match; only a non-matching event clears it.
- **Direction gate**: in end mode, a non-echo scroll event whose scrollTop did not decrease cannot be a user scrolling away from the bottom — it's tail growth, an external bottom write, or a clamp echo. Only upward movement flips to anchor mode (measured: boot-time hijack at 50 upd/s, 100% unpinned).

## Receipts (same corpus, same machine, real Chrome)

Scripted axes — painted (user-visible) artifact frames:

| Axis | ballast sync | ballast ro | LegendList web | TanStack | Virtuoso ML |
|---|---|---|---|---|---|
| Scroll-up cold history (10px/f) | **0%** | **0%** | 0.1% | 14.4% | 0% |
| Scroll-up, bad estimates (est=40) | **0%** | 6.4% | — | 20.8% | — |
| Fast-scroll blank strip (60px/f) | **0%** | 0% | 0% | — | 67% |
| Stream follow 29 upd/s | **0%** | 1% / max 41px | 1.5% | 0.5% | 31.5% |
| Stream follow 50 upd/s | **0%** | 0.1% | 1.6–3.3% | — | jump-to-top bug |
| Long jump to bottom (blank frames) | **0** | — | — | — | — |

(ro-gear numbers include the first-mount sync backstop; the pure-RO ablation numbers it replaced — 20.9% / 16.3% / 0.8% — are preserved in `docs/RESULTS.md`. TanStack column measured on 3.14.6; on 3.14.10 the scroll-up cell re-measures at 11.1% with max jump collapsed to 10px — upstream fixes landed; dated note in RESULTS.)

Gesture axes (CDP touch gestures / real human hand, `wild` high-variance corpus):

| Axis | ballast sync | ballast ro | LegendList | TanStack |
|---|---|---|---|---|
| Flick+fling content reversal | **0%** | 0.7–0.9% / max 473px (was 2.1% / 1513px pre-fix) | 0% | 1.3% / 728px |
| Hand slow-scroll: scrollTop churn (programmatic / finger input) | — | **≈1:1** † | — | **13:1** |
| Hand slow-scroll: top-region pop rate | — | 2.4%, all 1-frame † | — | 4.6%, up to 2-frame |
| Hand mixed-speed gesture, fixed build: content reversal | — | **0 / 1092 active frames** (51,000px scrolled) | — | — |

† collected on the pre-fix pure-RO build. The fixed build has been hand-checked (zero reversals, row above), but the churn ratio and pop rate are *paired* measurements — they need both arms scrolled in the same gesture regime, and the fixed-build round ran ~2.3× faster per wheel event than the original. Re-collection as a controlled pair is pending. Note that `max pop` (1,584px) reproduced to the pixel across builds and rounds: it is set by the corpus (the tallest `wild` row's estimate→measured delta), not by the algorithm — only pop *rate* and *persistence* are algorithm-sensitive.

The hand-feel metrics (churn ratio, entering-region pop rate, pop persistence) are, to our knowledge, novel — scripted constant-step scrolling, CDP wheel events (smoothing-masked), and CDP touch drags (JS writes stomped mid-drag) all fail to reproduce what a human hand feels; the derivation is in `docs/RESULTS.md`.

## Known debts (honest list)

- **RO-gear residuals**: flick reversals 0.7–0.9% / max 473px (better than TanStack's 1.3% / 728px, not zero), and 6.4% / max 262px on the deliberately-broken-estimates axis (est=40) with the mechanism not yet isolated. The previous version of this entry estimated the RO deficit fix at 300–500 lines of "same-frame correction discipline" — falsified: the measured fix was ~40 lines (first-mount sync backstop + entry/exit claim + sticky echo + direction gate; derivation in `docs/RESULTS.md`).
- **Chromium-only**: zero Safari/Firefox verification. virtua's e2e suite (Playwright, real WebKit, per-browser tolerances) is the porting reference.
- **No a11y yet**: document flow makes the Rocksteady/ChatGPT a11y patterns (aria-posinset on flow rows, focus return) cheap to add, but none are implemented.
- **Feature surface is minimal**: no recycling, RTL, sticky, horizontal, sections. Deliberate — this is a primitive under evaluation, not a product.
- Intent-interruption path (wheel/touch canceling convergence) has no automated coverage; it has only been exercised by hand.

## Layout

- `src/index.mjs` — the entire library. The harness imports this exact file (via import map), so the receipts always describe the shipped code.
- `harness/` — the benchmark page: 6 list arms (ballast, LegendList, TanStack, virtua, Virtuoso ML, non-virtualized astryx control), 4 corpora incl. `mix=real` (calibrated from 182 real agent sessions) and `mix=wild` (extreme height variance), scenarios for stream-follow, scroll-up, reflow, and memory.
- `bench/` — CDP runners: scripted scenarios (`bench.mjs`), touch-gesture replay (`wheelbench.mjs`), live hand-scroll instrumentation (`livemeasure.mjs`), long-jump fill (`jump.mjs`), and debugging probes.
- `docs/RESULTS.md` — full numbers, methodology, and the two metric falsifications that led to the hand-feel suite.

## Running the harness

```bash
bun install
bun run harness
# open http://localhost:5490/harness/index.html?list=proto&scenario=scrollup&mix=real&size=1000
```

The harness is a Vite dev server (port 5490, cross-origin-isolated so the memory scenario can call `measureUserAgentSpecificMemory`). All benchmark deps resolve locally through Vite's pre-bundling — after install, runs make zero network requests (esm.sh cold-fetch races produced ghost runs before this; see `docs/RESULTS.md`). The page still imports `src/index.mjs` directly, so the receipts always describe the shipped code.

Bench runners need a Chrome with `--remote-debugging-port=9222` (frame-accurate measurement does not work in embedded panes):

```bash
node bench/bench.mjs "http://localhost:5490/harness/index.html?list=proto&scenario=stream&md=astryx&rate=20"
```

## Provenance

The spacer/anchor vocabulary follows publicly observable behavior of Claude Desktop's and ChatGPT's transcript renderers (DOM structure and runtime behavior); all code here is written from scratch. LegendList, TanStack Virtual, virtua, and react-virtuoso were used as benchmark subjects via their public npm packages; virtua's e2e methodology informed the gesture-testing approach (MIT).
