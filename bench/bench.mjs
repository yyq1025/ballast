// usage: node bench.mjs "<url>" [timeoutMs]
// Opens the url in the CDP-enabled Chrome (port 9222), activates the tab so it
// gets a real frame clock, polls window.__stats.done, prints the summary JSON.
const url = process.argv[2]
const timeout = Number(process.argv[3] || 90000)
const mk = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
await fetch(`http://127.0.0.1:9222/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) console.error('EVAL ERR', JSON.stringify(r.result.exceptionDetails).slice(0,300)); return r.result?.result?.value }
await call('Runtime.enable')
const t0 = Date.now()
let last = ''
while (Date.now() - t0 < timeout) {
  await new Promise(r => setTimeout(r, 1000))
  const done = await ev('!!(window.__stats && window.__stats.done)')
  const hud = await ev('document.getElementById("hud")?.innerText || ""')
  if (process.env.TL) { const tl = await ev(`(() => { let best=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!best || d.scrollHeight > best.scrollHeight)) best = d } } return best ? Math.round(best.scrollHeight - best.clientHeight - best.scrollTop) + ' rows=' + document.querySelectorAll('.msg').length + ' sh=' + best.scrollHeight : 'none' })()`); process.stderr.write('\n[t+' + Math.round((Date.now()-t0)/1000) + 's] pinErr=' + tl) }
  if (hud !== last) { last = hud; process.stderr.write('\r' + hud.replace(/\n/g, ' | ').slice(0, 160)) }
  if (done) break
}
process.stderr.write('\n')
const out = await ev(`(() => { const s = window.__stats; const sc = location.search; return JSON.stringify({ scenario: new URLSearchParams(sc).get('scenario') || 'stream', mountedRows: document.querySelectorAll('.msg, .cvrow').length, hud: document.getElementById('hud')?.innerText, stats: s }) })()`)
console.log(out)
const errs = await ev(`JSON.stringify(window.__errors || [])`)
await fetch(`http://127.0.0.1:9222/json/close/${mk.id}`)
ws.close()
