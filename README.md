# ballast

An experimental virtualized list for React web, built for AI chat/feed transcripts and measured into existence: every design decision in this repo traces to a benchmark result, most of them collected against TanStack Virtual, LegendList web, virtua, and react-virtuoso's commercial Message List on the same corpus.

**Status: experimental.** ~300 lines, Chromium-verified only. Not production software; the receipts below say exactly what has and hasn't been proven.

## The design

Three ideas, each borrowed from a production system that independently converged on it, composed for the first time:

1. **Aggregate top/bottom spacers** — rendered rows stay in normal document flow between two placeholder divs (the architecture Claude Desktop's in-house virtualizer uses). O(1) placeholder nodes; native-flow semantics for mounted rows.
2. **Bottom-distance bookkeeping** — the desired position is stored as *px from the bottom edge* (the coordinate system ChatGPT's transcript uses, where it comes free from a `column-reverse` scroller; here it is JS bookkeeping on a normal-flow container, which keeps native reading order, find-in-page and a11y sequence intact). Above-viewport estimate→measured swaps and pinned tail growth are both identity operations in this frame, so the two most common disturbance classes in a chat workload need no compensation at all.
3. **Identity-anchor override** — position is re-derived from an anchored *row key*: chosen automatically while the user reads history, or declared through `anchorToKey(key, viewportOffset)` (offset 0 = pin that row to the viewport top). Corrections re-derive from a reference instead of accumulating deltas, so a single miss self-heals — the compensation-delta bug class (measured in two competitors) structurally cannot occur. Identity anchoring is the convergent solution here, not a novel one: the CSS Scroll Anchoring spec does it at the browser level (picking a node, which is why every library in this space sets `overflow-anchor: none` to take over), React Native's `maintainVisibleContentPosition` and Android's `scrollToPositionWithOffset` do it natively, and LegendList web tracks an `anchorId`. The delta-compensation camp (TanStack; Virtuoso, which anchors by *index* rather than identity) is the other branch.

Plus a **switchable measurement pipeline**, which the ablation below shows is the single most important knob in this design space:

- `measureMode: 'sync'` — forced-layout measurement inside the commit's layout effect. Corrections are atomic with the content change; zero observable transients. Costs a forced synchronous layout per commit — affordable for chat-sized windows (~20 rows, 57fps held), the classic thrashing risk for large/heavy pages.
- `measureMode: 'ro'` — ResizeObserver measurement, plus a **first-mount sync backstop**: a row whose size was never measured is read once (`offsetHeight`) in its mount commit. In document flow an unmeasured row paints at its real height while the geometry still carries its estimate, displacing the whole viewport by (real − est) for a frame — an artifact class absolute-positioning designs don't have, and the entire pure-RO scroll-up deficit (20.9% → 0% measured). Growth and reflow of already-measured rows stay on the RO pipeline; steady-state commits do no forced layout.

Supporting machinery that the benchmarks forced into existence (each was a measured failure first):

- **Echo-matching** for programmatic-scroll discrimination (a time window swallows real user scrolls; measured 59% jitter before the fix).
- **Live-anchor refresh** at correction time (scroll events lag rAF scrolls by a frame; 11.3% residual before the fix).
- **Convergence protection** (`converging`): declarative targets (mount landing, `scrollToDistanceFromBottomPx`, `anchorToKey`) are protected from mode-flips *and* from the live-anchor refresh until reached; only intent signals (wheel/touchstart) break in early. Without the first, a transient clamp mid-bootstrap reads as a user scroll and anchors the list mid-flight (measured: full freeze); without the second, a declared anchor is overwritten by whichever row happens to be under the current scroll position (measured: `anchorToKey` a no-op).
- **Phase-0 spacer writes** before any forced layout read, killing the transient-collapse → browser-clamp window on window-shift commits.
- **Entry/exit claim**: a correction pass snapshots scrollTop on entry and claims the exit value if it moved — a silent browser clamp during a transient layout inside the pass is machinery movement, and its scroll event must not read as a user scroll (measured: mid-stream mode hijack, 84% unpinned).
- **Sticky echo**: k offset changes in one frame queue up to k scroll events dispatched across successive frames, each reading the same final scrollTop; a consume-once echo slot matches the first and misreads every duplicate as a user scroll. The expectation stays armed while events match; only a non-matching event clears it.
- **Direction gate**: in end mode, a non-echo scroll event whose scrollTop did not decrease cannot be a user scrolling away from the bottom — it's tail growth, an external bottom write, or a clamp echo. Only upward movement flips to anchor mode (measured: boot-time hijack at 50 upd/s, 100% unpinned).
- **Displacement-based disengage**: leaving follow-at-end is decided by how far the *user* has moved (accumulated across events, cleared when they move back), never by the live distance to the bottom — while following, the tail grows between corrections, so that distance carries machinery movement the user did not make. Measured: 6–24px nudges reading as 25–59px of distance, flipping to anchor and stranding the reader mid-stream. Re-engaging uses the absolute distance, which *is* honest in anchor mode because nothing is pulling the viewport. (ChatGPT can use absolute distance for both because its `column-reverse` container makes the browser maintain bottom-distance natively; a normal-flow list bookkeeping it in JS cannot.)

## Receipts (same corpus, same machine, real Chrome)

All cells measured 2026-08-24 on one stack: Chrome 151, @tanstack/react-virtual 3.14.10, @legendapp/list 3.3.7, @virtuoso.dev/message-list 1.17.1 (localhost evaluation), astryx 0.4.7 rows, Vite-served. Versioned history — including TanStack's 3.14.6 regression-window numbers (virtual#1227) and the pure-RO ablation — lives in `docs/RESULTS.md`.

Scripted axes — painted (user-visible) artifact frames:

| Axis | ballast sync | ballast ro | LegendList web | TanStack | Virtuoso ML |
|---|---|---|---|---|---|
| Scroll-up cold history (10px/f) | **0%** | **0%** | 0.1% / 100px | 11.1% / ≤10px | 0% jump; 2.6% blank strip |
| Scroll-up, bad estimates (est=40) | **0%** | **0%** | — | 10.4% / ≤10px | — |
| Fast-scroll blank strip (60px/f) | **0%** | **0%** | 0% | — | 69.6% (default overscan; `increaseViewportBy` fixes) |
| Stream follow 29 upd/s | **0%** | 0.1% / max 21px | 1.4% / 62px | 0.2% / 21px | 32.8% (monotonic lag) |
| Stream follow 50 upd/s | **0%** | 0.2% / max 21px | 1.7% / 164px | — | 87.5% / 9,487px (jump-to-top bug) |
| Long jump to bottom (blank frames) | **0** | — | — | — | — |

Gesture axes (`wild` high-variance corpus):

| Axis | ballast sync | ballast ro | LegendList | TanStack |
|---|---|---|---|---|
| Flick+fling content reversal (CDP touch) | **0%** | **0%** | 0% | 0% |
| Hand paired round: scrollTop moved per wheel event | — | **57 px** | — | 154 px (≈2.7:1, subject scrolling this arm *harder*) |
| Hand paired round: entering-region pop rate | — | 8.1% | — | 9.7% |
| Hand paired round: content reversal | — | **0** | — | **0** |

The hand round was equal-cold and flick-heavy; the subject blind-reported no perceptible difference between the two arms — consistent with the scripted gap (11.1% of frames at ≤10px) sitting below hand-perception threshold. At flick speed, pop magnitude is corpus-set (the tallest wild row's estimate delta) on both arms; only pop rate and persistence are algorithm-sensitive. The 3.14.6-era hand numbers (13:1 churn against a regression-window TanStack) and their derivation are archived in `docs/RESULTS.md`.

The hand-feel metrics (churn ratio, entering-region pop rate, pop persistence) are, to our knowledge, novel — scripted constant-step scrolling, CDP wheel events (smoothing-masked), and CDP touch drags (JS writes stomped mid-drag) all fail to reproduce what a human hand feels; the derivation is in `docs/RESULTS.md`.

## Positioning vs the free open-source alternatives

Both comparisons are against libraries measured in this repo's own harness, on the current stack, with the receipts above; both cut in each direction.

|  | ballast | LegendList web | TanStack Virtual |
|---|---|---|---|
| Positioning model | document flow between two spacers | absolute | absolute |
| Correction model | re-derive from a reference every pass | re-derive (mvcp anchoring) | delta compensation (`scrollTop += a`) |
| Native coordinate | bottom-distance (end frame) | top offsets + anchoring options | top offsets + `anchorTo: 'end'` mode (2026-05) |
| Measured on this corpus | 0% every axis, both gears | 0.1% scroll-up, 1.4–1.7% stream, 0% gestures | 11.1% @ ≤10px scroll-up, 0.2% stream, 0% gestures |
| Size / deps | ~430 lines, zero deps | RN+web dual-platform codebase | multi-framework engine (core + adapters) |
| Real-browser paint tests | this harness (6 arms, 4 corpora) | none (jsdom, mocked geometry) | benchmarks exist; missed the 2026 regression |

**vs TanStack Virtual.** Post-#1239 the user-visible gap is small (11.1% of frames at ≤10px — blind-imperceptible in our paired hand round), so the argument is not "TanStack is janky"; it is about how the guarantee is obtained. TanStack's correctness is *maintained*: every resize path must remember to compensate, with the right amount, notified in the same frame — and the 2026 history shows what that costs (the #1168 rewrite deliberately disabled backward compensation because delta-writes "fight the user's scroll", trading the churn class for the pop class; #1227 shipped ~10 weeks before an external reporter hand-bisected it; #1239 finally resolved the dilemma with same-frame atomicity; a 1,348-line rewrite with that behavior change reached `~`/`^` consumers as a *patch*, 3.13.25). ballast's correctness is *constructed*: positions re-derive from a reference every pass, so "forgot to compensate" is not an expressible bug, a missed frame self-heals, and the churn-vs-pop dilemma does not arise — corrections converge to a reference instead of pushing against the finger's scalar. The remaining architectural line: end-anchoring is TanStack's newest mode on a start-anchored engine (still patching one-frame prepend jumps in 3.16.1), while it is ballast's native frame, in which tail growth and above-viewport estimate swaps are identity operations — the 11.1% compensation-event floor measured on TanStack simply has no counterpart. TanStack wins on everything scope-shaped: maturity, adapters for every framework, lanes/RTL/sticky/horizontal, iOS Safari momentum handling, scroll restoration, huge-list pedigree.

**vs LegendList web.** The closest relative — its mvcp anchoring philosophy is one of the three ideas this design borrows, it measures gesture-clean in this harness, and it is what the author's own production app ships today. ballast's edges are narrower and honestly stated: the streaming margin (0.1–0.2% vs 1.4–1.7%, structural — same-task measure+restore has no observable window); the sync gear's zero-proof (a reference implementation showing artifacts are a pipeline choice, which a shipped library cannot afford to carry); auditability (~430 lines vs a dual-platform RN+web codebase, relevant when a design system wants an ownable primitive rather than a dependency); and document-flow semantics (native cross-row selection, find-in-page, cheap aria-posinset — absolute positioning fights all three). LegendList wins on production maturity, one API across RN and web, recycling and per-type estimates, and a maintained feature surface. One caveat applies to both it and TanStack equally: neither guards paint-level behavior in CI (LegendList ships jsdom-only tests; TanStack's own benchmarks missed its regression) — which is why this repo treats the conformance harness as half the deliverable.

## Known debts (honest list)

- **RO-gear residuals are corpus-sensitive, not closed**: on the current corpus (astryx 0.4.7) both former residuals measure 0% — flick reversals (was 0.7–0.9% / 473px) and the est=40 axis (was 6.4% / 262px) — but neither mechanism was ever isolated, so treat them as dormant until a reproducing corpus is found, not fixed. Historical numbers in `docs/RESULTS.md`. The previous version of this entry estimated the RO deficit fix at 300–500 lines of "same-frame correction discipline" — falsified: the measured fix was ~40 lines (first-mount sync backstop + entry/exit claim + sticky echo + direction gate).
- **Chromium-only**: zero Safari/Firefox verification. virtua's e2e suite (Playwright, real WebKit, per-browser tolerances) is the porting reference.
- **No a11y yet**: document flow makes the Rocksteady/ChatGPT a11y patterns (aria-posinset on flow rows, focus return) cheap to add, but none are implemented.
- **Feature surface is minimal**: no recycling, RTL, sticky, horizontal, sections. Deliberate — this is a primitive under evaluation, not a product.
- Intent-interruption path (wheel/touch canceling convergence) has no automated coverage; it has only been exercised by hand.

## Layout

- `src/index.mjs` — the entire library. Imperative API (via `apiRef`): `scrollToDistanceFromBottomPx(px)` and `anchorToKey(key, viewportOffset)`. Both are *declarations* — they re-point the reference frame and let the restore loop converge, so the window is computed from the destination and it renders before the position lands (measured: 8/8 long jumps land on frame 0 with 0 blank frames, both gears).

  Note `anchorToKey` clamps to the scrollable range, so pinning a row near the end (the "hold the new prompt at the top" pattern) also needs reserved space below it — not implemented yet. The harness imports this exact file, so the receipts always describe the shipped code.
- `harness/` — the benchmark page: 6 list arms (ballast, LegendList, TanStack, virtua, Virtuoso ML, non-virtualized astryx control), 4 corpora incl. `mix=real` (calibrated from 182 real agent sessions) and `mix=wild` (extreme height variance), scenarios for stream-follow, scroll-up, reflow, and memory.
- `bench/` — CDP runners: scripted scenarios (`bench.mjs`), touch-gesture replay (`wheelbench.mjs`), live hand-scroll instrumentation (`livemeasure.mjs`), long-jump fill (`jump.mjs`), follow-semantics probes (`followprobe.mjs`, `nudgestorm.mjs`), and debugging probes.
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
