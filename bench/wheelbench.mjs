// Real-input scroll benchmark: replays an identical synthetic trackpad trace
// (flicks with decaying deltas + pauses + slow reading scroll) via CDP
// Input.dispatchMouseEvent — the events go through Chromium's compositor and
// its wheel smooth-scroll animation, unlike scrollTop writes.
// Per painted frame we track an anchor row: docJump = movement of the row in
// DOCUMENT space (0 for a perfect virtualizer); reversal = the row moving
// AGAINST the input direction in viewport space (the perceptually worst kind).
const url = process.argv[2]
const CDP = 'http://127.0.0.1:' + (process.env.PORT || '9222')
const mk = await fetch(CDP + '/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
await fetch(CDP + `/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result?.exceptionDetails) console.error('ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 200)); return r.result?.result?.value }
await call('Runtime.enable')
await new Promise(r => setTimeout(r, 4000)) // land at bottom

// page-side sampler
await ev(`(() => {
  const el = (() => { let best=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!best || d.scrollHeight > best.scrollHeight)) best = d } } return best })()
  window.__s = { frames: 0, revFrames: 0, maxRevPx: 0, spikeFrames: 0, maxSpikePx: 0, scrolled: 0, done: false }
  let anchor = null, prevTop = null, prevDView = null
  const startScroll = el.scrollTop
  const pick = () => {
    const cr = el.getBoundingClientRect()
    const n = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2)
    anchor = n && n.closest ? n.closest('.msg, .cvrow') : null
    prevTop = anchor ? anchor.getBoundingClientRect().top : null
    prevDView = null
  }
  pick()
  const loop = () => {
    if (window.__s.done) return
    requestAnimationFrame(loop)
    setTimeout(() => {
      if (window.__s.done) return
      window.__s.scrolled = Math.round(startScroll - el.scrollTop)
      if (!anchor || !anchor.isConnected) { pick(); return }
      const cr = el.getBoundingClientRect()
      const top = anchor.getBoundingClientRect().top
      if (top > cr.bottom - 40 || top < cr.top - 4000) { pick(); return }
      if (prevTop !== null) {
        const dView = top - prevTop
        window.__s.frames++
        // The whole trace scrolls UP, so visible content may only move DOWN
        // (dView >= 0) or hold. dView < -3 = content lurched backward — the
        // perceptually worst artifact. Jerk spikes = velocity discontinuity
        // beyond anything the wheel animation produces.
        if (dView < -3) {
          window.__s.revFrames++
          window.__s.maxRevPx = Math.max(window.__s.maxRevPx, Math.round(-dView))
        }
        if (prevDView !== null && Math.abs(dView - prevDView) > 120) {
          window.__s.spikeFrames++
          window.__s.maxSpikePx = Math.max(window.__s.maxSpikePx, Math.round(Math.abs(dView - prevDView)))
        }
        prevDView = dView
      }
      prevTop = top
    }, 0)
  }
  requestAnimationFrame(loop)
})()`)

// Two separate traces (argv[3]): 'slow' = one long slow drag straight into
// COLD (never-measured) territory — the highest-perception scenario; 'flick'
// = 8 fast flings. Mixing them lets the flicks pre-measure the region and
// masks slow-phase artifacts (ordering artifact, caught by hand-testing).
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const gesture = (dist, speed) => call('Input.synthesizeScrollGesture', {
  x: 700, y: 450, xDistance: 0, yDistance: dist, speed,
  gestureSourceType: 'touch', preventFling: false,
})
const traceMode = process.argv[3] || 'flick'
if (traceMode === 'slow') {
  await gesture(3200, 380)
} else if (traceMode === 'wheel-slow') {
  // precise-delta approximation: discrete wheel pulses with smooth scrolling
  // DISABLED at the browser level (launch flag) — each pulse applies
  // instantly, and corrections land visibly in the gaps between pulses.
  const wheel = (dy) => call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: dy })
  for (let i = 0; i < 110; i++) { await wheel(-30); await sleep(50) }
} else {
  for (let f = 0; f < 8; f++) {
    await gesture(900, 4500)
    await sleep(350)
  }
}
await sleep(600)
const out = await ev(`(window.__s.done = true, JSON.stringify(window.__s))`)
const s = JSON.parse(out)
console.log(JSON.stringify({ ...s, revPct: +(100 * s.revFrames / Math.max(1, s.frames)).toFixed(1), spikePct: +(100 * s.spikeFrames / Math.max(1, s.frames)).toFixed(1) }))
await fetch(CDP + `/json/close/${mk.id}`); ws.close()
