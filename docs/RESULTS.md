# Benchmark results & methodology

This file is the **versioned archive**: original measurements with dated updates as libraries moved. The README's receipts tables carry the current-stack matrix (fully re-measured 2026-08-24 on react-virtual 3.14.10 + astryx 0.4.7 + Vite; that re-run also measured both former RO-gear residuals — flick reversals and est=40 — at 0% on the new corpus, mechanisms still un-isolated).

All numbers: same machine, real Chrome 151 (headed, `--remote-debugging-port`), same corpus per comparison. Dual sampling everywhere: rAF = pre-paint upper bound, rAF+setTimeout(0) = painted truth (what the eye can see). Library versions: @legendapp/list 3.3.7, @tanstack/react-virtual 3.14.6 (see the dated 3.14.10 note under the scroll-up table), virtua 0.50.4, @virtuoso.dev/message-list 1.17.1 (localhost evaluation per its EULA), @astryxdesign 0.1.6 for rows/control (0.4.7 after 2026-08-24).

## 1. Scripted axes

### Scroll-up into cold (unmeasured) history
`?scenario=scrollup` — land at bottom, scroll up at constant px/frame through never-measured rows; metric = painted frames where an on-screen anchor row deviates >4px from the commanded step, plus a 5-probe viewport fill check.

| arm (mix=real, 1000 rows, step=10) | painted jump | max | blank strip |
|---|---|---|---|
| ballast sync | 0% | 0 | 0% |
| ballast ro (first-mount backstop) | 0% | 0 | 0% |
| ballast pure-RO (pre-fix) | 20.9% | 175px | 0% |
| LegendList web | 0.1% | 100px (1 frame) | 0% |
| TanStack (est=60 default) | 14.4% | 245px | — |
| TanStack (est=40) | 20.8% | 265px | — |
| TanStack (est=kind heuristic) | ~23% freq, half magnitude | 155px | — |
| Virtuoso ML | 0% | 0 | 67% @step60 (default overscan 0; increaseViewportBy=300 fixes) |

Estimate accuracy reduces jump *magnitude*, not *frequency* — compensation events are inherent to estimate-then-measure; only pipeline timing (sync) or re-derive anchoring eliminates them.

