// Static server with cross-origin isolation headers so the bench page gets
// crossOriginIsolated === true and can call performance.measureUserAgentSpecificMemory()
// (real JS+DOM memory breakdown). COEP: credentialless keeps esm.sh/unpkg
// subresources loadable without per-resource CORP headers.
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const PORT = 5490
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
}

createServer(async (req, res) => {
  const path = normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "harness/index.html"
  try {
    const body = await readFile(join(ROOT, path))
    res.writeHead(200, {
      "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cache-Control": "no-store",
    })
    res.end(body)
  } catch {
    res.writeHead(404).end("not found")
  }
}).listen(PORT, () => console.log(`bench server on :${PORT} (crossOriginIsolated)`))
