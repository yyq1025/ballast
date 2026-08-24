// anchorToKey probe: jump to arbitrary row keys and sample every painted
// frame for viewport fill and landing offset. Verifies committed semantics
// (destination renders before the position lands) for declared anchors.
// usage: node bench/anchorprobe.mjs "<harness url, scenario=rest>"
const url = process.argv[2]
const CDP = 'http://127.0.0.1:9222'
const mk = await fetch(CDP + '/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
await fetch(CDP + `/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value
await call('Runtime.enable')
await new Promise(r => setTimeout(r, 5000))
// jump to an arbitrary key, sampling every painted frame for blankness
for (const key of ['500', '120', '900', '3']) {
  const out = await ev(`(async () => {
    const el = document.querySelector('.msg')?.closest('div[style*="overflow"]') || (() => { let b=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy=getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!b || d.scrollHeight>b.scrollHeight)) b=d } } return b })()
    const frames = []
    let n = 0
    const sample = () => {
      const cr = el.getBoundingClientRect()
      let filled = 0
      for (let i = 0; i < 5; i++) {
        const y = cr.top + 10 + (cr.height - 20) * (i / 4)
        const node = document.elementFromPoint(cr.left + cr.width / 2, y)
        if (node && node.closest('[data-pkey]')) filled++
      }
      const row = document.querySelector('[data-pkey="${key}"]')
      frames.push({ filled, top: row ? Math.round(row.getBoundingClientRect().top - cr.top) : null })
    }
    window.__api.current.anchorToKey('${key}', 0)
    await new Promise(r => { const loop = () => { requestAnimationFrame(() => setTimeout(() => { sample(); if (++n < 20) loop(); else r() }, 0)) }; loop() })
    const blank = frames.filter(f => f.filled < 5).length
    const settled = frames[frames.length - 1]
    return JSON.stringify({ key: '${key}', blankFrames: blank, framesToLand: frames.findIndex(f => f.top !== null && Math.abs(f.top) <= 2), finalTopOffset: settled.top })
  })()`)
  console.log(out)
  await new Promise(r => setTimeout(r, 600))
}
await fetch(CDP + `/json/close/${mk.id}`); ws.close()
