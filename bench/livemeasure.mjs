// Attach to an ALREADY-OPEN tab (by URL substring), install a fine-grained
// hand-feel sampler, wait N seconds while the human scrolls, print results.
const [urlPart, secs] = [process.argv[2], Number(process.argv[3] || 15)]
const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json())
const t = tabs.find(x => x.url?.includes(urlPart))
if (!t) { console.error('no tab matching', urlPart); process.exit(1) }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => { const r = await call('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result?.exceptionDetails) console.error('ERR', JSON.stringify(r.result.exceptionDetails).slice(0,300)); return r.result?.result?.value }
await call('Runtime.enable')
await ev(`(() => {
  if (window.__hs && !window.__hs.done) return 'already installed'
  const el = (() => { let best=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!best || d.scrollHeight > best.scrollHeight)) best = d } } return best })()
  window.__hs = { frames: 0, activeFrames: 0, scrolledPx: 0, rev: 0, maxRevPx: 0, osc: 0, topPop: 0, maxTopPopPx: 0, popEpisodes: 0, popFrames: 0, maxEpisodeFrames: 0, shJumps: 0, maxShJumpPx: 0, wheelEvents: 0, done: false }
  el.addEventListener('wheel', () => { window.__hs.wheelEvents++ }, { passive: true })
  let anchor = null, prevTop = null, prevD = null, prevScroll = el.scrollTop, prevSh = el.scrollHeight
  let topProbe = null, topProbeTop = null
  const pick = () => {
    const cr = el.getBoundingClientRect()
    const n = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2)
    anchor = n && n.closest ? n.closest('.msg, .cvrow') : null
    prevTop = anchor ? anchor.getBoundingClientRect().top : null
    prevD = null
  }
  const pickTop = () => {
    const cr = el.getBoundingClientRect()
    const n = document.elementFromPoint(cr.left + cr.width / 2, cr.top + 30)
    topProbe = n && n.closest ? n.closest('.msg, .cvrow') : null
    topProbeTop = topProbe ? topProbe.getBoundingClientRect().top : null
  }
  pick(); pickTop()
  const loop = () => {
    if (window.__hs.done) return
    requestAnimationFrame(loop)
    setTimeout(() => {
      if (window.__hs.done) return
      const scroll = el.scrollTop
      const dScroll = scroll - prevScroll
      prevScroll = scroll
      const sh = el.scrollHeight
      if (Math.abs(sh - prevSh) > 8) { window.__hs.shJumps++; window.__hs.maxShJumpPx = Math.max(window.__hs.maxShJumpPx, Math.round(Math.abs(sh - prevSh))) }
      prevSh = sh
      window.__hs.frames++
      const active = dScroll !== 0
      if (active) { window.__hs.activeFrames++; window.__hs.scrolledPx += Math.abs(dScroll) }
      // center anchor: reversal + micro-oscillation (only while input active)
      if (!anchor || !anchor.isConnected) pick()
      else {
        const cr = el.getBoundingClientRect()
        const top = anchor.getBoundingClientRect().top
        if (top > cr.bottom - 40 || top < cr.top - 4000) pick()
        else {
          if (prevTop !== null && active) {
            const d = top - prevTop
            if (dScroll < 0 && d < -1) { window.__hs.rev++; window.__hs.maxRevPx = Math.max(window.__hs.maxRevPx, Math.round(-d)) }
            if (prevD !== null && Math.sign(d) !== 0 && Math.sign(prevD) !== 0 && Math.sign(d) !== Math.sign(prevD) && Math.abs(d) > 1 && Math.abs(prevD) > 1) window.__hs.osc++
            prevD = d
          } else prevD = null
          prevTop = top
        }
      }
      // top-edge probe: rows near the viewport top popping/resizing
      if (!topProbe || !topProbe.isConnected) pickTop()
      else {
        const top2 = topProbe.getBoundingClientRect().top
        if (topProbeTop !== null && active) {
          const d2 = top2 - topProbeTop
          const expected = -dScroll
          const dev = d2 - expected
          const inPop = Math.abs(dev) > 3
          if (inPop) {
            window.__hs.topPop++
            window.__hs.maxTopPopPx = Math.max(window.__hs.maxTopPopPx, Math.round(Math.abs(dev)))
            window.__hs.popFrames++
            if (!window.__ep) { window.__ep = 1; window.__hs.popEpisodes++ } else window.__ep++
            window.__hs.maxEpisodeFrames = Math.max(window.__hs.maxEpisodeFrames, window.__ep)
          } else window.__ep = 0
        }
        topProbeTop = top2
        const cr2 = el.getBoundingClientRect()
        if (top2 > cr2.top + 400 || top2 < cr2.top - 2000) pickTop()
      }
    }, 0)
  }
  requestAnimationFrame(loop)
})()`)
if (process.argv[3] === 'read') {
  const out = await ev('JSON.stringify(window.__hs || null)')
  const s = JSON.parse(out)
  if (!s) console.log('no sampler on this tab')
  else console.log(JSON.stringify({ ...s, revPctOfActive: +(100 * s.rev / Math.max(1, s.activeFrames)).toFixed(1), topPopPctOfActive: +(100 * s.topPop / Math.max(1, s.activeFrames)).toFixed(1) }))
} else {
  console.log(`sampler installed (persistent) on: ${t.url.slice(0, 90)}`)
}
ws.close()
