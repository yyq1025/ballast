# TanStack Virtual's benchmark suite, with ballast as an arm

`@tanstack/virtual`'s repo carries its own Playwright benchmark suite
(`benchmarks/` on upstream `main`, measured here at `e9874f0`, 2026-08-18):
7 library pages × 12 scenarios, all behind one `HarnessHandle` contract, driven
against a `vite build` preview. It measures *throughput and cost* — mount time,
settle time, `scrollToIndex` landing accuracy, heap — and no paint-level
artifacts, so it is complementary to this repo's harness, not a replacement.

`BallastPage.tsx` is the adapter that makes ballast one of its arms.
`repriceprobe.mjs` is the probe that found the repricing race in § 11 of
`docs/RESULTS.md`.

## Setup

The suite lives in TanStack's repo, so this is a copy-and-alias, not a checkout:

```bash
git clone https://github.com/TanStack/virtual
cp -R virtual/benchmarks /tmp/tsv-bench && cd /tmp/tsv-bench
```

Then, in that copy:

1. Replace `@tanstack/react-virtual: "workspace:*"` in `package.json` with the
   published version (`3.14.10` at the measured commit) so you do not have to
   build the whole monorepo — its 69 workspace examples pull Angular, Vue,
   Svelte, Lit and Marko toolchains for nothing. Drop the `react-aria-components`
   dep and the `Rac*` pages unless you want those arms.
2. `resolve.alias` `ballast` → this repo's `src/index.mjs` in `vite.config.ts`,
   and allow the path in `server.fs.allow`.
3. Copy `BallastPage.tsx` into `src/pages/`, wire `ballast-ro` / `ballast-sync`
   into the `switch` in `src/main.tsx`, and add them to `ALL_LIBS` in
   `runner/run.mjs`.
4. `pnpm install --ignore-workspace && pnpm exec playwright install chromium`

The 100k scenarios the probe uses are NOT in the upstream scenario list — add
them to `SCENARIOS` in `src/scenarios/types.ts`:

```js
{ id: 'jump-to-middle-accuracy-dynamic-100k', count: 100_000, itemSize: 30, dynamic: true, action: 'jump-to-middle-accuracy' },
{ id: 'jump-to-end-dynamic-100k',             count: 100_000, itemSize: 30, dynamic: true, action: 'jump-to-end' },
```

## Running

```bash
pnpm build && pnpm preview            # serves :4173
node repriceprobe.mjs 12 ballast-ro   # the § 11 race
pnpm bench -- --runs 5 --libs ballast-ro,ballast-sync,tanstack,virtua,virtuoso,window \
  --scenarios jump-to-middle-accuracy-dynamic-10k,jump-to-last-accuracy-dynamic-10k,jump-while-measuring-accuracy-dynamic-10k,jump-wide-variance-accuracy-10k,jump-to-end-dynamic-10k
```

## Adapter notes

- **Attach mode.** ballast takes the `.scroll-host` element itself (not a ref —
  a parent's ref attaches after its children's layout effects), so the page holds
  it in state and passes `null` on the first render.
- **`scrollToIndex` does not exist.** `align: 'start'` maps to
  `anchorToKey(String(i), 0)`; `align: 'end'` at the last index maps to
  `scrollToDistanceFromBottomPx(0)`, which is ballast's native frame. The suite
  only ever uses `align: 'end'` at the last index, so the clamping caveat on
  `anchorToKey` never bites.
- **Start position.** Every other arm mounts at the top; ballast's default frame
  is follow-at-end, so the adapter declares `anchorToKey('0', 0)` at mount to put
  all arms on the same starting line. `?noTopAnchor=1` skips it — used to prove
  the § 11 miss was not an artifact of that declaration (the miss rate went UP
  without it, 4/8 vs 2/8).
- **Row spacing.** The suite's `.item` CSS uses `padding` and no container `gap`,
  which already satisfies ballast's caller contract. Nothing to change.
- **`getTotalSize`** reads `apiRef.__debug().total`.

## Scenarios worth running, and not

The five `jump-*` scenarios and `mount-dynamic-*` are the ones that say anything
about this design. `scroll-to-bottom-*` and `fast-scroll-*` are 1.5s rAF-paced
scrolls at 10k where upstream's own README notes every library trivially holds
60fps; this repo's painted-artifact axes are strictly more informative.
`mount-fixed-100k` is out of ballast's scope and measures the O(N)-per-pass
rebuild noted as a debt in the top-level README.
