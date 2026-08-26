// The VALIDATED reproduction of the repricing race (docs/RESULTS.md § 11).
//
// Preconditions the race needs, and why they live HERE and not in bench/:
//   1. a recompute loop long enough to straddle the repricing gate's clock
//      reading  -> 100k rows;
//   2. the global average still PINNED at the caller's estimate when the jump
//      starts, with the real mean far above it -> the gate must not have opened
//      yet, i.e. the jump must happen within ~250ms of load.
// (2) is what this repo's own harness cannot produce: its corpora settle the
// averages during mount, so bench/repriceprobe.mjs reports `skip` there. The
// TanStack benchmarks app jumps as soon as the page reports ready, under a
// headless load fast enough to beat the gate — so it arms every time.
//
// Unlike the rest of bench/, this speaks Playwright rather than raw CDP: it
// drives the TanStack app, which already ships Playwright, and a real headed
// Chrome loads too slowly to satisfy (2) — measured: eff already settled at
// 53.7 before the jump on BOTH arms, race never armed.
//
// setup: see README.md in this directory.
// usage: node bench/tanstack-suite/repriceprobe.mjs [runs] [lib] [scenario]
import { chromium } from '@playwright/test'

const RUNS = Number(process.argv[2] || 12)
const LIB = process.argv[3] || 'ballast-ro'
const SCENARIO = process.argv[4] || 'jump-to-middle-accuracy-dynamic-100k'
const BASE = process.env.BENCH_URL || 'http://localhost:4173'

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 800, height: 700 } })).newPage()
let misses = 0
for (let run = 1; run <= RUNS; run++) {
  await page.goto(`${BASE}/?lib=${LIB}&scenario=${SCENARIO}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.bench?.ready?.(), null, { timeout: 20000 })
  const r = await page.evaluate(async (id) => {
    const nf = () => new Promise((res) => requestAnimationFrame(res))
    const h = window.__bench.handle, el = h.getScrollContainer()
    const s = window.bench.scenarios.find((x) => x.id === id)
    const target = Math.floor(s.count / 2), key = String(target)
    await nf()
    h.scrollToIndex(target, { align: 'start' })
    let stable = 0, last = el.scrollTop, t0 = performance.now()
    while (stable < 8 && performance.now() - t0 < 8000) {
      await nf(); const c = el.scrollTop
      if (Math.abs(c - last) < 0.5) stable++; else stable = 0
      last = c
    }
    // HOLD. The reprice this probe exists for lands AFTER the settle, and the
    // resulting miss never self-heals — a probe that reads at settle sees 0px.
    await new Promise((res) => setTimeout(res, 800))
    const d = window.__ballastApi.current.__debug()
    const row = el.querySelector(`[data-index="${target}"]`)
    return {
      paintErrPx: row ? Math.round(Math.abs(row.getBoundingClientRect().top - el.getBoundingClientRect().top)) : -1,
      // The invariant: the geometry's own offset for the anchored row and the
      // scroll position must agree. Anything else is a landing the machinery
      // believes it made and did not.
      geomGapPx: Math.round(Math.abs(d.st - d.offsetOf(key))),
      st: Math.round(d.st), offsetOf: Math.round(d.offsetOf(key)),
      converging: d.converging, mode: d.mode.kind + ':' + (d.mode.key ?? d.mode.distance),
      eff: Object.values(d.buckets)[0]?.eff,
    }
  }, SCENARIO)
  const bad = !(r.paintErrPx >= 0 && r.paintErrPx <= 2 && r.geomGapPx <= 2)
  if (bad) misses++
  console.log(`run ${String(run).padStart(2)} ${bad ? 'MISS' : 'ok  '} paintErr=${String(r.paintErrPx).padStart(8)}px geomGap=${String(r.geomGapPx).padStart(8)}px st=${r.st} offsetOf=${r.offsetOf} conv=${r.converging} mode=${r.mode} eff=${r.eff?.toFixed?.(1)}`)
}
await browser.close()
console.log(`\n${misses}/${RUNS} misses  (${LIB} ${SCENARIO})`)
process.exit(misses ? 1 : 0)
