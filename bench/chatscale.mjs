// Scale probe for the unvirtualized astryx ChatLayout arm (?list=chatlayout).
// Streams a reply with N messages already in the list and reports what the
// user feels: frame pacing during the stream, DOM size, and follow error.
//   node bench/chatscale.mjs "<harness url>" [sampleMs]
const url = process.argv[2]
const sampleMs = Number(process.argv[3] || 12000)
const mk = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
await fetch(`http://127.0.0.1:9222/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async (e, aw = false) => (await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: aw })).result?.result?.value
await call('Runtime.enable')
// wait for the seeded list to mount and the auto-send to fire
await new Promise(r => setTimeout(r, 6000))
const out = await ev(`(async () => {
  const el = (() => { let b=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const o=getComputedStyle(d).overflowY; if ((o==='auto'||o==='scroll') && (!b || d.scrollHeight>b.scrollHeight)) b=d } } return b })()
  const frames = [], pinErrs = []
  let last = performance.now()
  await new Promise(done => {
    const t0 = last
    const loop = () => {
      const now = performance.now()
      frames.push(now - last); last = now
      if (el) pinErrs.push(el.scrollHeight - el.clientHeight - el.scrollTop)
      if (now - t0 < ${sampleMs}) requestAnimationFrame(loop); else done()
    }
    requestAnimationFrame(loop)
  })
  const sorted = frames.slice().sort((a,b) => a-b)
  const pct = (p) => sorted[Math.floor(sorted.length * p)]
  const unpinned = pinErrs.filter(e => e > 4).length
  return JSON.stringify({
    frames: frames.length,
    fps: +(1000 / (frames.reduce((a,b) => a+b, 0) / frames.length)).toFixed(1),
    medianMs: +pct(0.5).toFixed(1),
    p95Ms: +pct(0.95).toFixed(1),
    worstMs: +sorted[sorted.length-1].toFixed(1),
    jankFrames: frames.filter(f => f > 50).length,
    domNodes: document.querySelectorAll('*').length,
    messages: document.querySelectorAll('.astryx-chat-message').length,
    unpinnedPct: +(100 * unpinned / Math.max(1, pinErrs.length)).toFixed(1),
    maxPinErr: Math.round(Math.max(0, ...pinErrs)),
  })
})()`, true)
console.log(out)
await fetch(`http://127.0.0.1:9222/json/close/${mk.id}`); ws.close()
