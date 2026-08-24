// ballast — minimal experimental virtualizer (aggregate spacers + bottom-
// distance bookkeeping + identity-anchor override). See README for receipts.
//
// The combo under test:
//   1. aggregate top/bottom spacers — rendered rows stay in normal document
//      flow between two placeholder divs (Rocksteady-style occupancy, O(1)
//      placeholder nodes);
//   2. bottom-distance bookkeeping as the default reference frame — the
//      desired position is stored as "px from the bottom edge"; above-viewport
//      estimate→measured swaps and pinned tail growth are both identity
//      operations in this frame (ChatGPT-style coordinates);
//   3. identity-anchor override while scrolled up — reading history anchors
//      the first row intersecting the viewport top, so above-window size
//      corrections keep the row you're reading visually frozen.
//
// Corrections are SYNCHRONOUS pre-paint: every commit's layout effect
// re-measures the rendered window (offsetHeight forces layout), recomputes
// offsets, resizes the spacers, and restores scrollTop from the mode — all
// before the browser paints. No compensation deltas anywhere: position is
// always re-derived from the stored reference, so a single miss self-heals.
import * as React from 'react'

const h = React.createElement

export function Ballast(props) {
  const {
    data,
    keyExtractor,
    renderItem,
    estimatedItemSize = 120,
    // 'ro' (default, the shipping gear) = sizes come from ResizeObserver
    // callbacks plus a one-shot sync read at first mount; steady-state
    // commits do no forced layout. 'sync' = forced-layout measurement in
    // EVERY commit's layout effect — zero-window corrections, pays a sync
    // layout per commit. Kept as the experimental control arm: same code,
    // one switch, so any residual artifact bisects into "pipeline timing"
    // vs "logic" instantly (see docs/RESULTS.md ablation).
    measureMode = 'ro',
    apiRef,
    overscanTop = 1600,
    overscanBottom = 600,
    style,
    className,
  } = props

  const scrollerRef = React.useRef(null)
  const spacerTopRef = React.useRef(null)
  const spacerBottomRef = React.useRef(null)
  const rowEls = React.useRef(new Map()) // key -> element
  const sizes = React.useRef(new Map()) // key -> measured px
  const geo = React.useRef({ offsets: [], total: 0, keys: [] })
  // mode: { kind: 'end', distance } | { kind: 'anchor', key, viewportOffset }
  const mode = React.useRef({ kind: 'end', distance: 0 })
  // Echo-matching instead of a time window: we record the exact value we
  // wrote; a scroll event only counts as "ours" if scrollTop matches it.
  // A time gate would swallow real user scrolls arriving within the window,
  // leaving a stale anchor that the next restore then fights (double-writer).
  const progTarget = React.useRef(null)
  // Last scrollTop observed by a scroll event — direction gate for the
  // end→anchor transition (see onScroll).
  const lastEventST = React.useRef(null)
  const geoChanged = React.useRef(false)
  // Convergence protection (generalized from a one-shot landing flag):
  // whenever a declarative target is set (mount landing, or any imperative
  // scrollTo*), the list is "converging" — scroll events may not flip the
  // mode (bootstrap writes and transient clamps would otherwise read as
  // user scrolls and hijack the target mid-flight), and every pass keeps
  // retrying until the target is reached. Only INTENT signals (wheel/touch,
  // not scroll effects — those mix in our own writes) break it early.
  const converging = React.useRef(true)
  const [win, setWin] = React.useState({ start: 0, end: -1 })
  const winRef = React.useRef(win)
  winRef.current = win
  const dataRef = React.useRef(data)
  dataRef.current = data

  const estOf = React.useCallback(
    (item, i) =>
      typeof estimatedItemSize === 'function'
        ? estimatedItemSize(item, i)
        : estimatedItemSize,
    [estimatedItemSize],
  )

  const recompute = React.useCallback(() => {
    const d = dataRef.current
    const offsets = new Array(d.length)
    const keys = new Array(d.length)
    let y = 0
    for (let i = 0; i < d.length; i++) {
      keys[i] = keyExtractor(d[i], i)
      offsets[i] = y
      y += sizes.current.get(keys[i]) ?? estOf(d[i], i)
    }
    geo.current = { offsets, total: y, keys }
  }, [keyExtractor, estOf])

  // index of the last row whose offset <= y
  const indexAt = (y) => {
    const { offsets } = geo.current
    let lo = 0
    let hi = offsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (offsets[mid] <= y) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  const computeWindow = (el, desiredTop) => {
    const g = geo.current
    if (g.keys.length === 0) return { start: 0, end: -1 }
    const top = desiredTop ?? el.scrollTop
    const start = indexAt(Math.max(0, top - overscanTop))
    const end = indexAt(
      Math.min(Math.max(0, g.total - 1), top + el.clientHeight + overscanBottom),
    )
    return { start, end }
  }

  const setWindowIfChanged = (next) => {
    const cur = winRef.current
    if (next.start !== cur.start || next.end !== cur.end) {
      geoChanged.current = true
      setWin(next)
    }
  }

  // Spacer heights for a window under a given geometry.
  const spacerHeights = (w) => {
    const g = geo.current
    const topH = w.end >= w.start && g.offsets.length > 0 ? g.offsets[w.start] : 0
    const endBottom =
      w.end >= w.start
        ? w.end + 1 < g.offsets.length
          ? g.offsets[w.end + 1]
          : g.total
        : 0
    return [topH, Math.max(0, g.total - endBottom)]
  }

  // The single correction pass: spacers(old geo) -> measure -> recompute ->
  // spacers(new geo) -> restore.
  const syncAndRestore = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const entryScrollTop = el.scrollTop
    // Phase 0 — spacers FIRST, from the pre-measure geometry: a window-shift
    // commit swaps rows before the layout effect runs, so without this the
    // first forced layout below sees new rows + stale spacers, the content
    // height transiently collapses, and the browser clamps scrollTop (which
    // then reads as a user scroll). Style writes don't force layout, so
    // making the spacers consistent BEFORE the first offsetHeight read
    // removes the collapse window entirely.
    {
      const [t0, b0] = spacerHeights(winRef.current)
      if (spacerTopRef.current) spacerTopRef.current.style.height = `${t0}px`
      if (spacerBottomRef.current)
        spacerBottomRef.current.style.height = `${b0}px`
    }
    // Refresh the anchor from the LIVE scrollTop against the pre-measure
    // geometry (= what's currently painted). scroll events lag rAF-driven
    // scrolls by a frame; scrollTop itself is ground truth, so deriving the
    // anchor here removes that staleness class entirely.
    if (mode.current.kind === 'anchor' && geo.current.keys.length > 0) {
      const idx = indexAt(el.scrollTop)
      mode.current = {
        kind: 'anchor',
        key: geo.current.keys[idx],
        viewportOffset: geo.current.offsets[idx] - el.scrollTop,
      }
    }
    if (measureModeRef.current === 'sync') {
      for (const [key, rowEl] of rowEls.current) {
        const px = rowEl.offsetHeight
        if (sizes.current.get(key) !== px) {
          sizes.current.set(key, px)
          geoChanged.current = true
        }
      }
    } else {
      // First-mount sync backstop: an UNMEASURED row is about to paint at its
      // real height while the geometry still carries its estimate. In
      // document flow that displaces everything below it (the whole viewport)
      // by (real - est) for one frame, then snaps back when RO delivers — a
      // 2-painted-frame artifact per mount that absolute-positioning designs
      // don't have. Measuring ONCE at mount closes it; growth and reflow of
      // already-measured rows stay on the RO pipeline (no per-commit forced
      // layout in steady state — this branch reads only when a fresh row
      // mounted this commit).
      for (const [key, rowEl] of rowEls.current) {
        if (!sizes.current.has(key)) {
          sizes.current.set(key, rowEl.offsetHeight)
          geoChanged.current = true
        }
      }
    }
    recompute()
    const g = geo.current
    const w = winRef.current
    const topH = w.end >= w.start && g.offsets.length > 0 ? g.offsets[w.start] : 0
    const endBottom =
      w.end >= w.start
        ? w.end + 1 < g.offsets.length
          ? g.offsets[w.end + 1]
          : g.total
        : 0
    const bottomH = Math.max(0, g.total - endBottom)
    if (spacerTopRef.current) spacerTopRef.current.style.height = `${topH}px`
    if (spacerBottomRef.current)
      spacerBottomRef.current.style.height = `${bottomH}px`

    // restore scrollTop from the stored reference frame
    if (converging.current) geoChanged.current = true
    const m = mode.current
    let target = null
    if (m.kind === 'end') {
      target = g.total - el.clientHeight - m.distance
    } else {
      const idx = g.keys.indexOf(m.key)
      if (idx >= 0) target = g.offsets[idx] - m.viewportOffset
    }
    if (target !== null && geoChanged.current) {
      geoChanged.current = false
      target = Math.max(0, Math.min(target, g.total - el.clientHeight))
      if (Math.abs(el.scrollTop - target) > 0.5) {
        el.scrollTop = target
        // Read back: the browser may clamp the write if the spacer resize
        // hasn't reached layout yet. The echo target must be the ACTUAL
        // landing value (otherwise our own clamped write is misread as a
        // user scroll and flips the mode), and a clamp marks the geometry
        // dirty again with a next-frame retry until the write sticks.
        const actual = el.scrollTop
        progTarget.current = actual
        if (Math.abs(actual - target) > 1) {
          geoChanged.current = true
          requestAnimationFrame(() => syncAndRestore())
        }
      }
    }
    if (
      converging.current &&
      target !== null &&
      dataRef.current.length > 0 &&
      Math.abs(
        el.scrollTop -
          Math.max(0, Math.min(target, g.total - el.clientHeight)),
      ) <= 4
    ) {
      converging.current = false
    }
    // In end mode the window must cover the DESIRED bottom, not the stale
    // scrollTop — otherwise a newly appended tail row never enters the
    // window and its growth is invisible to the geometry.
    const desiredTop =
      mode.current.kind === 'end'
        ? geo.current.total - el.clientHeight - mode.current.distance
        : el.scrollTop
    setWindowIfChanged(computeWindow(el, desiredTop))
    // Entry/exit claim: if scrollTop moved during this pass — by our write OR
    // by a SILENT BROWSER CLAMP during a transient layout (spacers not yet
    // caught up with a window shift, an estimate replaced by a smaller
    // measured size) — the movement is machinery-induced, and the coalesced
    // scroll event that dispatches next frame will carry the CURRENT value.
    // Claim it, or that event is misread as a user scroll and hijacks the
    // mode. User input cannot move scrollTop inside synchronous JS
    // (compositor scrolls land at frame boundaries), so this never swallows
    // a real gesture.
    if (el.scrollTop !== entryScrollTop) progTarget.current = el.scrollTop
  }, [recompute])

  // Data identity change (append / chunk growth) also invalidates geometry.
  const prevData = React.useRef(data)
  if (prevData.current !== data) {
    prevData.current = data
    geoChanged.current = true
  }

  // Runs after EVERY commit — this is the pre-paint correction slot.
  React.useLayoutEffect(() => {
    syncAndRestore()
  })

  // Initial landing: window over the tail (estimates only), then the main
  // layout effect measures and restores to the bottom.
  React.useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    recompute()
    setWindowIfChanged(computeWindow(el, geo.current.total - el.clientHeight))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const measureModeRef = React.useRef(measureMode)
  measureModeRef.current = measureMode

  // In 'sync' mode the RO is only a backstop for out-of-commit size changes
  // (images, fonts). In 'ro' mode it IS the measurement pipeline: sizes come
  // from the observed border-box (no forced layout anywhere).
  const roRef = React.useRef(null)
  if (roRef.current === null && typeof ResizeObserver !== 'undefined') {
    roRef.current = new ResizeObserver((entries) => {
      if (measureModeRef.current === 'ro') {
        for (const entry of entries) {
          const key = entry.target.dataset.pkey
          if (key === undefined) continue
          const px =
            entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
          if (px > 0 && sizes.current.get(key) !== px) {
            sizes.current.set(key, px)
            geoChanged.current = true
          }
        }
      }
      syncAndRestore()
    })
  }
  React.useEffect(() => () => roRef.current?.disconnect(), [])

  // Imperative API. scrollToDistanceFromBottomPx is a DECLARATION, not a
  // scroll action: it re-points the reference frame and lets the restore
  // loop converge — the window is computed from the desired bottom first,
  // so the destination renders before the position lands (committed
  // semantics; no blank flash on long jumps).
  if (apiRef) {
    apiRef.current = {
      scrollToDistanceFromBottomPx: (px = 0) => {
        mode.current = { kind: 'end', distance: px }
        converging.current = true
        geoChanged.current = true
        syncAndRestore()
      },
    }
  }

  const onScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    const isEcho =
      progTarget.current !== null &&
      Math.abs(el.scrollTop - progTarget.current) <= 1
    // STICKY echo: k offset changes within one frame queue up to k scroll
    // events, dispatched across successive frames, EACH reading the same
    // final scrollTop. A consume-once slot matches the first and misreads
    // every duplicate as a user scroll. Keep the expectation while events
    // match; only a NON-matching event (a real user scroll) clears it.
    if (!isEcho) progTarget.current = null
    const movedUp =
      lastEventST.current !== null && el.scrollTop < lastEventST.current - 1
    lastEventST.current = el.scrollTop
    if (!isEcho && !converging.current) {
      const g = geo.current
      const dist = el.scrollHeight - el.clientHeight - el.scrollTop
      if (dist <= 4 || g.keys.length === 0) {
        mode.current = { kind: 'end', distance: 0 }
      } else if (mode.current.kind === 'anchor' || movedUp) {
        const idx = indexAt(el.scrollTop)
        mode.current = {
          kind: 'anchor',
          key: g.keys[idx],
          viewportOffset: g.offsets[idx] - el.scrollTop,
        }
      }
      // else: END mode and scrollTop did not move up — a user cannot be
      // scrolling away from the bottom without decreasing scrollTop, so this
      // event is machinery (tail growth re-pins, external bottom writes,
      // clamp echoes that slipped past the claims). Keep following.
    }
    setWindowIfChanged(computeWindow(el))
  }

  // Intent signals break convergence early: wheel/touchstart are USER INPUT,
  // unlike scroll events (which mix in our own writes and clamps).
  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const cancel = () => {
      converging.current = false
    }
    el.addEventListener('wheel', cancel, { passive: true })
    el.addEventListener('touchstart', cancel, { passive: true })
    return () => {
      el.removeEventListener('wheel', cancel)
      el.removeEventListener('touchstart', cancel)
    }
  }, [])

  const rowRef = (key) => (el) => {
    if (el) {
      rowEls.current.set(key, el)
      roRef.current?.observe(el)
    } else {
      const prev = rowEls.current.get(key)
      if (prev) roRef.current?.unobserve(prev)
      rowEls.current.delete(key)
    }
  }

  const children = [
    h('div', { key: '__top', ref: spacerTopRef, 'aria-hidden': true }),
  ]
  if (win.end >= win.start) {
    for (let i = win.start; i <= Math.min(win.end, data.length - 1); i++) {
      const key = keyExtractor(data[i], i)
      children.push(
        h(
          'div',
          { key, ref: rowRef(key), 'data-pkey': key },
          renderItem({ item: data[i], index: i }),
        ),
      )
    }
  }
  children.push(
    h('div', { key: '__bottom', ref: spacerBottomRef, 'aria-hidden': true }),
  )

  return h(
    'div',
    {
      ref: scrollerRef,
      onScroll,
      className,
      style: {
        overflowY: 'auto',
        overflowAnchor: 'none',
        position: 'relative',
        ...style,
      },
    },
    children,
  )
}
