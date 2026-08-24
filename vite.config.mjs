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
      'react', 'react-dom/client', 'htm', 'marked',
      '@tanstack/react-virtual', '@legendapp/list/react', 'virtua',
      '@virtuoso.dev/message-list',
      '@astryxdesign/core/Markdown', '@astryxdesign/core/theme',
      '@astryxdesign/core/Chat', '@astryxdesign/theme-neutral/built',
    ],
  },

}
