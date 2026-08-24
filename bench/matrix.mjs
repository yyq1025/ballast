// Parallel regression matrix. Runs the standard profiles concurrently, each in
// its OWN WINDOW of a dedicated bench Chrome whose occluded windows keep a
// real frame clock:
//
//   chrome --remote-debugging-port=9224 --user-data-dir=/tmp/chrome-bench-9224 \
//     --no-first-run --disable-background-timer-throttling \
//     --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
//     --disable-features=IntensiveWakeUpThrottling
//
// Plain background TABS do not work: document.hidden gates rAF off entirely.
// Occluded windows under the flag measured identical to foreground (876
// frames/16s, same painted %).
//
//   PORT=9224 node bench/matrix.mjs [baseUrl]
//
// Exits 1 if any cell breaches its threshold.
const BASE = process.argv[2] || 'http://localhost:5490/harness/index.html'
const CDP = 'http://127.0.0.1:' + (process.env.PORT || '9224')
const CONCURRENCY = Number(process.env.CONC || 4)

const PROFILES = [
  { name: 'scrollup ro real', q: 'list=proto&measure=ro&scenario=scrollup&mix=real&step=10&size=1000', max: 1 },
  { name: 'scrollup ro wild', q: 'list=proto&measure=ro&scenario=scrollup&mix=wild&step=10&size=1000', max: 1 },
  { name: 'scrollup sync real', q: 'list=proto&measure=sync&scenario=scrollup&mix=real&step=10&size=1000', max: 1 },
  { name: 'scrollup ro fast', q: 'list=proto&measure=ro&scenario=scrollup&mix=real&step=60&size=1000', max: 1.5 },
  { name: 'scrollup ro est40', q: 'list=proto&measure=ro&scenario=scrollup&mix=real&step=10&est=40&size=1000', max: 1.5 },
  { name: 'stream ro r35', q: 'list=proto&measure=ro&scenario=stream&rate=35&size=1000&dur=15000', max: 1.5 },
  { name: 'stream ro r20', q: 'list=proto&measure=ro&scenario=stream&rate=20&size=1000&dur=15000', max: 1.5 },
  { name: 'stream sync r35', q: 'list=proto&measure=sync&scenario=stream&rate=35&size=1000&dur=15000', max: 0.5 },
]

const ver = await fetch(CDP + '/json/version').then((r) => r.json())
const bws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((r) => (bws.onopen = r))
let bid = 0
const bpend = new Map()
bws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && bpend.has(d.id)) { bpend.get(d.id)(d); bpend.delete(d.id) } }
const bcall = (m, p = {}) => new Promise((res) => { const i = ++bid; bpend.set(i, res); bws.send(JSON.stringify({ id: i, method: m, params: p })) })

async function runProfile(p) {
  const targetId = (await bcall('Target.createTarget', { url: `${BASE}?${p.q}`, newWindow: true })).result.targetId
  await new Promise((r) => setTimeout(r, 500))
  const tab = (await fetch(CDP + '/json').then((r) => r.json())).find((t) => t.id === targetId)
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
  const call = (m, pr = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: pr })) })
  const ev = async (e) => (await call('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value
  await call('Runtime.enable')
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await ev('!!(window.__stats && window.__stats.done)')) break
  }
  const s = JSON.parse((await ev('JSON.stringify(window.__stats)')) || '{}')
  ws.close()
  await bcall('Target.closeTarget', { targetId })
  const painted = p.q.includes('scrollup')
    ? (100 * (s.paintedJumpFrames || 0)) / Math.max(1, s.paintedScrollFrames || 1)
    : (100 * (s.paintedUnpinned || 0)) / Math.max(1, s.paintedFrames || 1)
  const maxPx = p.q.includes('scrollup')
    ? s.paintedMaxJumpPx || 0
    : s.paintedMaxPinErr || 0
  return { name: p.name, painted: +painted.toFixed(2), maxPx: Math.round(maxPx), ok: painted <= p.max, secs: Math.round((Date.now() - t0) / 1000) }
}

const t0 = Date.now()
const results = []
const queue = [...PROFILES]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) results.push(await runProfile(queue.shift()))
  }),
)
bws.close()
let fail = 0
for (const r of results.sort((a, b) => PROFILES.findIndex((p) => p.name === a.name) - PROFILES.findIndex((p) => p.name === b.name))) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(20)} painted ${String(r.painted).padStart(5)}%  max ${String(r.maxPx).padStart(4)}px  (${r.secs}s)`)
  if (!r.ok) fail = 1
}
console.log(`wall time: ${Math.round((Date.now() - t0) / 1000)}s`)
process.exit(fail)
