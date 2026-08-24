// High-density variant of followprobe: ~140 sub-threshold nudges at varied
// frame phases inside one long stream, reporting every disengage decision.
// usage: node bench/nudgestorm.mjs "<harness url with scenario=stream&dur=120000>"
// High-density probe: nudge up by a small amount at random phases inside one
// long stream, and record EVERY anchor decision with the dist that caused it.
const base = process.argv[2]
const CDP = 'http://127.0.0.1:9222'
const mk = await fetch(CDP + '/json/new?' + encodeURIComponent(base), { method: 'PUT' }).then(r => r.json())
await fetch(CDP + `/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value
await call('Runtime.enable')
await new Promise(r => setTimeout(r, 6000))
// Run the whole storm in-page so nudges land at arbitrary frame phases.
await ev(`(() => {
  const el = (() => { let best=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!best || d.scrollHeight > best.scrollHeight)) best = d } } return best })()
  window.__balev = []
  window.__storm = { nudges: 0, done: false }
  let n = 0
  const tick = () => {
    if (n++ > 140) { window.__storm.done = true; return }
    // re-pin first (external bottom write), then nudge up a small amount
    el.scrollTop = el.scrollHeight
    setTimeout(() => {
      el.scrollTop = el.scrollTop - (6 + (n % 4) * 6)   // 6..24px, all under threshold
      window.__storm.nudges++
    }, 120 + (n % 7) * 11)
    setTimeout(tick, 380)
  }
  tick()
})()`)
while (!(await ev('window.__storm && window.__storm.done'))) await new Promise(r => setTimeout(r, 1000))
const nudges = await ev('window.__storm.nudges')
const anchors = JSON.parse(await ev(`JSON.stringify((window.__balev||[]).filter(e => e.d === 'ANCHOR'))`))
const ends = await ev(`(window.__balev||[]).filter(e => e.d === 'END').length`)
console.log(`nudges ${nudges} | END decisions ${ends} | ANCHOR decisions ${anchors.length}`)
for (const a of anchors.slice(0, 12)) console.log('  ANCHOR:', JSON.stringify(a))
await fetch(CDP + `/json/close/${mk.id}`); ws.close()
