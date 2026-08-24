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

// "Did the declarative target land?" — a convergence tolerance, deliberately
// NOT the same knob as `endThreshold` (which is a user-intent question).
const CONVERGE_EPSILON_PX = 4

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
    // ATTACH MODE. By default the list renders its own scroll container. Pass
    // the caller's scroll element instead and it renders a bare fragment
    // (spacers + windowed rows) into whatever container the caller already
    // owns — the shape a design system needs, where the layout component owns
    // the scroller and the virtualizer is one participant in it. Pass the
    // ELEMENT, not a ref: a parent's ref attaches after its children's layout
    // effects, so a ref would still read null on the commit that matters,
    // while state holding the element re-renders with it available. Pass
    // null (not undefined) while the element is pending: absent = own-
    // container mode, null = attach mode waiting — falling back to the own
    // container for even one commit inside a parent that doesn't bound its
    // height lets clientHeight equal the content height, the window covers
    // every row, and the next commit tears the full tree back down
    // (measured: 2000 astryx messages mounted + removed, 10s of boot spent
    // in removeChild and astryx context reads).
    scrollElement,
    // How close to the bottom (px) a user scroll must land to re-engage
    // follow-at-end. This is the RE-ENGAGE condition only — disengaging is
    // upward movement past it. Default 24 follows ChatGPT's transcript, the
    // one value in this space tuned on a production chat surface; TanStack
    // defaults to 1px and LegendList to 10% of the viewport, so the useful
    // range is wide. Too tight and a user who stops "visually at the bottom"
    // (trackpad inertia, fractional row heights, page zoom) silently stops
    // following while output grows below them.
    endThreshold = 24,
    overscanTop = 1600,
    overscanBottom = 600,
    style,
    className,
  } = props

  const ownScrollerRef = React.useRef(null)
  const attachMode = scrollElement !== undefined
  // Single accessor so every pass reads the live element in either mode.
  // In attach mode a pending (null) element makes every pass bail rather
  // than falling back to the own container.
  const getScroller = () =>
    attachMode ? scrollElement : ownScrollerRef.current
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
  // Last scrollTop observed by a scroll event, and the px the user has moved
  // away from where the machinery last placed them — the end→anchor decision
  // runs on the latter (see onScroll).
  const lastEventST = React.useRef(null)
  const userAway = React.useRef(0)
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
    const top = (desiredTop ?? el.scrollTop) - originRef.current
    const start = indexAt(Math.max(0, top - overscanTop))
    const bottomEdge = top + el.clientHeight + overscanBottom
    // When the query reaches past the content, include the last row by
    // construction instead of by binary search: a zero-height final row sits
    // AT total, which the search (offsets[i] <= total - 1) can never select.
    const end =
      bottomEdge >= g.total ? g.keys.length - 1 : indexAt(bottomEdge)
    return { start, end }
  }

  const setWindowIfChanged = (next) => {
    const cur = winRef.current
    if (next.start !== cur.start || next.end !== cur.end) {
      geoChanged.current = true
      setWin(next)
    }
  }

  // Size both spacers so the mounted window occupies its true place in the
  // scroll range, under whatever geometry is current.
  const writeSpacers = (w) => {
    const g = geo.current
    const empty = w.end < w.start || g.offsets.length === 0
    const top = empty ? 0 : g.offsets[w.start]
    const belowEnd = empty
      ? 0
      : w.end + 1 < g.offsets.length
        ? g.offsets[w.end + 1]
        : g.total
    if (spacerTopRef.current) spacerTopRef.current.style.height = `${top}px`
    if (spacerBottomRef.current)
      spacerBottomRef.current.style.height = `${Math.max(0, g.total - belowEnd)}px`
  }

  // Where a row identity + viewport offset puts scrollTop under the current
  // geometry, and the reverse: the anchor for whatever is at a scroll offset.
  const anchorAt = (scrollTop) => {
    const g = geo.current
    const y = scrollTop - originRef.current
    const idx = indexAt(y)
    return {
      kind: 'anchor',
      key: g.keys[idx],
      viewportOffset: g.offsets[idx] - y,
    }
  }

  // Scroll offset at which our content starts. Zero when we own the scroller;
  // in attach mode the caller's container can put padding, a header or a
  // sticky region above us, and every offset in `geo` is relative to our first
  // spacer rather than to the scroll box.
  const originRef = React.useRef(0)
  // Content the caller renders BELOW our fragment (in ChatLayout, the dock
  // overflow: the scroller deliberately overflows by the composer height so
  // the tail can scroll clear of it). End mode must scroll past it, or the
  // last message parks underneath the overlay (measured: constant 174px).
  const belowRef = React.useRef(0)
  const measureOrigin = (el) => {
    if (!scrollElement) return 0
    const top = spacerTopRef.current
    if (!top) return originRef.current
    originRef.current =
      top.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
    belowRef.current = Math.max(
      0,
      el.scrollHeight - originRef.current - geo.current.total,
    )
    return originRef.current
  }

  // Desired scrollTop for a reference frame, clamped to the scrollable range.
  // null when the anchored row no longer exists in the data.
  const targetFor = (m, el) => {
    const g = geo.current
    const origin = originRef.current
    let raw
    const below = belowRef.current
    if (m.kind === 'end')
      raw = origin + g.total + below - el.clientHeight - m.distance
    else {
      const idx = g.keys.indexOf(m.key)
      if (idx < 0) return null
      raw = origin + g.offsets[idx] - m.viewportOffset
    }
    return Math.max(0, Math.min(raw, origin + g.total + below - el.clientHeight))
  }

  // The single correction pass: spacers(old geo) -> measure -> recompute ->
  // spacers(new geo) -> restore.
  const syncAndRestore = React.useCallback(() => {
    const el = getScroller()
    if (!el) return
    const entryScrollTop = el.scrollTop
    // Phase 0 — spacers FIRST, from the pre-measure geometry: a window-shift
    // commit swaps rows before the layout effect runs, so without this the
    // first forced layout below sees new rows + stale spacers, the content
    // height transiently collapses, and the browser clamps scrollTop (which
    // then reads as a user scroll). Style writes don't force layout, so
    // making the spacers consistent BEFORE the first offsetHeight read
    // removes the collapse window entirely.
    writeSpacers(winRef.current)
    measureOrigin(el)
    // Refresh the anchor from the LIVE scrollTop against the pre-measure
    // geometry (= what's currently painted). scroll events lag rAF-driven
    // scrolls by a frame; scrollTop itself is ground truth, so deriving the
    // anchor here removes that staleness class entirely.
    if (
      mode.current.kind === 'anchor' &&
      // ...but NOT while converging: then the anchor is a DECLARATION (an
      // imperative anchorToKey), and re-deriving it from the live scrollTop
      // would immediately overwrite the destination with wherever we happen
      // to be standing — the same protection end-mode targets already get.
      !converging.current &&
      geo.current.keys.length > 0
    ) {
      mode.current = anchorAt(el.scrollTop)
    }
    // 'sync' re-measures the whole window every commit. 'ro' only measures
    // rows it has never seen — the first-mount backstop: an UNMEASURED row is
    // about to paint at its real height while the geometry still carries its
    // estimate, and in document flow that displaces everything below it (the
    // whole viewport) by (real - est) for one frame, then snaps back when RO
    // delivers. Measuring ONCE at mount closes that; growth and reflow of
    // known rows stay on the RO pipeline, so steady-state commits force no
    // layout at all.
    const remeasureAll = measureModeRef.current === 'sync'
    for (const [key, rowEl] of rowEls.current) {
      if (!remeasureAll && sizes.current.has(key)) continue
      const px = rowEl.offsetHeight
      // Never record 0: a row measured while transiently EMPTY (a streaming
      // reply's first commit) would otherwise pin offsets[last] == total,
      // which no bottom-edge query can reach — the row is evicted from the
      // window and, unmounted, can never be re-measured. Deadlock, measured:
      // the streamed reply never rendered at all. Keeping the estimate keeps
      // the row reachable until it has real height.
      if (px === 0) continue
      if (sizes.current.get(key) !== px) {
        sizes.current.set(key, px)
        geoChanged.current = true
      }
    }
    recompute()
    writeSpacers(winRef.current)

    // restore scrollTop from the stored reference frame
    if (converging.current) geoChanged.current = true
    const target = targetFor(mode.current, el)
    if (target !== null && geoChanged.current) {
      geoChanged.current = false
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
      Math.abs(el.scrollTop - target) <= CONVERGE_EPSILON_PX
    ) {
      converging.current = false
    }
    // The window must cover the DESIRED position, not the stale scrollTop:
    // in end mode a newly appended tail row would otherwise never enter the
    // window and its growth stay invisible to the geometry; for a declared
    // anchor it is what renders the destination before the position lands.
    setWindowIfChanged(computeWindow(el, target === null ? el.scrollTop : target))
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
    const el = getScroller()
    if (!el) return
    recompute()
    setWindowIfChanged(computeWindow(el, geo.current.total - el.clientHeight))
    // In attach mode the element arrives a render late (the caller holds it in
    // state), so the landing keys off it rather than firing once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollElement])

  const measureModeRef = React.useRef(measureMode)
  measureModeRef.current = measureMode
  const endThresholdRef = React.useRef(endThreshold)
  endThresholdRef.current = endThreshold

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
      // Hold one row at a fixed viewport offset (0 = its top edge at the
      // viewport top — the "pin the new prompt to the top" pattern). Same
      // declaration semantics; the reference frame just becomes a row
      // identity instead of the bottom edge, so rows resizing above it are
      // absorbed. Note the position still clamps to the scrollable range:
      // pinning a row near the end needs reserved space below it, which
      // this primitive does not provide yet.
      anchorToKey: (key, viewportOffset = 0) => {
        mode.current = { kind: 'anchor', key, viewportOffset }
        converging.current = true
        geoChanged.current = true
        syncAndRestore()
      },
    }
  }

  const onScroll = () => {
    const el = getScroller()
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
    const prevEventST = lastEventST.current
    lastEventST.current = el.scrollTop
    if (!isEcho && !converging.current) {
      const g = geo.current
      const dist = el.scrollHeight - el.clientHeight - el.scrollTop
      const anchorHere = () => {
        mode.current = anchorAt(el.scrollTop)
        userAway.current = 0
      }
      if (g.keys.length === 0) {
        mode.current = { kind: 'end', distance: 0 }
        userAway.current = 0
      } else if (mode.current.kind === 'end') {
        // DISENGAGE is judged on the user's own displacement, never on the
        // absolute distance to the bottom: while following, the tail grows
        // between corrections, so the live distance carries machinery
        // movement the user did not make (measured: 6-24px nudges reading as
        // 25-59px, flipping to anchor and stranding the reader mid-stream).
        // Accumulating means a slow, persistent upward scroll still wins even
        // when each individual step is erased by a re-pin.
        userAway.current = Math.max(0, userAway.current + (prevEventST === null ? 0 : prevEventST - el.scrollTop))
        if (userAway.current > endThresholdRef.current) anchorHere()
      } else if (dist <= endThresholdRef.current) {
        // RE-ENGAGE is judged on the absolute distance, which IS honest in
        // anchor mode: nothing is pulling the viewport, so reaching the
        // bottom is the user's own doing.
        mode.current = { kind: 'end', distance: 0 }
        userAway.current = 0
      } else {
        anchorHere()
      }
    }
    setWindowIfChanged(computeWindow(el))
  }

  // The listener is attached once per scroll element but the handler is read
  // live, so it never closes over a stale render's props.
  const onScrollRef = React.useRef(onScroll)
  onScrollRef.current = onScroll

  // Listeners are attached imperatively rather than through JSX so both modes
  // take the same path, and so attach mode can also turn OFF the browser's own
  // scroll anchoring on a container it does not render: native anchoring picks
  // its own anchor node and adjusts scrollTop underneath us, which is exactly
  // the job this list is doing from its own reference frame.
  React.useEffect(() => {
    const el = getScroller()
    if (!el) return
    // Intent signals break convergence early: wheel/touchstart are USER INPUT,
    // unlike scroll events (which mix in our own writes and clamps).
    const cancel = () => {
      converging.current = false
    }
    const prevAnchor = el.style.overflowAnchor
    el.style.overflowAnchor = 'none'
    const scrollHandler = () => onScrollRef.current()
    el.addEventListener('scroll', scrollHandler, { passive: true })
    el.addEventListener('wheel', cancel, { passive: true })
    el.addEventListener('touchstart', cancel, { passive: true })
    return () => {
      el.style.overflowAnchor = prevAnchor
      el.removeEventListener('scroll', scrollHandler)
      el.removeEventListener('wheel', cancel)
      el.removeEventListener('touchstart', cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollElement])

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

  if (attachMode) return h(React.Fragment, null, children)

  return h(
    'div',
    {
      ref: ownScrollerRef,
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
