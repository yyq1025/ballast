# Benchmark results & methodology

This file is the **versioned archive**: original measurements with dated updates as libraries moved. The README's receipts tables carry the current-stack matrix (fully re-measured 2026-08-24 on react-virtual 3.14.10 + astryx 0.4.7 + Vite; that re-run also measured both former RO-gear residuals — flick reversals and est=40 — at 0% on the new corpus, mechanisms still un-isolated).

**Engine coverage.** The *automated* matrix is Blink and only Blink: the runners speak raw CDP, which is a Chromium protocol. Non-Chromium numbers come off other paths, which the harness supports because every scenario self-drives and prints its read-out on the page — no debugger required. **WebKit** from § 7 onward: desktop Safari through `safaridriver --mcp` (Technology Preview with remote automation on, one tool call per measurement), plus the iOS Simulator and a real iPhone reading `?probe=1` / `?blank=1` / `?release=1` off the page, since nothing can attach there. **Gecko** on the two axes labelled as such — the `directDomUpdates` re-run in § 7 and the prepend axis in § 8 — driven by an ad-hoc Playwright script that was never committed. Cross-engine claims say so and give both numbers: the bottom deadlock reads 599/600 in Blink and in WebKit alike. What does not exist is a *re-runnable* non-Chromium pass over the full painted-frame matrix, so every percentage in the README's first table should be read as a Blink number.

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

- LegendList web ships **no real-browser tests** (jsdom + mocked geometry only) — the artifact classes measured here are structurally invisible to its CI. Its quality is design-carried, and holds under Blink's CDP drags: 0% on every gesture metric there. Under WebKit *touch* it does not — § 12.
- All four web libraries (TanStack, LegendList, virtua, react-virtuoso) are RO-timing-class; none measures synchronously in the commit. virtuoso is a hybrid (container-RO trigger + offsetHeight batch harvest, with an optional rAF deferral path).
- virtua ships no built-in follow/landing (position-stability primitives only); its official chat pattern is prompt-pinning with a viewport-height blank reserve, and its e2e suite (Playwright, real WebKit, touch/momentum emulation, per-browser tolerances) is the strongest testing reference in the space.

## 6. 2026-08-24 session: estimator, follow semantics, and the closure audits

Mechanism changes landed this session, each with its receipt:

- **Shrinkage estimator replaced the min-count gate.** Per-type buckets price as `(sum + 5·baseline) / (count + 5)` — the inherited baseline counts as 5 virtual samples, so young buckets slide continuously from baseline to their own mean. The hard `count < 5` gate's threshold crossing was itself a mass-repricing event: gate version left 0.24% residuals on sync/est40; shrinkage measures 0% across the scroll-up matrix. Re-measures replace their old contribution (`sum += px − prev`, count unchanged), so a streaming row re-measured dozens of times stays one sample.
- **The ChatGPT-style wheel-toward-bottom accumulator was retired.** With honest running-average estimates the receding-bottom race it compensated for no longer reproduces: ablation showed a monotone approach either way, the accumulator only bought arrival a few clicks earlier. Re-engage is position-based (`dist ≤ endThreshold` at a user scroll event); the scroll-to-bottom button is the declarative path back mid-stream. This is the Rocksteady semantic (their bundle: wheel-up instant unpin + 1px re-engage threshold + button), not the ChatGPT one — production splits on this fork.
- **Wheel-up instant unpin** (the piece of wheel handling that stays): during a stream, a follow write can land between the browser moving scrollTop and the scroll handler reading it, so the user's upward movement reads back as our own echo and the disengage is swallowed (measured: scroll-up during an active stream snapped straight back to the bottom; ablation reproduced 1/3 runs). Acting on the wheel event needs no scrollTop read — no race window.
- **Pre-mutation spacer floor (useInsertionEffect).** Slow wheel near the bottom of a *static* transcript yanked back 314–426px at random clicks on the astryx ChatLayout arm — never on plain-div rows. A window-slide commit has a gap between React removing evicted rows and our layout effect growing the spacer; consumer row effects run first (children before parents), and one forcing layout in that gap sees the collapsed height → browser clamps scrollTop → the live-anchor refresh adopts the clamp as the user's position. Verified by elimination: instance-level scrollTop-setter shadow showed no JS writer, rAF-sampled scrollHeight constant, magnitude = evicted rows' height. The insertion effect floor-sizes spacers (grow-only) before mutations, so the transient is strictly taller and cannot clamp. Post-fix: 0 pushes across mouse/trackpad/very-slow profiles.
- **Two external audits, both substantially correct.** GPT found the stale-closure class: the memoized pass chain froze on the first render's `scrollElement` — masked in the harness by inline props, fatal for an idiomatic memoized consumer (measured: geometry frozen at 120px estimates, scrollHeight 121838 vs 292832 live, with ChatLayout's own spring masking the corpse by pinning the bottom; `?memo=1` arm is the permanent regression). Grok caught a committed bisect stump (container observe silently disabled while the commit message claimed it) plus the redundant landing effect whose wrong desiredTop was the source of the constant 1px landing offset — probes settle at exactly 0 after its deletion. The closure fix's end state: machinery is plain render-scope functions; everything created once (RO callback, imperative handle, rAF retry) dials `syncRef.current`.

## 7. 2026-08-25 session: the touch write-gate

