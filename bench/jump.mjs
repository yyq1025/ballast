// Long-jump fill test: land at bottom, scroll to TOP, then jump back to the
// bottom two ways — (a) the list's declarative API, (b) a naive scrollTop
// write. Per-frame sampling: pinErr + 5-probe fill until stable.
const mode = process.argv[3] || 'api'   // api | naive
const url = process.argv[2]
const mk = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
await fetch(`http://127.0.0.1:9222/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) console.error('ERR', JSON.stringify(r.result.exceptionDetails).slice(0,200)); return r.result?.result?.value }
await call('Runtime.enable')
await new Promise(r => setTimeout(r, 3500)) // land
const out = await ev(`(async () => {
  const el = (() => { let best=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!best || d.scrollHeight > best.scrollHeight)) best = d } } return best })()
  const raf = () => new Promise(r => requestAnimationFrame(r))
  // go to top like a user, settle
  el.scrollTop = 0
  for (let i = 0; i < 30; i++) await raf()
  // jump back to bottom
  const t0 = performance.now()
  ${mode === 'api'
    ? 'window.__api.current.scrollToDistanceFromBottomPx(0)'
    : 'el.scrollTop = el.scrollHeight'}
  const frames = []
  for (let i = 0; i < 40; i++) {
    await raf()
    await new Promise(r => setTimeout(r, 0)) // post-paint
    const cr = el.getBoundingClientRect()
    let miss = 0
    for (let k = 0; k < 5; k++) {
      const y = cr.top + 8 + (cr.height - 16) * k / 4
      const n = document.elementFromPoint(cr.left + cr.width / 2, y)
      if (!n || !n.closest || !n.closest('.msg')) miss++
    }
    frames.push({ pinErr: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop), miss })
  }
  const landedAt = frames.findIndex(f => f.pinErr <= 4)
  const blankFrames = frames.filter(f => f.miss > 0).length
  const maxMiss = Math.max(...frames.map(f => f.miss))
  return JSON.stringify({ landedAtFrame: landedAt, blankFrames, maxMiss, ms: Math.round(performance.now() - t0), first6: frames.slice(0, 6) })
})()`)
console.log(mode, out)
await fetch(`http://127.0.0.1:9222/json/close/${mk.id}`); ws.close()
