// Bundle the harness's third-party deps into vendor/ so the benchmark page
// never touches the network (esm.sh cold-fetch races produced ghost runs —
// see docs/RESULTS.md methodology notes). Run: bun install && bun run vendor
// vendor/ is gitignored: @virtuoso.dev/message-list is commercial (localhost
// evaluation per its EULA) and must not be redistributed in this repo.
import { build } from 'esbuild'
import { rmSync, mkdirSync } from 'node:fs'

// react itself is bundled once; everything else marks it external so the
// import map resolves all arms to the SAME react instance (singleton).
const REACT_EXTERNALS = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']

const ENTRIES = [
  { name: 'react', entry: 'react', external: [] },
  { name: 'react-dom-client', entry: 'react-dom/client', external: ['react'] },
  { name: 'htm', entry: 'htm', external: [] },
  { name: 'tanstack-react-virtual', entry: '@tanstack/react-virtual', external: REACT_EXTERNALS },
  { name: 'legendapp-list-react', entry: '@legendapp/list/react', external: REACT_EXTERNALS },
  { name: 'virtua', entry: 'virtua', external: REACT_EXTERNALS },
  { name: 'virtuoso-message-list', entry: '@virtuoso.dev/message-list', external: REACT_EXTERNALS },
  { name: 'astryx-markdown', entry: '@astryxdesign/core/Markdown', external: REACT_EXTERNALS },
  { name: 'astryx-theme', entry: '@astryxdesign/core/theme', external: REACT_EXTERNALS },
  { name: 'astryx-theme-neutral', entry: '@astryxdesign/theme-neutral/built', external: REACT_EXTERNALS },
  { name: 'astryx-chat', entry: '@astryxdesign/core/Chat', external: REACT_EXTERNALS },
  { name: 'streamdown', entry: 'streamdown', external: REACT_EXTERNALS },
]

rmSync('vendor', { recursive: true, force: true })
mkdirSync('vendor')
for (const e of ENTRIES) {
  await build({
    entryPoints: [e.entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: `vendor/${e.name}.mjs`,
    external: e.external,
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'empty' },
    logLevel: 'warning',
  })
  console.log('vendored', e.entry, '->', `vendor/${e.name}.mjs`)
}
console.log('\ndone — now the harness import map can point at ./vendor/ (ask to flip it).')
