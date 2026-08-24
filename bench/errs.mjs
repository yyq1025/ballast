const url = process.argv[2]
const mk = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' }).then(r => r.json())
const ws = new WebSocket(mk.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.method === 'Runtime.exceptionThrown') console.log('EXC:', JSON.stringify(d.params.exceptionDetails).slice(0, 600))
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.log('CONSOLE.ERR:', d.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400))
}
send('Runtime.enable')
await new Promise(r => setTimeout(r, 9000))
await fetch(`http://127.0.0.1:9222/json/close/${mk.id}`); ws.close()