**2026-08-24, @tanstack/react-virtual 3.14.6 → 3.14.10** (same scenario, astryx rows now 0.4.7): painted jump 11.1%, max **10px** — frequency persists as predicted above, but magnitude collapsed from 245px to the commanded step size. Driver verified: [TanStack/virtual#1239](https://github.com/TanStack/virtual/pull/1239) (merged 2026-07-22, shipped in react-virtual 3.14.9 via virtual-core 3.17.7) — above-viewport resize compensation wrote `scrollTop` synchronously in the RO callback but notified the transform commit asynchronously, painting one frame of "new scrollTop + old transforms"; the fix notifies synchronously (flushSync) so both land in the same callback.

Provenance of the bad numbers, for honest citation: the 3.14.6 measurements in these tables landed inside a **~10-week upstream regression window**. The backward-scroll compensation skip shipped to React users on 2026-05-20 — in **patch release react-virtual 3.13.25**, which was the #1168 engine rewrite itself — with the decoupled notify in the same train ([#1227](https://github.com/TanStack/virtual/issues/1227), reporter-bisected to the core 3.14→3.16 span; last good 3.13.12); react-virtual 3.14.9 (2026-07-28) closed the window. What is architectural and persists across all versions is the compensation-event *frequency* (11.1% of frames post-fix); the magnitude and churn artifacts were regression-era.

Deeper provenance, verified in the upstream history: the regression was a **deliberate trade-off made while preparing the engine for chat workloads**. [#1168](https://github.com/TanStack/virtual/pull/1168) (2026-05-20, core 3.15.0 — the mount/measure-storm rewrite plus iOS momentum handling) added the backward-scroll compensation skip on purpose (changeset `feat-core-scroll-up-jank-default`; comment: "Adjusting during backward scroll fights the user's scroll"), and [#1173](https://github.com/TanStack/virtual/pull/1173) (five days later, core 3.16.0) shipped chat mode — `anchorTo: 'end'`, `followOnAppend`, `isAtEnd` — on top of it. That is: to kill the *churn* class (programmatic writes fighting the finger) they disabled backward compensation and created the *pop* class (uncompensated above-viewport displacement) — the exact two axes of the hand-feel metric suite in section 2. [#1239](https://github.com/TanStack/virtual/pull/1239) later resolved the dilemma properly with same-frame atomicity: compensate AND commit in the same RO callback. The delivery mechanics are the dependency-fragility lesson, and it is sharper than "pin your versions": under changesets' dependency-bump rules, each core **minor** — including the 1,348-line engine rewrite with its deliberate behavior change — reached React users as an adapter **patch** (core 3.14.0 → react-virtual 3.13.24, #1168/core 3.15.0 → **3.13.25**, chat-mode core 3.16.0 → 3.13.26, days apart; 3.14.0 then merely renamed the accumulated state). Tilde/caret ranges that consumers use precisely to receive "safe fixes only" auto-pulled the rewrite, and the paint-level artifact shipped past the project's own new benchmark suite until an external reporter hand-bisected it. The legend control re-measured identically (0.1% / 100px) across both astryx versions, so the shift is attributable to the library, not the corpus restyle. Perceptual (churn/pop) re-comparison: see the dated paired round in section 2 — the felt class is fixed too.

### Streaming follow-at-bottom
`?scenario=stream` — astryx Markdown rows, token chunks appended at 20–50 upd/s for 30s; metric = painted frames with pinErr > 4px.

| arm | rate=35 (29 upd/s) | rate=20 (50 upd/s) |
|---|---|---|
| ballast sync | 0% (0 pre-paint too) | 0% |
| ballast ro (first-mount backstop) | 1% / max 41px | 0.1% / max 21px |
| ballast pure-RO (pre-fix) | 0.8% / max 110px | 0.6% |
| LegendList web | 1.5% | 1.6–3.3% |
| TanStack | 0.5% | — |
| Virtuoso ML | 31.5% (monotonic lag) | **jump-to-top bug**: viewport thrown to transcript top, unrecovered; 2/2 runs @40 upd/s, mechanism = compensation `scrollTop += a` with a ≈ −(tall streaming item height) |
| virtua + naive userland follow | freezes (stick self-disengages on its own scrollToIndex landings) | — |
| virtua + intent-based follow | 0.9% | 0.5% |
| virtua official pin pattern | pinned prompt row: 0% movement (after excluding smooth-scroll animation windows) | 0% |

### Pipeline ablation (the key experiment)
Same 300 lines, one switch: sync (forced-layout measurement in commit) vs pure ro (ResizeObserver only). Scroll-up painted jumps went 0% → 20.9% (≈ TanStack's numbers); streaming went 0% → 0.6–0.8% (still first-tier). The streaming advantage is structural (same-task measure+restore has no observable window).

The original attribution of the scroll-up deficit — "ResizeObserver loop-depth semantics defer corrections to the next frame" — was **falsified** by two follow-up experiments: wrapping the RO-callback correction in `flushSync` changed nothing (22.2% vs 20.8% baseline), and refreshing the anchor from DOM truth inside the RO callback *worsened* the high-variance corpus 4.5× (mixing DOM-space `viewportOffset` with geo-space restore double-counts the estimate error). The real mechanism is specific to document flow: **an unmeasured row paints at its real height while the geometry still carries its estimate**, displacing everything below it (the whole viewport) by (real − est) for one frame, then snapping back when RO delivers — 2 painted artifact frames per mount, and the arithmetic closes exactly (98 geometry revisions × 2 = 196 ≈ 197 measured jump frames). Absolute-positioning designs don't have this class: their fresh rows land at estimated `translateY` without pushing neighbors.

Instructive symmetry: TanStack's own one-frame flash (fixed upstream in [#1239](https://github.com/TanStack/virtual/pull/1239)) is the same same-frame-atomicity requirement with the halves swapped. Absolute positioning writes `scrollTop` synchronously in the RO callback and was missing the synchronous *commit* — flushSync is the correct fix there. Document flow commits in time but was missing the synchronous *measurement* — which is exactly why flushSync measured as a no-op here and the first-mount sync read is what closed the axis.

The fix — measure a row synchronously **once, in its mount commit** (`offsetHeight`; growth and reflow stay on RO; steady-state commits do no forced layout) — took the axis to 0% on both corpora and cut flick reversals from 2.1% / 1513px to 0.7–0.9% / 473px. Residual: 6.4% / 262px with deliberately broken estimates (est=40), mechanism not yet isolated.

### Landing / long jump
`scrollToDistanceFromBottomPx(0)` is a declaration (re-point the reference frame, converge), not a scroll action — the window is computed from the desired bottom first, so the destination renders before the position lands. Measured: landing at frame 0, 0 blank frames; a naive `el.scrollTop = el.scrollHeight` write is *also* clean here, because the scroll handler converges synchronously before that frame's paint. Blank-flash on long jumps (observed in Claude Desktop's virtualizer) requires multi-frame traversal, i.e. smooth easing across unmounted regions — not implemented, deliberately.

## 2. Gesture axes — and two falsified metrics

Hand-feel could not be reproduced by three successive instrument designs, each falsified:

1. **Document-space displacement** of an anchor row — falsified: TanStack's jitter is scrollTop yanks (content stationary in document space); the metric cancels exactly the artifact the hand feels.
2. **CDP discrete wheel events** — falsified: Chromium applies smooth-scroll animation to discrete wheels, blending yanks into smooth motion (all arms measured clean). A `--disable-smooth-scrolling` instance also failed to reproduce.
3. **CDP touch drag** (`synthesizeScrollGesture`, source=touch) — partially works: direct-manipulation physics exposes flick/fling artifacts, but during an active drag JS scroll writes are stomped by the gesture, masking slow-drag artifacts.

### Flick+fling (touch gestures, mix=wild)
Viewport-space metrics: reversal = content moving against input direction; spike = frame-to-frame velocity discontinuity > 120px.

| arm | reversal | max reversal | scrolled by same gesture |
|---|---|---|---|
| astryx non-virtualized (control) | 0% | 0 | 19,075px |
| ballast sync | 0% | 0 | 7,986px |
| ballast ro (first-mount backstop) | 0.7–0.9% | 473px | ~8,000px |
| ballast pure-RO (pre-fix) | 2.1% | 1,513px | 10,029px |
| LegendList | 0% | 0 | 6,813px |
| TanStack | 1.3% | 728px | 6,187px |

### Real human hand, slow scroll through cold rows (mix=wild, equal-cold controlled round)
Persistent in-page sampler; the subject scrolls by trackpad at their own pace on freshly reloaded (fully cold) pages.

| metric | TanStack (est=kind) | ballast ro |
|---|---|---|
| wheel events (finger input) | 358 | 542 |
| **total scrollTop movement** | **168,669px** | **12,721px** |
| → churn ratio (programmatic : finger) | **≈13:1** | ≈1:1 |
| top-region pop rate (of active frames) | 4.6% | 2.4% |
| max pop | 1,444px | 1,584px |
| pop persistence | up to 2 frames | all 1-frame (self-heal) |

The three metrics that finally matched perception:
- **scrollTop churn ratio** — compensation writes moving the viewport 13× more than the finger commanded is the felt "jitter + scrollbar chaos + scroll resistance".
- **entering-region pop rate** — when scrolling up, the eye reads the top third of the viewport (where content enters); center-anchor metrics miss it because both libraries protect the center.
- **pop persistence** — re-derive corrections heal in 1 frame; delta-compensation misses persist across frames.

Methodology notes: an earlier uncontrolled round produced *inverted* results (ballast-ro looked worse) because the two pages had different warm/cold measurement histories from prior hand testing — equal-cold reloads are mandatory. Time-boxed sampling windows cannot catch a human subject (turn-based interaction); persistent samplers read on demand are the workable design.

**2026-08-24 paired re-round, TanStack 3.14.10** (equal-cold, same subject, flick-heavy regime; subject blind-reported "no perceptible difference" in both this and a prior spoiled round): TanStack 153.6 px of scrollTop movement per wheel event vs ballast-ro 57.1 (≈2.7:1, with the subject scrolling the TanStack arm *harder* — 1476 vs 746 wheel events); content reversals 0 on both; entering-region pop 9.7% vs 8.1% with max pop 1651 vs 1592px and max episode 5 frames on both (flick-speed pops are corpus-driven — the tallest wild row's estimate delta — and converge across arms). Verdict: **the 13:1 churn signature is a 3.14.6-era artifact; the upstream patch track fixed the felt class.** Together with the scripted 245px→10px magnitude collapse, the TanStack gap on this corpus is now frequency-only (11.1% of frames at ≤10px), below hand-perception threshold.

## 3. The echo-model bug family (found while landing the first-mount backstop)

The first-mount backstop initially made streaming *catastrophically worse* (63–84% painted unpin vs 0.4% baseline), which exposed three latent holes in programmatic-scroll discrimination. Each was located by instrumenting the full scroll-event stream around the first failure (`{t, scrollTop, progTarget, echo?}` merged with write/claim logs), not by inspection — every prior mechanism guess for these had been wrong.

1. **Silent clamps are unclaimed machinery movement.** A window-shift commit's transient layout can shrink content; the browser clamps scrollTop with no write of ours involved. The clamp's scroll event carries a value the echo slot never saw → misread as a user scroll → mode hijacked mid-stream, permanently (measured: est-120 row replaced by its 41.5px measured size → −78.5px clamp → 84% unpinned). Fix: a correction pass snapshots scrollTop at entry and **claims the exit value if it moved** — by write or by clamp. (User input cannot move scrollTop inside synchronous JS; compositor scrolls land at frame boundaries.)
2. **Scroll events duplicate under multi-change frames.** k offset changes within one frame queue up to k scroll events, dispatched across successive frames, **each reading the same final scrollTop**. A consume-once echo slot matches the first and misreads every duplicate as a user scroll (trace: `WRITE 7072.5 → CLAIM 6994 → SCROLL 6994 echo ✓ → SCROLL 6994 again, slot empty → hijack`). Fix: **sticky echo** — the expectation stays armed while events match; only a non-matching event clears it.
3. **Intent has a direction.** At 50 upd/s boot, external bottom-pins interleaved with growth produce non-echo events whose dist-from-bottom exceeds the threshold, misread as "user scrolled up 651px" (measured: 100% unpinned, one flip at t=190ms). Fix: **direction gate** — in end mode, a non-echo event whose scrollTop did not decrease cannot be a user scrolling away from the bottom; only upward movement flips to anchor.

After all three: rate=20 (50 upd/s) 0.1–0.8% painted across five runs, zero flips; rate=35 0.5–1%; sync gear regression-clean (0% on scroll-up and stream). These holes were reachable in the pure-RO build too — the backstop merely made one of them near-deterministic at boot.

### Follow-semantics (interaction axis, added 2026-08-24)
`bench/followprobe.mjs` / `bench/nudgestorm.mjs` — inside an active stream, nudge the viewport up by less than `endThreshold` and check that follow-at-end survives.

Adding a configurable `endThreshold` (default 24px, following ChatGPT's transcript; TanStack defaults to 1px, LegendList to 10% of the viewport) exposed a defect the whole scripted matrix was blind to: the disengage decision compared the *live distance to the bottom* against the threshold, and while following, the tail grows between corrections. Instrumented: 6–24px user nudges arriving as 25–59px of distance, flipping to anchor and stranding the reader mid-stream (2 of 12 samples with the old 4px threshold; 14 of 141 in a high-density storm). Same family as the three echo-model defects in section 3 — machinery movement contaminating a user-intent judgement.

Fix: disengage on accumulated *user displacement* (cleared when the user moves back, so a slow persistent scroll-up still wins even when each step is erased by a re-pin); re-engage on absolute distance, which is honest in anchor mode because nothing is pulling the viewport. After: 28/28 single-nudge samples follow, storm disengages only past accumulated threshold, full scripted matrix unchanged.

Architectural note: ChatGPT can use absolute distance for *both* transitions because its scroller is `flex flex-col-reverse` with `overflow-anchor: none` — the browser maintains bottom-distance natively (scrollTop is negative; the app calls `scrollTo({top: -distanceFromBottom})`), so pinned growth never inflates it. Its follow logic is nonetheless richer than a threshold: a directional intent machine (`away`/`toward`) with a 1000ms expiry, wheel-delta accumulation (with `deltaMode` line/page conversion) to judge where the user is *heading*, keyboard intent classification (PageUp/Home → away, Space → toward, Shift+Space → away), a 64px top-proximity trigger for loading older messages, and a stored `{distanceFromBottomPx, scrollHeightPx}` restore on any `scrollHeight` change.

## 4. Corpora

- `mix=real` — calibrated from 182 real agent sessions: 70% folded tool groups, 10% user prompts (~420ch), 20% assistant prose (~490ch, 1/16 code fence, 1/10 table).
- `mix=wild` — extreme variance: 40% tiny (single tool call), 30% medium, 20% large, 10% huge (multi-section + fences + table, 2–4k px). Designed to maximize per-row estimate error.

## 5. Ecosystem measurement notes

- LegendList web ships **no real-browser tests** (jsdom + mocked geometry only) — the artifact classes measured here are structurally invisible to its CI. Its quality is design-carried, and holds: 0% on every gesture metric.
- All four web libraries (TanStack, LegendList, virtua, react-virtuoso) are RO-timing-class; none measures synchronously in the commit. virtuoso is a hybrid (container-RO trigger + offsetHeight batch harvest, with an optional rAF deferral path).
- virtua ships no built-in follow/landing (position-stability primitives only); its official chat pattern is prompt-pinning with a viewport-height blank reserve, and its e2e suite (Playwright, real WebKit, touch/momentum emulation, per-browser tolerances) is the strongest testing reference in the space.
