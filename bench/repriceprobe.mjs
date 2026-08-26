// Repricing race probe: does a running-average move LOSE the position it owes?
//
// The averages price every unmeasured row. When one moves, every offset above
// the anchor moves with it, and the pass that reprices owes a scrollTop
// correction for the whole delta. This probe declares anchorToKey on a mid-list
// row, lets it land, then holds while the averages settle — and reports the gap
// between where the geometry says the anchored row is (offsetOf) and where
// scrollTop actually sits. They must agree; anything else is a silent landing
// miss that does not self-heal.
//
// The race needs a recompute loop long enough to straddle the repricing gate's
// clock reading, so the list has to be big and the estimate has to be wrong:
// size=100000&est=30 against a corpus averaging far more. It does NOT reproduce
// at chat sizes — the loop is too short to straddle anything (see § 11).
//
// usage: node bench/repriceprobe.mjs [runs] [measure] [size] [est] [mix]
//   node bench/repriceprobe.mjs 12 sync
const RUNS = Number(process.argv[2] || 10)
// Defaults to the SHIPPING gear. measureMode only decides whether a row that
// already has a size is re-read (sync = forced layout every commit, ro = RO
// callbacks plus a one-shot read at first mount); the repricing path this probe
// guards is shared by both, and reproduced on both (5/20 sync, 4/10 ro).
const MEASURE = process.argv[3] || 'ro'
const SIZE = Number(process.argv[4] || 100000)
const EST = process.argv[5] || '30'
const MIX = process.argv[6] || 'wild'
// ms to let the harness's own mount landing retire before declaring. Small
// values race it (the probe reports DROPPED when the harness wins) but are the
// only way to declare while the averages are still moving.
const SETTLE = Number(process.argv[7] ?? 5000)
// Where the repricing gate's crossing falls inside the jump's passes is the
// whole variable — sweep it rather than betting on one value.
const DELAYS = [244, 248, 252, 240, 256, 246, 250, 242, 254, 238]
const CDP = 'http://127.0.0.1:9222'
const URL = `http://localhost:5490/harness/index.html?list=proto&scenario=rest&size=${SIZE}&est=${EST}&mix=${MIX}&measure=${MEASURE}`

let misses = 0, skipped = 0
for (let run = 1; run <= RUNS; run++) {
  // Fresh tab per run: the gate this races is `now - lastUserEventT > 250`,
  // and lastUserEventT starts at 0 — so the crossing happens once per page.
  const DELAY = DELAYS[(run - 1) % DELAYS.length]
  const mk = await fetch(CDP + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' }).then(r => r.json())
  await fetch(CDP + `/json/activate/${mk.id}`)
  const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
  let id = 0; const pending = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
  const call = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  const ev = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value
  await call('Runtime.enable')

  const out = await ev(`(async () => {
    const nf = () => new Promise(r => requestAnimationFrame(r))
    const t0 = performance.now()
    while (!window.__api?.current && performance.now() - t0 < 30000) await nf()
    const el = (() => { let b = null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy === 'auto' || oy === 'scroll') && (!b || d.scrollHeight > b.scrollHeight)) b = d } } return b })()
    if (!el) return JSON.stringify({ err: 'no scroller' })
    // The harness lands the list itself on mount. Let that declaration retire
    // first — declaring over it just makes this probe measure the wrong pass.
    await new Promise(r => setTimeout(r, ${SETTLE}))
    const key = String(Math.floor(${SIZE} / 2))
    const a = window.__api.current
    const effOf = () => a.__debug().buckets[String.fromCharCode(0) + 'global']?.eff ?? 0
    // ARM THE GATE. Repricing is gated on a 250ms scroll-quiet window, and
    // lastUserEventT starts at 0 — so on a page nobody touches the gate opens
    // exactly once, at t+250ms, which at these list sizes is still inside
    // mount. A real wheel event re-arms it, and then the crossing can be
    // placed deliberately: land it inside the O(N) passes the declared jump
    // runs, which is the straddle the defect needs. DELAY sweeps across runs
    // because where the crossing falls inside a pass is what varies.
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, ${DELAY}))
    const effBefore = effOf()
    a.anchorToKey(key, 0)
    // settle: 8 frames without movement, same rule the landing axes use
    let stable = 0, last = el.scrollTop, t1 = performance.now()
    while (stable < 8 && performance.now() - t1 < 8000) { await nf(); const c = el.scrollTop; if (Math.abs(c - last) < 0.5) stable++; else stable = 0; last = c }
    // ...then HOLD. A reprice that lands after the settle is exactly the case
    // this probe exists for, and it never self-heals.
    await new Promise(r => setTimeout(r, 800))
    const d = a.__debug()
    const row = document.querySelector('[data-pkey="' + key + '"]')
    const paint = row ? Math.abs(row.getBoundingClientRect().top - el.getBoundingClientRect().top) : -1
    return JSON.stringify({
      key, paintErrPx: Math.round(paint), effBefore: Math.round(effBefore), armed: Math.abs(effOf() - effBefore) > 0.5,
      geomGapPx: Math.round(Math.abs(d.st - d.offsetOf(key))),
      st: Math.round(d.st), offsetOf: Math.round(d.offsetOf(key)), total: Math.round(d.total),
      converging: d.converging, mode: d.mode.kind + ':' + (d.mode.key ?? d.mode.distance),
      held: d.mode.kind === 'anchor' && d.mode.key === key,
      eff: Object.fromEntries(Object.entries(d.buckets).map(([k, v]) => [k === '\\u0000global' ? 'global' : k, v.eff])),
    })
  })()`)
  await fetch(CDP + `/json/close/${mk.id}`); ws.close()

  const r = JSON.parse(out || '{"err":"eval failed"}')
  // `held` false means the declaration was dropped entirely (dead-anchor
  // fallback) — a different defect, reported rather than scored as a miss.
  // A run whose averages never moved did not exercise anything — say so
  // rather than banking it as a pass.
  const bad = r.armed === false ? 'SKIP' : r.held === false ? 'DROPPED' : !(r.paintErrPx >= 0 && r.paintErrPx <= 2 && r.geomGapPx <= 2)
  if (bad === true || bad === 'DROPPED') misses++
  if (bad === 'SKIP') skipped++
  console.log(`run ${String(run).padStart(2)} d=${DELAY} ${bad === 'SKIP' ? 'skip' : bad === 'DROPPED' ? 'DROP' : bad ? 'MISS' : 'ok  '} paintErr=${String(r.paintErrPx).padStart(9)}px geomGap=${String(r.geomGapPx).padStart(9)}px st=${r.st} offsetOf=${r.offsetOf} conv=${r.converging} mode=${r.mode} eff=${JSON.stringify(r.eff)}`)
}
console.log(`\n${misses}/${RUNS} misses, ${skipped} skipped (averages never moved)  (measure=${MEASURE} size=${SIZE} est=${EST} mix=${MIX})`)
process.exit(misses ? 1 : 0)
