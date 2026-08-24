// Follow-semantics probe: inside an ACTIVE stream, land at the bottom, nudge
// the viewport up by less than endThreshold, and check that follow-at-end
// survives. Catches the class where uncompensated tail growth inflates the
// live distance-to-bottom and a small user nudge reads as "user left".
// usage: node bench/followprobe.mjs "<harness url with scenario=stream&dur=120000>"
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
const EL = `(() => { let best=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!best || d.scrollHeight > best.scrollHeight)) best = d } } return best })()`
const growing = async () => {
  const a = await ev(`${EL}.scrollHeight`); await new Promise(r => setTimeout(r, 400))
  const b = await ev(`${EL}.scrollHeight`); return b > a
}
let pass = 0, fail = 0, skipped = 0
for (let i = 0; i < 14; i++) {
  if (!(await growing())) { skipped++; continue }
  await ev(`(() => { const el = ${EL}; el.scrollTop = el.scrollHeight })()`)
  await new Promise(r => setTimeout(r, 900))
  await ev(`window.__balev = []`)
  await ev(`(() => { const el = ${EL}; el.scrollTop = el.scrollTop - (10 + (i % 3) * 7) })()`)
  await new Promise(r => setTimeout(r, 1800))
  const after = await ev(`(() => { const el = ${EL}; return Math.round(el.scrollHeight - el.clientHeight - el.scrollTop) })()`)
  const log = JSON.parse(await ev(`JSON.stringify((window.__balev||[]).slice(0,5))`))
  const flipped = log.some(e => e.d === 'ANCHOR')
  if (after > 40 || flipped) {
    fail++
    console.log(`FAIL run ${i}: settled ${after}px, flipped=${flipped}`)
    for (const e of log) console.log('   ', JSON.stringify(e))
  } else { pass++; process.stdout.write('.') }
}
console.log(`\npass ${pass} fail ${fail} skipped ${skipped}`)
await fetch(CDP + `/json/close/${mk.id}`); ws.close()
