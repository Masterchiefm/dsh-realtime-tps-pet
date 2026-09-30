/**
 * The `shell.overlay` speed entry, in one of three forms: the animated sprite
 * pet with its speed bubble, the ring gauge with a badge ring for the last
 * completed call, or the compact capsule. Every form follows the main-view
 * Session, drags anywhere, and persists its placement and form.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { MainViewSpeed } from './speed-source.ts'
import { NS } from './locales.ts'
import {
  calibrationRatio, formatTps, hasCalibration, liveReading, settledReading,
  type SpeedSettledSample,
} from './speed-reading.ts'
import { PET_PACKS, packById, speedColor } from './pets.ts'
import { type createSpeedPetStore } from './store.ts'
import { LastGauge, LiveGauge } from './gauge.tsx'
import { SpritePet } from './sprite-pet.tsx'
import css from './SpeedPet.module.css'

/** Wall-clock refresh of the reading while a step is generating. */
const PET_TICK_MS = 400

/** Smallest viewport inset the window can be dragged to. */
const DRAG_MARGIN = 8

/** Stable empty settled history for sessions without samples. */
const NO_SETTLED: readonly SpeedSettledSample[] = []

/** Zero-size rect the portal anchors its list to. */
function anchorRectAt(x: number, y: number): DOMRect {
  return new DOMRect(x, y, 0, 0)
}

/** Combined display phase of the newest step. */
type PetPhase = 'idle' | 'awaiting' | 'streaming' | 'stalled'

/** Registration-side business face for the pet entry. */
export interface SpeedPetInjected {
  hooks: {
    /** Main-view session id and its live speed snapshot, bound by the renderer as useSpeed. */
    speed: {
      getSnapshot(): MainViewSpeed
      subscribe(listener: () => void): () => void
    }
  }
}

/** Full props for the shell-overlay pet entry. */
export type SpeedPetProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & PropsStore<ReturnType<typeof createSpeedPetStore>>
  & InjectFace<SpeedPetInjected>

/** Viewport insets of the window's bottom-right anchor. */
interface Placement {
  readonly right: number
  readonly bottom: number
}

function clampPlacement(right: number, bottom: number): Placement {
  return {
    right: Math.min(Math.max(right, DRAG_MARGIN), Math.max(window.innerWidth - DRAG_MARGIN, DRAG_MARGIN)),
    bottom: Math.min(Math.max(bottom, DRAG_MARGIN), Math.max(window.innerHeight - DRAG_MARGIN, DRAG_MARGIN)),
  }
}

/**
 * The floating output-speed window.
 * @param props - the followed main-view speed seat, the placement store, and
 *   the namespace translator.
 * @returns the selected form, or null while no Session is bound or the window
 *   is idle-hidden.
 */
