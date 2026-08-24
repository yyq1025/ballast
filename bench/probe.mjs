const url = process.argv[2]; const secs = Number(process.argv[3] || 12)
const mk = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
await fetch(`http://127.0.0.1:9222/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value
await call('Runtime.enable')
const t0 = Date.now()
while (Date.now() - t0 < secs * 1000) {
  await new Promise(r => setTimeout(r, 250))
  console.log(await ev(`(() => { let best=null; for (const d of document.querySelectorAll('div')) { if (d.scrollHeight > d.clientHeight + 10) { const oy = getComputedStyle(d).overflowY; if ((oy==='auto'||oy==='scroll') && (!best || d.scrollHeight > best.scrollHeight)) best = d } } if (!best) return 'no-scroller'; return JSON.stringify({ sh: best.scrollHeight, ch: best.clientHeight, st: Math.round(best.scrollTop), pinErr: Math.round(best.scrollHeight - best.clientHeight - best.scrollTop), rows: document.querySelectorAll('.msg').length, cls: best.getAttribute('data-testid') || best.className || best.tagName }) })()`))
}
await fetch(`http://127.0.0.1:9222/json/close/${mk.id}`); ws.close()
