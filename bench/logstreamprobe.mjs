// Follow-disengage probe for astryx lab LogStream (?list=logstream). Reports
// every onFollowChange(false) with the distance-from-bottom that triggered it.
// Nothing in the harness writes scrollTop for this arm — the measurement loop
// is read-only, so any disengage is the component's own.
//   node bench/logstreamprobe.mjs "<url>" [ms]
// Add &refollow=1 to simulate a user hitting "Jump to latest" after each
// disengage, and &short=1 for one-line messages (astryx's own story style).
const url = process.argv[2]
const mk = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
await fetch(`http://127.0.0.1:9222/json/activate/${mk.id}`)
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value
await call('Runtime.enable')
await new Promise(r => setTimeout(r, Number(process.argv[3] || 12000)))
console.log('unfollow events:', await ev('JSON.stringify(window.__unfollows || [])'))
await fetch(`http://127.0.0.1:9222/json/close/${mk.id}`); ws.close()
