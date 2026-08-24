# Benchmark results & methodology

All numbers: same machine, real Chrome 151 (headed, `--remote-debugging-port`), same corpus per comparison. Dual sampling everywhere: rAF = pre-paint upper bound, rAF+setTimeout(0) = painted truth (what the eye can see). Library versions: @legendapp/list 3.3.7, @tanstack/react-virtual 3.14.x, virtua 0.50.4, @virtuoso.dev/message-list 1.17.1 (localhost evaluation per its EULA).

## 1. Scripted axes

### Scroll-up into cold (unmeasured) history
`?scenario=scrollup` — land at bottom, scroll up at constant px/frame through never-measured rows; metric = painted frames where an on-screen anchor row deviates >4px from the commanded step, plus a 5-probe viewport fill check.

| arm (mix=real, 1000 rows, step=10) | painted jump | max | blank strip |
|---|---|---|---|
| ballast sync | 0% | 0 | 0% |
| ballast ro | 20.9% | 175px | 0% |
| LegendList web | 0.1% | 100px (1 frame) | 0% |
| TanStack (est=60 default) | 14.4% | 245px | — |
| TanStack (est=40) | 20.8% | 265px | — |
| TanStack (est=kind heuristic) | ~23% freq, half magnitude | 155px | — |
| Virtuoso ML | 0% | 0 | 67% @step60 (default overscan 0; increaseViewportBy=300 fixes) |

Estimate accuracy reduces jump *magnitude*, not *frequency* — compensation events are inherent to estimate-then-measure; only pipeline timing (sync) or re-derive anchoring eliminates them.

### Streaming follow-at-bottom
`?scenario=stream` — astryx Markdown rows, token chunks appended at 20–50 upd/s for 30s; metric = painted frames with pinErr > 4px.

| arm | rate=35 (29 upd/s) | rate=20 (50 upd/s) |
|---|---|---|
| ballast sync | 0% (0 pre-paint too) | 0% |
| ballast ro | 0.8% / max 110px | 0.6% |
| LegendList web | 1.5% | 1.6–3.3% |
| TanStack | 0.5% | — |
| Virtuoso ML | 31.5% (monotonic lag) | **jump-to-top bug**: viewport thrown to transcript top, unrecovered; 2/2 runs @40 upd/s, mechanism = compensation `scrollTop += a` with a ≈ −(tall streaming item height) |
| virtua + naive userland follow | freezes (stick self-disengages on its own scrollToIndex landings) | — |
| virtua + intent-based follow | 0.9% | 0.5% |
| virtua official pin pattern | pinned prompt row: 0% movement (after excluding smooth-scroll animation windows) | 0% |

### Pipeline ablation (the key experiment)
Same 300 lines, one switch: sync (forced-layout measurement in commit) vs ro (ResizeObserver only). Scroll-up painted jumps went 0% → 20.9% (≈ TanStack's numbers); streaming went 0% → 0.6–0.8% (still first-tier). Conclusion: the scroll-up axis advantage is bought by measurement timing; the streaming advantage is structural (same-task measure+restore has no observable window). RO-mode painted artifacts on scroll-up trace to ResizeObserver loop-depth semantics: corrections made inside an RO callback (spacer heights + scrollTop) defer the resulting observations to the next frame.

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
| ballast ro | 2.1% | 1,513px | 10,029px |
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

## 3. Corpora

- `mix=real` — calibrated from 182 real agent sessions: 70% folded tool groups, 10% user prompts (~420ch), 20% assistant prose (~490ch, 1/16 code fence, 1/10 table).
- `mix=wild` — extreme variance: 40% tiny (single tool call), 30% medium, 20% large, 10% huge (multi-section + fences + table, 2–4k px). Designed to maximize per-row estimate error.

## 4. Ecosystem measurement notes

- LegendList web ships **no real-browser tests** (jsdom + mocked geometry only) — the artifact classes measured here are structurally invisible to its CI. Its quality is design-carried, and holds: 0% on every gesture metric.
- All four web libraries (TanStack, LegendList, virtua, react-virtuoso) are RO-timing-class; none measures synchronously in the commit. virtuoso is a hybrid (container-RO trigger + offsetHeight batch harvest, with an optional rAF deferral path).
- virtua ships no built-in follow/landing (position-stability primitives only); its official chat pattern is prompt-pinning with a viewport-height blank reserve, and its e2e suite (Playwright, real WebKit, touch/momentum emulation, per-browser tolerances) is the strongest testing reference in the space.