export function SpeedPet({ useSpeed, useStore, useSessionStatus, actions, t }: SpeedPetProps) {
  const { sessionId, snapshot } = useSpeed(state => state)
  const form = useStore(state => state.form)
  const placement = useStore(state => ({ right: state.right, bottom: state.bottom }))
  const hideWhenIdle = useStore(state => state.hideWhenIdle)
  const packId = useStore(state => state.packId)
  const alwaysLast = useStore(state => state.alwaysLast)
  const scale = useStore(state => state.scale ?? 1)
  const term = useStore(state => state.term ?? 'round')
  // The app's own notion of "still working": a command or tool can run with no
  // step streaming, and the window must not fall back to idle for that.
  const active = useSessionStatus(statuses =>
    sessionId === undefined ? false : statuses.get(sessionId)?.running === true)

  const generating = snapshot !== undefined && (snapshot.live !== undefined || snapshot.awaitingFirstToken)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!generating) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, PET_TICK_MS)
    return () => { clearInterval(timer) }
  }, [generating])

  const settled = snapshot?.settled ?? NO_SETTLED
  const ratio = useMemo(() => calibrationRatio(settled), [settled])
  const calibrated = useMemo(() => hasCalibration(settled), [settled])
  const reading = useMemo(
    () => snapshot?.live === undefined ? undefined : liveReading(snapshot.live, ratio, now, calibrated),
    [snapshot?.live, ratio, calibrated, now],
  )
  // The last completed step's average: the adapter's own token count over the
  // pure decode window, falling back to the calibrated estimate only when the
  // call carried no usage at all.
  const lastTps = useMemo(() => {
    const sample = settled.at(-1)
    return sample === undefined ? undefined : settledReading(sample, ratio)
  }, [settled, ratio])
  const lastRound = lastTps ?? 0

  const phase: PetPhase = reading !== undefined
    ? reading.phase
    : snapshot?.awaitingFirstToken === true ? 'awaiting' : 'idle'
  const starting = phase === 'awaiting'
  const live = reading?.tps ?? 0
  // An uncalibrated figure stays marked wherever it shows — streaming, stalled,
  // or between — because the weakness is in the number, not the phase.
  const estimating = reading?.estimation === true

  const [dragging, setDragging] = useState(false)
  const [dragPos, setDragPos] = useState<Placement | undefined>(undefined)
  const dragPosRef = useRef<Placement | undefined>(undefined)
  const dragOrigin = useRef({ x: 0, y: 0 })
  const placementOrigin = useRef<Placement>({ right: 0, bottom: 0 })
  const [hover, setHover] = useState(false)

  const [menuAt, setMenuAt] = useState<{ readonly x: number; readonly y: number } | undefined>(undefined)
  /** Wheel resize target: the window's own scale, not the page's zoom. */
  const rootRef = useRef<HTMLDivElement>(null)

  // A native non-passive listener: React's root-wheel delegation is passive, so
  // preventDefault there would not stop the page from scrolling.
  useEffect(() => {
    const node = rootRef.current
    if (node === null) return
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      event.preventDefault()
      // One notch per event, applied inside the store so a burst of events in a
      // single frame accumulates instead of each reading the same stale scale.
      actions.scaleBy(event.deltaY < 0 ? 1 : -1)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => { node.removeEventListener('wheel', onWheel) }
  }, [actions])

  // Stable identity and a stable rect object: the list's placement loop reads
  // this every animation frame and keys its effect on the callback itself, so a
  // fresh arrow here re-registered the whole tracking loop on every render.
  const getAnchorRect = useCallback(
    (): DOMRect | null => menuAt === undefined ? null : anchorRectAt(menuAt.x, menuAt.y),
    [menuAt],
  )

  if (sessionId === undefined || snapshot === undefined) return null
  // Idle hiding applies to a genuinely idle conversation: while the session is
  // still working (a command or tool running between steps) the window stays.
  if (hideWhenIdle && phase === 'idle' && !active) return null

  const placed = dragPos ?? placement
  const tier = reading?.tier ?? 0

  /** Wheel resize: the window's own scale, not the page's zoom. */
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOrigin.current = { x: event.clientX, y: event.clientY }
    placementOrigin.current = placement
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    const next = clampPlacement(
      placementOrigin.current.right - (event.clientX - dragOrigin.current.x),
      placementOrigin.current.bottom - (event.clientY - dragOrigin.current.y),
    )
    dragPosRef.current = next
    setDragPos(next)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const next = dragPosRef.current ?? placement
    dragPosRef.current = undefined
    setDragging(false)
    setDragPos(undefined)
    actions.moveTo(next.right, next.bottom)
  }

  const pack = packById(packId === '' ? undefined : packId)
  const packIndex = PET_PACKS.findIndex(candidate => candidate.id === pack.id)
  const nextPack = PET_PACKS[(packIndex + 1) % PET_PACKS.length]
  const menuItems: readonly MenuEntry[] = [
    { id: 'form:pet', label: t('menu.form.pet') },
    { id: 'form:gauge', label: t('menu.form.gauge') },
    { id: 'form:capsule', label: t('menu.form.capsule') },
    { type: 'separator', id: 'separator:form' },
    // The finished-call figure is one step of a turn, so both namings are true;
    // the user picks which one the surfaces show.
    { id: 'term:round', label: t('menu.term.round') },
    { id: 'term:step', label: t('menu.term.step') },
    { type: 'separator', id: 'separator:term' },
    // Named for the pack the switch lands on, not the one on screen.
    ...(nextPack === undefined ? [] : [{ id: 'pack', label: t('menu.pack', { name: nextPack.displayName }) }]),
    { id: 'alwaysLast', label: t('menu.alwaysLast') },
    { id: 'hideIdle', label: t('menu.hideIdle') },
  ]
  const selectedIds = [
    `form:${form}`,
    `term:${term}`,
    ...(alwaysLast ? ['alwaysLast'] : []),
    ...(hideWhenIdle ? ['hideIdle'] : []),
  ]

  const activate = (id: string): void => {
    if (id === 'form:pet' || id === 'form:gauge' || id === 'form:capsule') actions.setForm(id.slice('form:'.length) as 'pet' | 'gauge' | 'capsule')
    else if (id === 'term:round' || id === 'term:step') actions.setTerm(id.slice('term:'.length) as 'round' | 'step')
    else if (id === 'pack') {
      const next = PET_PACKS[(packIndex + 1) % PET_PACKS.length]
      if (next !== undefined) actions.setPack(next.id)
    } else if (id === 'alwaysLast') actions.toggleAlwaysLast()
    else if (id === 'hideIdle') actions.toggleHideWhenIdle()
    setMenuAt(undefined)
  }

  // Every surface names the figure through this one choice.
  const lastLabel = t(`speed.last.${term}.label`)
  const lastEmpty = t(`speed.last.${term}.empty`)
  const lastShort = t(`speed.last.${term}.short`)
  const lastTitle = t(`speed.last.${term}.title`)
  const lastLine = lastTps === undefined ? lastEmpty : t(`speed.last.${term}`, { tps: formatTps(lastTps) })

  return (
    <div
      ref={rootRef}
      className={dragging ? `${css.root} ${css.rootDragging}` : css.root}
      style={{ right: placed.right, bottom: placed.bottom, '--pet-scale': scale } as CSSProperties}
      data-phase={phase}
      data-form={form}
      data-tier={tier}
      aria-label={t('pet.aria')}
      tabIndex={0}
      onPointerEnter={() => { setHover(true) }}
      onPointerLeave={() => { setHover(false) }}
      // Capture phase: a press aimed at a menu row must not also start a drag
      // on the window. Propagation stops here, but default must NOT be prevented:
      // default-preventing a pointerdown suppresses the click that follows it,
      // and a menu row's selection is delivered as that click — so cancelling
      // the default makes the first row press only close the menu.
      onPointerDownCapture={(event) => {
        if (menuAt === undefined) return
        event.stopPropagation()
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        actions.setForm(form === 'pet' ? 'gauge' : form === 'gauge' ? 'capsule' : 'pet')
      }}
      onDoubleClick={() => { actions.setForm(form === 'pet' ? 'gauge' : form === 'gauge' ? 'capsule' : 'pet') }}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuAt({ x: event.clientX, y: event.clientY })
      }}
    >
      {form === 'pet'
        ? (
          <SpritePet
            className={css.petCanvas}
            packId={pack.id}
            input={{ running: phase === 'streaming', estimating, tps: live, starting, active, lastTps: lastRound, lastLabel, alwaysLast, hover }}
          />
        )
        : form === 'gauge'
          ? (
            <div className={css.gauge}>
              <LiveGauge
                className={css.gaugeRing}
                input={{ tps: live, estimating, starting }}
              />
              {/* The small ring is the last average; the big one is live only,
                  so no caption repeats the figure and muddles the reading. */}
              <LastGauge className={css.gaugeBadge} tps={lastRound} caption={lastShort} />
            </div>
          )
          : (
            <div className={css.capsule} data-tier={tier}>
              <span className={css.capsuleDot} />
              <span className={css.capsuleBody}>
                <span className={css.capsuleTps} data-idle={phase === 'idle' && !active ? 'true' : undefined} title={starting ? t('pet.waiting.title') : t('pet.live.title')}>
                  {starting
                    ? t('speed.waiting')
                    : phase === 'idle' && !active
                      // Idle carries no live stream: the figure falls back to the
                      // last completed step, dimmed, so the pill never reads 0.
                      ? (lastTps === undefined ? lastEmpty : t('speed.value', { tps: formatTps(lastTps) }))
                      : t('speed.value', { tps: `${estimating ? '≈' : ''}${formatTps(live)}` })}
                </span>
                <span className={css.capsuleLast} style={{ color: speedColor(lastRound) }} title={lastTitle}>
                  {lastLine}
                </span>
              </span>
            </div>
          )}
      <Menu
        open={menuAt !== undefined}
        portal
        anchor={<span className={css.menuAnchor} aria-hidden="true" />}
        getAnchorRect={getAnchorRect}
        items={menuItems}
        selectedIds={selectedIds}
        onSelect={activate}
        onClose={() => { setMenuAt(undefined) }}
      />
    </div>
  )
}
