import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
// @ts-expect-error - ballast ships plain .mjs with no types
import { Ballast } from 'ballast'
import {
  markFirstPaint,
  markMountEnd,
  markMountStart,
  registerHarness,
} from '../lib/harness'
import { makeDataset } from '../lib/dataset'
import type { ScenarioInput } from '../scenarios/types'

interface Props {
  scenario: ScenarioInput
  measureMode: 'ro' | 'sync'
}

export function BallastPage({ scenario, measureMode }: Props) {
  const items = useMemo(
    () =>
      makeDataset(
        scenario.count,
        scenario.dynamic,
        scenario.action === 'jump-wide-variance-accuracy',
      ),
    [scenario.count, scenario.dynamic, scenario.action],
  )

  // ATTACH MODE: ballast wants the scroll ELEMENT, not a ref (a parent ref
  // attaches after its children's layout effects). null = "attach mode,
  // pending"; undefined would mean "own container", which would mount every
  // row for one commit.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const api = useRef<any>(null)

  // Every other library page mounts scrolled to the TOP. ballast's default
  // reference frame is follow-at-end, so without this it would already be
  // sitting on the jump-to-end target before the scenario starts. Declare
  // row 0 at the viewport top so all arms share a starting position.
  useLayoutEffect(() => {
    if (!host) return
    ;(window as any).__ballastApi = api
    // ?noTopAnchor=1 skips this, to check whether the start-at-top
    // declaration is implicated in any failure.
    const skip = new URLSearchParams(location.search).get('noTopAnchor') === '1'
    if (!skip) api.current?.anchorToKey('0', 0)
  }, [host])

  useEffect(() => {
    if (!host) return
    registerHarness({
      getScrollContainer: () => host,
      getTotalSize: () => api.current?.__debug()?.total ?? 0,
      scrollToIndex: (i, opts) => {
        const a = api.current
        if (!a) return
        if (opts?.align === 'end') {
          if (i >= scenario.count - 1) {
            // Last row's bottom at the viewport bottom IS ballast's native
            // coordinate: distance-from-bottom 0.
            a.scrollToDistanceFromBottomPx(0)
          } else {
            // Not exercised by this suite. Best effort: put the row's top far
            // enough down that its bottom lands at the viewport bottom.
            const row = host.querySelector(
              `[data-index="${i}"]`,
            ) as HTMLElement | null
            const rowH = row?.offsetHeight ?? scenario.itemSize
            a.anchorToKey(String(i), host.clientHeight - rowH)
          }
        } else {
          a.anchorToKey(String(i), 0)
        }
      },
      isFullyMeasured: () => true,
    })
    markMountEnd()
    markFirstPaint()
  }, [host, scenario.count, scenario.itemSize])

  return (
    <div
      ref={setHost}
      className="scroll-host"
      data-bench-scroll-host={`ballast-${measureMode}`}
    >
      <Ballast
        apiRef={api}
        scrollElement={host}
        data={items}
        measureMode={measureMode}
        estimatedItemSize={scenario.itemSize}
        keyExtractor={(it: { id: number }) => it.id}
        renderItem={({
          item,
          index,
        }: {
          item: (typeof items)[number]
          index: number
        }) => (
          <div
            data-index={index}
            className={'item ' + (index % 2 === 0 ? 'even' : '')}
            style={{
              minHeight: scenario.dynamic ? undefined : scenario.itemSize,
            }}
          >
            {item.text}
          </div>
        )}
      />
    </div>
  )
}

export function BallastPageRoot({ scenario, measureMode }: Props) {
  markMountStart()
  return <BallastPage scenario={scenario} measureMode={measureMode} />
}
