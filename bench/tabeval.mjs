const [tabId, expr] = [process.argv[2], process.argv[3]]
const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json())
const t = tabs.find(x => x.id === tabId)
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true })
console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails).slice(0, 500))
ws.close()
