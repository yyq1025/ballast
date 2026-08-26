// Benchmark harness server. Vite replaces both the hand-rolled COI static
// server and the esbuild vendor pipeline: dep pre-bundling gives correct
// CJS→ESM interop (named exports, nested requires) and a singleton react,
// which hand-vendoring got wrong three distinct ways before this pivot.
// (plain object export — defineConfig is only a type helper, and this config
// must load even when vite runs from the bunx cache before bun install)
export default {
  appType: 'mpa',
  server: {
    port: 5490,
    strictPort: true,
    // LAN-exposed so a phone on the same Wi-Fi can hand-test touch feel
    // (http://<mac-ip>:5490/harness/…).
    host: true,
    // crossOriginIsolated === true so the page can call
    // performance.measureUserAgentSpecificMemory() (memory scenario).
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    // Everything the harness can dynamically import, pre-bundled up front so
    // first-visit dep discovery never reloads a bench run mid-measurement.
    include: [
      'react', 'react-dom/client', 'htm',
      '@tanstack/react-virtual', '@legendapp/list/react', 'virtua',
      '@virtuoso.dev/message-list',
      '@astryxdesign/core/Markdown', '@astryxdesign/core/theme',
      '@astryxdesign/core/Chat', '@astryxdesign/theme-neutral/built',
      '@astryxdesign/lab',
    ],
  },

  plugins: [
    {
      // Freshness stamp for on-device testing: injects the newest mtime of
      // the engine + harness into a corner badge, re-read on every request,
      // so a phone can tell at a glance whether it reloaded the latest edit.
      name: 'harness-stamp',
      async transformIndexHtml(html) {
        const { statSync } = await import('node:fs')
        const t = Math.max(
          ...['src/index.mjs', 'harness/index.html'].map(
            (p) => statSync(new URL(p, import.meta.url)).mtimeMs,
          ),
        )
        const stamp = new Date(t).toLocaleTimeString('en-GB')
        return {
          html,
          tags: [
            {
              tag: 'div',
              attrs: {
                style:
                  'position:fixed;right:4px;bottom:4px;z-index:99999;' +
                  'background:rgba(0,0,0,.7);color:#9ad;font:10px monospace;' +
                  'padding:2px 6px;border-radius:4px;pointer-events:none',
              },
              children: `build ${stamp}`,
              injectTo: 'body',
            },
          ],
        }
      },
    },
  ],
}