Every measurement above drives the list through wheel gestures or programmatic
scrolls. Both leave one input class untested: **touch**, which produces scroll
events with no wheel event anywhere. A phone hand-test ("dragging up doesn't
track my finger, and it bounces back") opened the gap.

### The probe

Same shape as the scroll-up probe, but the input is a bare `scrollTop` walk
(−8px/frame, 600 frames) framed by synthetic `touchstart`/`touchend` — i.e. the
event vocabulary a finger produces. Three numbers: pushbacks (frames where the
engine reverted the commanded step), drift (the anchored row's *painted*
position deviating from the commanded movement), and the flush shift (painted
movement after the gesture ends).

### Three defects, one input class

| | before | after |
|---|---|---|
| slow drag off the bottom | 599/600 frames reverted, 8px travelled of 4800 | 0 reverted, full travel |
| drift under the finger (48000px travel) | ±46–90px per mount batch | 0 events, 0px |
| flush after the gesture | up to +148px painted jump | 0–1px |
| simulator fling | ~2 messages, momentum killed | ~39 messages |

1. **Bottom deadlock.** Re-engage is a position test (`dist ≤ endThreshold`),
   disengage is a displacement test. With per-event restores writing scrollTop
   back, a slow drag never accumulated enough displacement to escape the
   re-engage zone: every step was undone before the next arrived. Wheel input
   never hit this — wheel-up unpins instantly, and one wheel notch clears 24px
   in a single event. Identical in Blink and WebKit (599/600 both), so this is
   virtualizer behaviour, not an engine difference.
2. **Momentum cancellation.** Where momentum belongs to the scroll view (iOS
   WebKit, Android), a programmatic `scrollTop` write cancels the fling. Where
   it lives in the input stream (a macOS trackpad, arriving as wheel events), a
   write cannot stop it — and that platform emits no touch events, so no
   platform test is needed: gating on touch events *is* the platform test.
3. **Uncompensated drift.** With scrollTop untouchable, rows mounting above the
   viewport land their (real − estimate) delta in the geometry and everything
   below crawls under the finger.

### The fix, and why flow layout can do better here

While the gate holds, the correction that would have been written to scrollTop
goes into the **top spacer** instead (`gestureAdj`), and `paintOrigin()` =
origin + adjustment converts between painted space and model space so the two
are never mixed. Absolute-positioned virtualizers have no equivalent knob: rows
are placed by transform, so a measurement must move them, and the only
compensation available is scrollTop — which is exactly what a gesture forbids.
TanStack defers the deltas into a ledger and replays them after the gesture
(measured on the same phone, same corpus: a 3675px settle jump); the spacer
absorbs them as they happen, so the flush is an ordinary sync from the mode
with no ledger to replay (0–1px).

The flush re-states the reference frame **unconditionally** — that restatement
is also what hands the adjustment back (`anchorAt` reads through
`paintOrigin`, so the carried adjustment folds into the stored viewportOffset,
and zeroing it leaves the sync one balancing write in the same task). Whether
the gesture *moved* decides only the semantics: a real scroll re-judges follow
against the bottom edge, a plain tap keeps the mode it had. Two measured
counterexamples pin this shape: skipping the fold on a tap dropped the
adjustment on the floor (10680px jump when a tap landed while measurements were
still arriving), and letting the live-anchor refresh re-derive afterwards erased
the fold (+148px).

### Audit follow-ups (2026-08-25)

- **"Did the gesture move?" cannot be "did any scroll event fire."** A browser
  clamp from a spacer shrink is movement for settling purposes but is not user
  intent; counting it let a tap mid-stream re-judge follow against a distance
  the stream itself had grown. The settle clock takes every scroll; the intent
  flag takes only non-echo ones.
- **Multi-touch.** Only the last finger off the glass starts settling
  (`e.touches.length === 0`), or a two-finger drag takes a write under the
  remaining finger. A finger landing during the settle window re-opens the same
  gesture — the adjustment has not been handed back yet.
- **Falsified: short-list settle deadlock.** An audit predicted infinite
  polling when `scrollHeight - clientHeight < 0`. Both engines report
  scrollHeight as at least clientHeight (checked across integer, fractional and
  bordered boxes), so the difference is never negative; the clamp is kept for
  invariant symmetry with `targetFor`, not as a fix.

### Correction (2026-08-25): the TanStack arm was under-configured

Hand-testing on a phone raised "is the comparison arm configured properly?",
and it was not. Two problems, both mine:

1. **`overscan` units.** Theirs counts ROWS, ours counts PIXELS. The arm ran
   at `overscan: 2` (~580px on the 290px-row corpus) against proto's 1600px of
   top overscan. Now parameterised (`?overscan=N`). It changes the FREQUENCY of
   correction jumps (2% of frames at 2, 0.8% at 12) but not their SIZE — 328px
   at every setting.
2. **`directDomUpdates` was off.** This is the maintainer's documented remedy
   for exactly this flicker ([TanStack/virtual#1227](https://github.com/TanStack/virtual/issues/1227)):
   an above-viewport re-measure writes `scrollTop` synchronously in the RO
   callback while the matching transform goes through React's async render, so
   the two land in different paints. Enabling it (`?ddu=1`) does not remove the
   jitter but pushes it back and shrinks it — over 25000px of slow up-scroll on
   the heavy corpus, first jitter moves from 3988px to 11390px travelled, the
   amplitude from 328px to 58px, and the count from 65 frames to 9. Layout
   stays correct either way (14 rows mounted, no gaps or overlaps).

So the up-scroll jumps measured against this arm were exaggerated by a
**default configuration**, and any comparison must run it at `?ddu=1` — but the
phenomenon does not disappear there. Note the corpus dependence too: the same
version measures 10px max on the standard `mix=real` profile (§ above) and
328px on `size=3000&mix=code`, because bigger rows carry bigger estimate errors.

Re-run at that length, the arms compare like this — same corpus, same engine
(Gecko), same 10px/frame command, 25000px of travel:

| arm | jitter frames | max | first jitter | travelled |
|---|---|---|---|---|
| TanStack, `overscan=12` + `ddu=1` (its best) | 9 | 58px | after 11390px | 15870px |
| proto, driven as a touch gesture | **0** | **0px** | — | **25000px** |

The input forms are not identical and cannot be: proto's write-gate is a touch
path, and TanStack's own touch deferral is iOS-gated, so on a desktop engine it
sees plain scroll writes either way. Read the row as "each arm on the input it
handles", not as one input through two engines.

**Methodology note — probe length is a correctness parameter.** The first
`?ddu=1` run measured a clean zero, and it was wrong: at 500 frames × 10px it
covered 5000px and stopped inside the window before the first jump, which a
hand test reached at ~21000px. A short probe does not report "no defect", it
reports "no defect yet". Same failure class as the corpus note above (a light
corpus converges the estimator too fast to expose the correction path) and as
the touch blind spot in § 7 — the axis was never driven far enough or in the
right form for the defect to appear.

The competitive settle-jump figure that had reached the astryx PR description
was collected in the same under-configured arm and has been removed from it.

### Upstream provenance (2026-08-25): the iOS gate is old, and Anthropic fixed this class in it before replacing it

Read from a clean checkout of TanStack/virtual at `e9874f03` (the tree published
as 3.17.3, which is what the harness arm loads), so every line below is
reproducible with `git log -S` in that repo.

TanStack does **not** lack gesture gating. `virtual-core` carries
`_iosTouching`, `_iosJustTouchEnded`, `_iosDeferredAdjustment` and
`_flushIosDeferredIfReady`: while `isIOSWebKit() && (isScrolling || _iosTouching
|| _iosJustTouchEnded)`, `applyScrollAdjustment` accumulates the delta instead
of writing it, and flushes once when settled. It also declines to flush inside
the rubber-band zone and drops a negative deferred delta at the end clamp
(#1233). This is careful work and any comparison that implies otherwise is
wrong.

Provenance of that machinery, and of the fixes around it:

| date | author | change |
|---|---|---|
| 2026-05-20 | Tanner Linsley | #1168 — virtual-core rewrite, **iOS Safari handling** introduced here |
| 2026-06-26 | Marius Schulz `<mds@anthropic.com>` | #1209 — sync `scrollOffset` in `applyScrollAdjustment` so end-anchored resize survives the browser clamp |
| 2026-06-30 | Marius Schulz `<mds@anthropic.com>` | #1212 — **"viewport drifts when above-viewport rows resize over multiple frames"** |
| 2026-07-12 | Bas Nijholt | #1220 — reset iOS gesture/deferral state on cleanup |

Two things follow. First, the iOS gate predates Anthropic's contributions, so
their engineers were working on a virtualizer that **already had** gesture
deferral. Second, #1212 is the same defect class as the third one in § 7 above
("content crawled under the finger": rows mounting above the viewport land their
real-minus-estimate delta in the geometry) — they fixed an instance of it,
upstream, in June. Anthropic then shipped a self-built virtualizer (Rocksteady:
spacer, document flow, `anchorKey` identity anchoring, `sizerExcess`) alongside
TanStack in the same bundle.

A team that fixed the bug upstream and replaced the library anyway is evidence
that the residue is not a bug. It is the one-lever property: with rows placed by
transform, every correction must be paid in scrollTop. `_iosDeferredAdjustment`
changes *when* it is paid, `directDomUpdates` changes *how fast*, #1209/#1212
change *how accurately* — none of them make the payment invisible. A leading
spacer is a second lever, and two levers can cancel; that requires owning the
layout, which a headless contract declines to do by definition.

One coverage note: the gate is behind `isIOSWebKit()` (UA regex plus the
iPadOS `MacIntel && maxTouchPoints > 0` case), so **Android touch does not take
the deferral path at all**. The gate here is on touch events themselves, with no
UA test — see § 7.

## 8. 2026-08-25: the prepend axis (load-older history), and a negative result

Every other axis here drives the SCROLL and asks whether content held still.
This one holds the scroll still and changes the DATA underneath it: land, climb
`?uppx=` into history, wait for measurement to go quiet, then insert `?prepend=`
rows at the FRONT and watch the anchored row for `?watch=` frames.

Two things had to be built before it could measure anything:

- **Stable row identity.** Every other arm in this harness keys by array index,
  which cannot express a prepend at all — inserting at the front renumbers every
  key, so the anchor names a different row and the arm measures React
  reconciliation instead of the virtualizer. The prepend arms carry `o*` /
  `p<batch>-*` ids and pass them to each library's own key hook
  (`keyExtractor`, `getItemKey`).
- **An address, not a node ref.** The probe finds the anchor each frame by the
  `data-pid` painted on the row. A recycling list may hand the same DOM node to
  a different row and an absolute arm may unmount and remount it; either would
  silently invalidate a held reference and turn a real defect into a quiet zero.

### The falsification arm

`?nokey=1` keys by index instead — the careless-integration case. It exists
because an axis that reads zero everywhere is not measuring anything, and this
is the arm that must read large. It does:

| proto | anchor | painted shift | growth above | scrollTop paid | unpaid |
|---|---|---|---|---|---|
| stable ids | held | 0px | 81–91k px | 81–91k px | **0–1px** |
| `?nokey=1` | **LOST** every batch | — | 93345px | **0px** | **93345px** |

The stable-id run pays the correction to the pixel, three batches running. The
control pays none of it, loses the anchor every time, and the anchor the probe
picks slides backwards through history each batch (`o1189` → `o889` → `o589`)
because the viewport is drifting through content that is no longer being held.
`unpaid` (growth above the viewport minus the scrollTop actually spent) is the
metric that survives the anchor being lost — the shift metric goes quiet exactly
when things are worst, because there is no row left to measure.

### The result: nobody fails this

Gecko, `mix=wild`, size 1200, 3 batches × 300 rows, anchored mid-history:

| arm | anchor | painted shift | unpaid |
|---|---|---|---|
| proto | held | 0px | 0–1px |
| proto, `?at=end` (prepend while pinned) | held | 0px | 0px |
| tanstack `overscan=12 ddu=1` | held | 0px | 0px |
| legend | held | 0px | 0px |

Anchored mid-history, this axis does not differentiate. **It does at the top
boundary, and not in proto's favour — see below.** Nothing here should reach a
PR description as a competitive claim; the differentiator remains touch (§ 7).

One asymmetry worth naming rather than averaging away: the arms do not pay
equally sized corrections. TanStack's growth is exactly 300 × 60px — the
estimate — because it never measures rows that are far above the window, so it
defers that work to the scroll-up path (§ 1) instead of paying it at insert
time. proto and legend absorb 81–106k px at insert. Each arm pays whatever
correction it creates, exactly; they simply create different ones.

### The top boundary: an open defect in proto, found by hand

The section above was written from a clean matrix and was wrong about coverage.
The scripted axis lands at the bottom, climbs `?uppx=` into history, and anchors
there — **it never goes to scrollTop 0.** Loading a page by hand at the very top
in the browser slips the view by about one row, permanently:

| condition (Chrome, `mix=wild`, 300 rows) | result |
|---|---|
| by hand at `scrollTop = 0`, 12 runs | **7 slipped**, 5 clean |
| when it slips | **1184–1252px**, always landing on `p0-299` instead of `o0` |
| does it recover | no — still there 5s later, scrollTop parked |
| same corpus at 30% down | 0 slip |

Then, with `?at=top` added to the scripted axis (2 batches, 2 runs each):

| arm | `?at=top` |
|---|---|
| proto | **anchor LOST both runs** |
| tanstack `overscan=12 ddu=1` | clean both runs |
| legend | **1070px shift** both runs (anchor kept) |

So the boundary is where TanStack's maturity shows, which is consistent with it
carrying a dedicated prepend fix
([#1176](https://github.com/TanStack/virtual/pull/1176)); LegendList has a
milder version of the same slip; proto's was the worst of the three.

### Cause, and the fix

Tracing the anchor across the batch showed the same shape on every slipping run
and none on the clean ones:

```
REANCHOR o0 → o0        off=0     st=0        (before the batch, harmless)
REANCHOR o0 → p0-299    off=-460  st=76147    ← target was ~127856
REANCHOR p0-299 → p0-299                      (held faithfully from here on)
```

The live-anchor refresh fired **in the middle of an unfinished correction** and
froze the intermediate position as the new anchor. After that the engine is not
malfunctioning at all — it holds `p0-299` exactly as asked, forever, which is
why the slip never recovers. Not a clamp, and not the estimator.

`userScrolledRef` is sticky and the user has to scroll to reach the top, so the
refresh was armed the whole time. The refresh's other guard, `converging`,
already means precisely "a correction is in flight, do not re-derive" — it was
simply never set for a data change. Loading a page of history is a correction
the size of the whole page, paid over several passes as those rows measure in;
that is a convergence by any reading.

The fix is one condition at the data-change site: **if the head key changed,
converge.** It reuses machinery that already exists and is already tested, and
it cannot wedge — every gesture path (wheel, touch, dead-anchor fallback)
clears `converging`, so a user who scrolls takes the viewport back at once.

| proto, `scrollTop = 0`, 300 rows, 12 runs | slipped |
|---|---|
| before | **7 / 12** |
| after | **0 / 12** |

Scripted `?at=top` agrees (anchor LOST on both runs before, held on both after),
the `?nokey=1` control still goes red, and the scroll-up axis is unchanged
(`paintedJumpFrames: 0`), so nothing else moved.

### The tail side does not need the mirror of this

`?edge=tail` appends the same batch instead. Rows arriving below the anchor move
nothing above it, so no correction is owed and there is nothing to converge
toward — and `{kind:'end'}` mode, which *does* owe a large correction as the tail
grows, is immune to this particular bug by construction: the live-anchor refresh
only runs for `kind === 'anchor'`. Measured rather than argued:

| proto, `?edge=tail` | shift |
|---|---|
| mid-history | 0px |
| pinned at end | 0px |
| at top | 0px |

**A metric that had to be withdrawn.** `unpaid` was defined as
`|Δ scrollHeight − Δ scrollTop|`, which silently assumes every pixel of growth
sits *above* the viewport. That holds only for a head batch with measurement
already settled. A tail append reads 88–93k px of "unpaid debt" that was never
owed, and so does a head batch whose rows are still measuring in below the fold
— it was misleading me within minutes of being written. It is now reported only
when the anchor was LOST, which is the one case the shift metric cannot cover,
and `n/a` otherwise.

**A hypothesis this falsified.** The first reading pointed at the estimator:
`?type=0` (no per-type average refinement) read a clean zero, so per-type
refinement looked like the driver. It is not — an estimate sweep
(`?est=200/400/800/1600/kind`) came back non-monotonic, with the *same* config
slipping on one run and clean on the next. At a 7-in-12 rate a single clean run
is worth nothing, and that first `?type=0` zero was luck. Intermittency has to
be measured as a rate before any single run is read as evidence — the same
mistake as a probe that stops before the defect (§ above) wearing different
clothes.

**Not covered:** prepend arriving *during* a touch gesture, where the write-gate
and `gestureAdj` would have to compose with the batch. That combination has
never been driven and is not claimed anywhere.

## 9. 2026-08-25: releasing the finger moved the page, and a metric that was measuring the HUD

Reported by hand on an iPhone: flick up to the top, and on release whatever you
were reading changes position. The device probe (`?blank=1`) showed 69 top-spacer
clamps in one flick, carrying up to 4571px.

### The cause

`paintOrigin()` — and therefore `anchorAt`, `targetFor` and `computeWindow` —
assume **painted position == model position + gestureAdj**. At the very top
there is nothing above to absorb a negative adjustment into, so the spacer stops
at 0 while `gestureAdj` keeps its full value. From that moment the machinery is
working in a coordinate system the screen does not share, and the flush restates
the frame from the broken map: the debt lands as a visible jump.

One fix was tried and falsified before this one — returning the unrealizable
excess to `gestureAdj`. It defines the adjustment in terms of `w.start` while
`computeWindow` derives `w.start` from the adjustment, and the loop that closes
holds a 436px gap open under the finger: blank frames went 0% → 41.3% while the
clamp count fell 13 → 2. Reverted.

### What Rocksteady does (measured, not read)

claude.ai's own virtualizer was instrumented directly on a live session — the
scroller's `scrollTop` setter wrapped, real touch events dispatched, one row
followed by identity:

| Rocksteady, mid-history | |
|---|---|
| scrollTop writes while the touch is held | **0** |
| writes at release | **1**, 16167 → 15058 (**−1109px**) |
| the followed row's painted top | −996 → **−995** (**1px**) |

The gate premise is the same as ours. The difference is the release: scrollTop
travels 1109px and the picture does not move, which is only possible if the
frame is restated from **what is painted** rather than from the model. Its
scroller also carries `overflow-anchor: none` and `contain: strict` — we already
set the former (`src/index.mjs`, on mount, restored on unmount).

Caveat: the same experiment at the top was inconclusive for them. Slamming
scrollTop to 0 in 20 frames with synthetic touch loses the followed row, and
their release wrote 0 → 9422. Synthetic touch has no momentum; that setup cannot
judge a boundary, theirs or ours.

### The fix: anchor from paint

`anchorAt` computes `viewportOffset` as `offsets[idx] - y`, which *is* the row's
painted top — while the map holds. `anchorFromPaint` reads the same quantity
from a rendered row's rect instead, so a clamped spacer cannot make the two
disagree. Same row, same semantics, one less assumption; the derived form stays
as the fallback when nothing is rendered.

| proto, synthetic touch drag, release | scrollTop moved | painted shift |
|---|---|---|
| ending at the top, before | 182px | **−182px** |
| ending at the top, after | 0px | **0px** |
| mid-history (start 300000), after | +435px | **1px** |
| mid-history (start 150000), after | −427px | **0px** |

The mid-history rows are the Rocksteady signature: the correction is paid in
full and is invisible. Regression: prepend axis 0px on every position with the
`?nokey=1` control still red, scroll-up painted jump 0%, fling blank 0%.

### The blank metric on § 1 was measuring the HUD

While regression-testing, the scroll-up axis reported `blankPct: 100` with
`probeMiss 899/0/0/0/0` — every frame missing at the top probe and never at the
other four, identically before and after the change. `#hud` is `position: fixed`
at `top: 8px; right: 20px` **without `pointer-events: none`**, and the probe
samples down the middle of the scroller; the wide scroll-up readout reaches past
that line, so `elementFromPoint` returned the overlay. Every blank figure this
axis has produced was that overlay, for every arm.

Fixed (`pointer-events: none`, plus the same middle-90%/two-miss rule as the
device probe). Re-measured, `mix=wild`, size 1200:

| arm | step=10 | step=200 | step=1000 |
|---|---|---|---|
| proto | 0% | 0% | **0%** |
| tanstack `overscan=12 ddu=1` | 0% | 0% | **0%** |
| legend | 0% | 0% | **96%** |
| virtuoso | 0% | 19.1% | 87.3% |
| virtuoso `ivb=300` | 0% | 17% | **99.8%** |

Two retractions follow. Any earlier blank percentage from this axis is void.
And `increaseViewportBy=300` does **not** fix virtuoso's fast-scroll blanking —
it is slightly worse with it at both speeds, so the previously recorded
"ivb=300 fixes it" is wrong.

Ours holding 0% at 1000px/frame on a desktop engine also says the iPhone blank
is not this: it is WebKit momentum against rows an order of magnitude heavier
than this corpus, which no desktop repro here has reproduced.

### OPEN: an over-large estimate blanks the viewport for most of a drag

Reproducible on desktop Chrome, `mix=wild`, synthetic touch drag at 400px/frame:

| | gappy frames | max gap | recovers |
|---|---|---|---|
| `?est=1200&size=1200` | **2634 / 3595** | 796px of an 800px viewport | 9 frames after release |
| `?est=1200&size=60` | 109 / 154 | 796px | 9 frames |
| `?est=120&size=1200` (under-estimate) | **0** | 0px | — |

Not confined to the top: `firstGapAtScrollTop` lands at 1053083. Not introduced
by § 9's fix either — identical before and after it.

**Cause.** The gesture-time absorb takes its held anchor from `anchorAt`, which
reads through `paintOrigin()` — so the adjustment is derived from the same map
the adjustment is shifting. Under a *systematic* estimate bias every pass
corrects against a frame the previous pass already moved, and `gestureAdj`
compounds: measured max 1.25M px at `est=1200` and 3.59M at `est=3000`, against
an 800px viewport. The sign follows the bias — over-estimate pushes the block
down (gap above), under-estimate pushes it up (clamped at the top, which is what
an iPhone reads as 38–69 spacer clamps carrying 4571px).

**Why it is not fixed.** Pointing the absorb at `anchorFromPaint` too — the
obvious fix, and it does close the gap completely (2634 → 0) — trades it for a
worse defect elsewhere. Four variants, all measured, all against the same two
probes:

| variant | over-estimate gap | fling blank | release shift |
|---|---|---|---|
| **shipped** (paint at flush only) | 2634/3595 | **0%** | **0px** |
| absorb from paint | **0** | 42.7% | −688px |
| ⌞ + cap on the payable range | 0 | **1.3%** | −501px |
| ⌞ + cap on magnitude (8 viewports) | 0 | 42.7% | −688px |
| ⌞ + magnitude cap with a paired write | 0 | 42.7% | −688px |

Two things in that table are worth keeping. The magnitude caps never fired —
their numbers are the no-cap control's exactly, and reading a regression into
them was an attribution error that a control run caught. The payable-range cap
DID fire and took the blanking down 97%, because it bounds `gestureAdj` where
the flush can still hand it back; it is the only one of the three that engaged.

**The rule underneath all of it:** painted position is
`spacer = offsets[start] + gestureAdj`, so *any* change to the adjustment
without a scrollTop write in the same task is itself a jump. That is why
returning the excess (§ 9) failed, and why truncating it fails the same way. The
payable-range cap converts one large jump into many small ones — hence 42.7% →
1.3% but not → 0.

**Unverified hypothesis for the residual −501px:** the gate stays `settling` for
`TOUCH_SETTLE_MS` after touchend and the absorb keeps running there, so a cap
firing inside that window would be recorded as a release shift (the probe samples
`before` on the last touch frame). Not measured — timestamping cap firings
against touchend would settle it.

So the payable-range cap is a starting point, not a dead end: reopening the
absorb-from-paint direction — which is probably where the real fix lives — should
start from it rather than from scratch.

## 10. What the probes got wrong, and why it was always the same thing

Across 2026-08-25 the instruments were wrong five times. Every one of them read
plausibly on a desktop engine, and four of the five were caught by hand-testing
on a phone rather than by anything in this suite. They are collected here
because the pattern is more portable than any of the fixes.

| # | The probe said | It was actually measuring |
|---|---|---|
| 1 | scroll-up axis: `blankPct` up to 100% for every arm, always | `#hud` — `position: fixed`, no `pointer-events: none`, and the probe samples down the middle of the scroller, which the wide read-out overlaps |
| 2 | device blank probe: 99.9% blank frames | an 8px spacer/row seam at the top edge, counted as a whole blank frame |
| 3 | prepend axis: anchor `LOST` | anchor never *picked* — one sample point at the viewport centre landed on a spacer, and "could not pick" was reported as "the view dropped it" |
| 4 | prepend axis: 88–93k px `unpaid` | growth BELOW the viewport (a tail append, or rows still measuring under the fold) against a metric that assumes all growth is above it |
| 5 | release probe: `picture 720px` after a flick | the fling itself — a fixed frame count measures whatever momentum is still doing, and 720px of picture movement is exactly what scrolling up 720px looks like |

Three earlier failures in the same family, from the same day, differ only in
which axis was left unexercised: a 5000px probe that stopped before a defect
starting at 11390px; a corpus light enough that the estimator converged before
the correction path ran; and touch input, which had never been driven at all
until a phone was picked up.

### The pattern

**A synthetic desktop harness is missing exactly the things that make a probe
wrong, so a wrong probe looks right there.** Momentum (5), real layout and real
row heights (2, 3, 4), real overlays (1) — each absent on the bench, each
decisive on the device. This is not a statement about phones: it is that the
environment where an instrument is validated has to contain the phenomena the
instrument is meant to distinguish, and a bench is chosen precisely for not
containing them.

Three working rules follow, and each of them was earned by breaking it first:

- **A zero is a claim about the probe before it is a claim about the code.**
  Every axis here now ships a falsification arm — `?nokey=1` reads 93345px of
  unpaid debt where the real arm reads 0 — because an axis that reads zero
  everywhere is not measuring anything, and there is no way to tell those apart
  from the zero itself.
- **Length, corpus and input form are correctness parameters, not settings.**
  Each was tuned for speed at some point, and each silently moved the answer.
- **On an intermittent defect, one clean run is worth nothing.** Rates, not
  runs: 7/12 before a fix and 0/12 after says something; one run of each says
  nothing, and a hypothesis was accepted and later falsified on exactly that
  basis (`?type=0` looked like the cause of the over-estimate gap because a
  single run came back clean at a 58% failure rate).

### And one attribution error worth keeping

A regression was blamed on the absorption cap for three iterations. A control
run — cap removed, everything else identical — produced byte-identical numbers,
which meant the cap had never fired and the regression belonged to a different
change made in the same sitting. Two variants had been designed and measured
against a cause that was not there. **Whenever a change and a regression appear
together, the control is the change removed, not the change explained.**

## 11. 2026-08-26: TanStack's own benchmark suite, and a repricing race it found

Measured against `@tanstack/virtual`'s in-repo Playwright suite at upstream `main`
`e9874f0` (2026-08-18) — 12 scenarios behind one `HarnessHandle` contract, run on
a `vite build` preview, arms `ballast-ro`, `ballast-sync`, `tanstack` (core
3.17.8 / react 3.14.10), `virtua` 0.49.3, `react-virtuoso` 4.18.12,
`react-window` 2.3.0. Adapter and setup: `bench/tanstack-suite/`.

That suite measures throughput and cost — mount, settle, `scrollToIndex` landing
accuracy, heap — and no painted artifacts, so it says nothing about the axes § 1
and § 2 lead with. It is worth running anyway for exactly the reason below: it
reaches list sizes this repo's harness never has.

### At 10k, the design's own size class: parity

Medians of 5, `virtua` omitted from the accuracy rows because the harness's
`[data-index]` lookup returns `-1` for it (a harness artifact, not a virtua
result); `react-window` lands 135–224px off on all four.

| axis | ballast ro | ballast sync | tanstack | virtuoso |
|---|---:|---:|---:|---:|
| `jump-to-middle-accuracy-dynamic-10k` | **0px** | **0px** | 0px | 0px |
| `jump-to-last-accuracy-dynamic-10k` | **0px** | **0px** | 0px | 0px |
| `jump-while-measuring-accuracy-dynamic-10k` | **0px** | **0px** | 0px | 0px |
| `jump-wide-variance-accuracy-10k` | **0px** | **0px** | 0px | 0px |
| `jump-to-end-dynamic-10k` settle | 90ms | 92ms | 85ms | 154ms |
| `mount-dynamic-10k` settle | 126ms | 123ms | 124ms | 185ms |

Zero on all twenty accuracy runs per gear, no variance. The settle deltas are
frame quantisation (the harness's stability rule is 5 or 8 unchanged frames), not
a gap. `jump-to-last` maps to `scrollToDistanceFromBottomPx(0)` — the suite only
ever uses `align: 'end'` at the last index, which is ballast's native frame.

### At 100k: `anchorToKey` lands wrong 25–50% of the time, and does not self-heal

Pushed past the suite's 10k ceiling with two added scenarios, `est=30`:

| | landing error, per run |
|---|---|
| ballast-ro | `0.3, 350652, 0.3, 0.3, 0.3, 697962, 697962, 697962, 0.3, 0.3` |
| ballast-sync | `0.3, 0.3, 0.3, 0.3, 108558, 295268, 26783, 0.3, 0.3, 0.3` |
| tanstack | `0,0,0,0,0,0,0,0,0,0` |

State captured at a miss, every time:

```
mode       = {kind:'anchor', key:'50000', viewportOffset:0}   <- declaration intact
converging = false                                            <- believes it landed
scrollTop  = 1,972,104
offsetOf('50000') = 2,199,443                                 <- gap == the error
```

Not an adapter artifact: dropping the adapter's start-at-top declaration
(`?noTopAnchor=1`) made it *worse*, 4/8 vs 2/8. Not a size threshold either —
0/12 at 30k and 0/12 at 50k, but in those runs `eff` never left the estimate at
all. Setting `estimatedItemSize` to the value `eff` converges to (44) on the same
100k list: **0/12**. So the trigger is the repricing, and list size only sets the
magnitude — (reprice delta) × (rows above the anchor).

### Cause: a clock reading evaluated inside an O(N) loop

Traced with a pass-level ring buffer. Two consecutive passes:

```
pass      st=1501481  conv=false  geoIn=true   eff=30
reprice   30 -> 43.98
restore?  target=1886189  off50k=1886189  total=4085397   <- half-repriced geometry
wrote     1886189
pass      st=1886189  conv=false  geoIn=FALSE  eff=43.98
restore?  target=2199443  off50k=2199443  total=4398651  geo=FALSE   <- write gated off
```

2199443 − 1886189 = 313,254, the reported error exactly. The published
`total=4,085,397` is neither the old 3,001,972 nor the settled 4,398,651:
(4085397−3001972)/(4398651−3001972) = 77.6% of rows took the new price, i.e. the
change landed around row 22,400 of 100,000 — **part way through the loop**.

The repricing decision lived inside `effectiveAvg`, called per row from
`recompute()`, and one of its gates is `performance.now() - lastUserEventT > 250`.
`lastUserEventT` starts at 0, so on an untouched page that gate opens exactly once,
at t+250ms. A recompute loop long enough to be *running* at that instant prices the
head of the list at the old number and the tail at the new one. The pass then
restored scrollTop to that half-repriced anchor offset, consumed `geoChanged`, and
the next pass — holding the consistent geometry and the correct target — found the
flag clear and never wrote.

Everything follows: the odds scale with loop length (10k, 15/15 clean; 100k,
25–50%), and the gate re-crosses 250ms after every gesture, so this is a
size-amplified race rather than a large-list-only bug.

### What the other libraries do here (source-read, versions as above)

| | reprices? | statistic | frequency | position correction |
|---|---|---|---|---|
| TanStack | no | — | never | `itemSizeCache.get(key) ?? estimateSize(index)`; no `avg`/`mean` anywhere in core |
| react-virtuoso | no | — | never | scalar `defaultItemHeight`; `itemSize` is a *measuring* fn `(el, field) => number` |
| react-window v2 | nominally | mean | live | `getAverageRowHeight()` is near-dead: `getRowHeight(i)` writes `defaultRowHeight` into the cache on first touch, citing its issue #863, "avoid scroll jumps" |
| virtua | yes | **median** | **once** (`shouldAutoEstimateItemSize` latched off; only after `_totalMeasuredSize > viewportSize`; disabled entirely if `itemSize` is passed) | `$estimateDefaultSize(startIndex)` **returns** the px displacement of unmeasured rows above the viewport; caller feeds it straight to `applyJump()` |
| LegendList | yes | mean, per `itemType` | live | `getItemSize` reads the live average only `!scrollingTo`; during a programmatic scroll it prices from `scrollingTo.averageSizeSnapshot` |
| ballast (before) | yes | mean + shrinkage prior, per bucket | live | none — relied on a later pass re-deriving from the anchor |

The invariant all four hold, by different means: **a price move and the position
correction it owes are one step.** ballast was the only one that let them separate.

### The fix

Two parts, `src/index.mjs`:

1. **`repriceBuckets()`** — the repricing decision is taken once per pass, before
   `recompute()`, from a single `performance.now()` reading, global bucket first
   then each type bucket. `effectiveAvg` becomes a pure read. A pass now always
   prices every row from one set of numbers. This is the part that fixes the
   traced defect; it also removes a `performance.now()` + shrinkage computation
   from the per-row path.
2. **`priceFreeze`** — LegendList's mechanism. Prices are frozen while a declared
   target is in flight (set in `declare()` and on head-change; cleared by
   wheel/touchstart, or the finger would wedge them shut), and the release gets a
   `requestAnimationFrame` pass of its own so the correction it owes is derived
   from a settled geometry rather than appended to the pass that just landed.

Worth stating plainly: the LegendList freeze **alone would not have fixed this**.
The trace shows the reprice landing after `converging` had already gone false, so
a snapshot scoped to the flight would have released before the damage. (1) is the
fix; (2) is the belt, and the reason the release is now deterministic.

### Verification

| | before | after |
|---|---|---|
| 100k `jump-to-middle`, sync | 5/20 miss, 5k–698k px | **0/12 + 0/5, all 0–0.3px** |
| 100k `jump-to-middle`, ro | 4/10 miss | **0/12 + 0/6** |
| all four 10k accuracy axes, both gears | 0px | 0px |
| `eff` at settle | 43.98 | 43.98 — repricing still happens, the position tracks it |

Own suite, real Chrome: scrollup 0%/0% (sync/ro), scrollup `est=40` 0%/0%,
fast-scroll 60px/f 0%, stream 50 0%·0px (ro) and 0% (sync). `stream rate=29 ro`
first read 0.2%/114px, which is inside this axis's own noise — same-machine A/B,
three runs each: before 0.2%/41px, 0.2%/40px, 0.1%/20px; after 0%/0px,
0.2%/21px, 0%/0px.

### OPEN: this repo's harness cannot arm the probe

`bench/repriceprobe.mjs` encodes the invariant (`scrollTop` must equal
`offsetOf(anchorKey)` once settled) and can drive the harness, but on the current
corpora it reports `skip` on every run: they settle the averages during mount, so
by the time any declaration can be made there is nothing left to reprice. Tried
and failed to arm it — `mix=real` and `mix=wild`, 50k rows, declaring at 400ms /
900ms / 5s after mount, and re-arming the quiet gate with a synthetic wheel event
and sweeping the delay across 238–256ms. The averages were identical in every
case. 100k is not available either: at ~270px/row the corpus needs 26.8M px and
Chrome clamps `scrollHeight` at 2^24 = 16,777,216.

The reproduction that does arm needs the average still *pinned* at the caller's
estimate when the jump starts, which the TanStack app produces because it jumps
within ~250ms of load, before the quiet gate has ever opened. That probe lives in
`bench/tanstack-suite/repriceprobe.mjs` and is validated in both directions
(2/10 misses on the pre-fix source, 0/6 after). A raw-CDP port against a real
headed Chrome was written and discarded: the page loads too slowly, `eff` had
already settled at 53.7 before the jump on both arms, and the probe passed
against the known-broken source — recorded here because a probe that cannot fail
is worse than no probe.

So the harness owes a fast-mounting, uniform-row corpus before this class is
guarded in-repo.

## 12. 2026-09-01: the competitors under a finger — WebKit touch, three arms

Every gesture number for LegendList and TanStack above came from Blink CDP
drags, and the README's "0% on every gesture metric" for LegendList was a Blink
statement. [legend-list#488](https://github.com/LegendApp/legend-list/issues/488)
(2026-07-06, open, no comments) reports the opposite on iOS Safari: "stiff/janky
scroll during touch drag … fights the finger mid-gesture" — the § 7 class. The
Blink zero was consistent with that rather than contradicting it: during an
active CDP drag Blink stomps JS `scrollTop` writes, so a viewport-space metric
reads clean whether or not the library wrote. What had never been counted was
**the writes themselves**.

### Instrument: `?touch=1`

Arm-agnostic and row-identity-free (so it reads the same on every arm, unlike
`?release=1`, which needs `data-pkey`). Shadows the `scrollTop` setter plus
`scrollTo`/`scrollBy`, and per gesture — `touchstart` through the first ~300ms of
scroll silence after `touchend` — reports: library `scrollTop` writes while the
finger is down (count, px, top stack frame), sampled frames where the scroll
moved in the same direction as the finger's own movement (i.e. *against* the
hand; finger down the screen must take `scrollTop` down), finger travel vs
scroll travel, and the fling after release (travel, duration, writes into it).
A scripted driver flags its own writes with `window.__touchDriver` so only the
library's are counted. Two counters agreed on every desktop arm below: the
driver's "position deviated from the command" and the probe's "JS wrote
`scrollTop`" gave the same count and the same px.

### Desktop WebKit — the write count

Safari Technology Preview (Version/27.0, WebKit 605.1.15) over `safaridriver
--mcp`, viewport 430×900, `mix=real size=1000 scenario=rest`. Driver: a
`scrollTop` walk of −8px/frame × 600 frames (4800px commanded) from the bottom
into cold history, framed by synthetic `touchstart`/`touchmove`/`touchend`.
Desktop Safari has no `TouchEvent` constructor, so these are plain `Event`s of
the touch type names — enough to arm a gate that listens by name (ballast's
did), irrelevant to a library that has no touch path (LegendList).

| arm | library writes during the gesture | px written | max single write | travelled of 4800 | writer |
|---|---|---|---|---|---|
| ballast ro | **0** | 0 | 0 | **4800** (100%) | — (one `flushGesture` write of 1115px *after* `touchend`; `scrollHeight` −1115 in the same step) |
| LegendList web 3.3.7 | 43 | 2913 | 259 | 4895 (102%) | `scrollAdjustBy` ×43 |
| TanStack react-virtual 3.14.10 | 37 | 2010 | 307 | 2790 (58%) | `scrollWithAdjustments` ×37 |

Two different shapes. LegendList's writes are bidirectional (−94, −47 ×many,
+81, +105) and net to ~0 over the walk: mvcp anchoring keeping the *content*
stable as rows above measure in — correct in the position sense, and exactly the
churn class of § 2, because every one of them is a `scrollTop` write under a
gesture. TanStack's are all positive (+129, +153 …): with the desktop UA its
iOS-gated deferral is inactive, so every above-viewport compensation lands live
and opposes the upward walk — 2010px of the 4800 commanded never arrive. Read
that row as § 7 does, "each arm on the input it handles"; the iOS behaviour is in
the next table.

### iOS Simulator — what the engine does with the writes

iPhone 16 Pro, iOS 26.5, Safari, same URL parameters. Real touch through the
simulator's input layer: slow drags as an 11-point `touch_path` (60pt steps at
350ms, ~170pt/s, finger down the screen = scroll-up into history), flick as a
500pt swipe in 0.12s. `touch_path` releases without velocity, so every slow
drag's fling reads 0 on every arm; momentum comes only from the swipe.

| arm | slow drag: writes while down | slow drag: frames against the finger | flick: fling after release | write at release |
|---|---|---|---|---|
| ballast ro | **0, 0, 0** | **0, 0, 0** | **1632px in 3029ms** | 1 `flushGesture` (213px; picture ±1px, § 9) |
| LegendList web | 0 (still inside measured rows), 4, 3 | 0, **1 (410px)**, 1 (34px) | **168px, dead in <300ms** (7 writes, 508px, during the 10 down-frames) | — |
| TanStack | 0, 0 (iOS gate active) | 0, 0 | 1045px in 3000ms | 1 ledger replay, 370px (`scrollWithAdjustments`) |

So the desktop count becomes, on the engine that cares: for LegendList, one
frame per slow drag where the content moves *against* the finger — 410px in the
worst of three — and a flick whose momentum is gone at 168px, against 1632px on
the write-gated arm on the same device. This is #488, quantified, and the
mechanism is the one § 7 named: nothing in `@legendapp/list`'s web path gates
writes on touch. TanStack's iOS deferral does gate them (0 writes under the
finger, momentum intact), and pays at release with the ledger replay — 370px
here, 3,675px on the real iPhone in § 7.

### Two observations that are not results

1. **A lost `touchend`.** On the first TanStack flick, run after two slow drags
   deeper into history, neither the probe nor TanStack saw the release: the
   probe's gesture stayed "down" for 4737 frames until the next tap's `touchend`
   closed it, and TanStack's deferred ledger — 0 writes the whole time — was then
   replayed as a single **1,932px** write at *that* `touchend`. Touch events are
   dispatched to the `touchstart` target; a virtualizer that unmounts that row
   mid-fling leaves the event on a detached node, where it reaches neither
   `window` nor the scroll element's own listeners. LegendList recycles its rows
   (`recycleItems`, nodes persist) and its `touchend` arrived every time. This
   fits, and would make the iPhone's 3,675px a second-gesture replay rather than
   a first-gesture one — but it happened once and a fresh flick from the bottom
   did not reproduce it. The probe now infers an end (no `touchmove` for 400ms
   and 18 still frames) and prints whether the `touchstart` target is still in
   the DOM, so the next occurrence will say.
2. **`scrollTop`, not paint.** This probe counts writes and scroll movement; the
   picture is § 9's business (`?release=1`, `data-pkey` rows only). ballast's
   213px release write and TanStack's 370px replay are both single post-gesture
   writes in this table; that ballast's moves the picture ±1px and TanStack's
   moves it by the full amount is the § 7/§ 9 measurement, not this one.

Methodology debts, for the record: the first slow drag on the TanStack arm was
lost to page load (the gesture landed before the probe armed) and is not in the
table; n = 3 slow drags and 1 flick per arm, one device; and `?release=1` was
not run on the LegendList arm because its rows carry no `data-pkey`, so its
painted release shift remains unmeasured.
