/**
 * Canvas ring gauges for the floating window, ported from zcode-speed-panel's
 * `gauges.ts`: the main ring arcs from 135° through a 270° sweep with the gap at
 * the bottom, the value eases toward its target, and the scale grows to the peak
 * instantly but shrinks back slowly so a decay never looks like a full run.
 *
 * The badge ring shows the latest completed step's average, so it never has an
 * estimate state — a settled figure is never "still measuring".
 */
import { useEffect, useRef } from 'react'
import { NO_SPEED_COLOR, SPEED_TIERS, scaleFor, speedTierIndex } from './pets.ts'
import { formatTps } from './speed-reading.ts'

/** A box whose latest value is read on every frame (a mutable ref). */
interface Latest<T> {
  current: T
}

/** Arc start angle and sweep: 270° with the gap at the bottom. */
const A0 = Math.PI * 0.75
const SWEEP = Math.PI * 1.5
const EST_COLOR = '#fbbf24'
const VALUE_COLOR = '#e6e9f0'
const TRACK_COLOR = 'rgba(255,255,255,0.08)'

/** Smallest scale either ring shows, in tokens/sec (the shipped pair share it). */
const MIN_SCALE = 60
/** Rate the indicator eases toward its target (per second). */
const EASE_RATE = 7
/** Rate an oversized scale shrinks back (per second). */
const SHRINK_RATE = 1.2

/** Default font when the host theme exposes no family. */
const FALLBACK_FONT = '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif'

/** What the live ring is showing. */
export interface LiveGaugeInput {
  /** Measured tokens/sec. */
  readonly tps: number
  /** Whether the reading is an estimate rather than measured output. */
  readonly estimating: boolean
  /** Whether work is connected but has produced no token yet (first-token wait). */
  readonly starting: boolean
}

/** One frame's eased ring state. */
interface GaugeFrame {
  /** Eased reading. */
  readonly value: number
  /** Fraction of the scale the indicator covers. */
  readonly fraction: number
  /** Breathing phase 0..1 of the first-token wait. */
  readonly pulse: number
}

/** Cached theme colors, read on first paint: text that survives both themes. */
let themeCache: { font: string, label: string, value: string } | null = null

/** The host theme's font and label colors, or system fallbacks. */
function theme(): { font: string, label: string, value: string } {
  themeCache ??= (() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      font: styles.getPropertyValue('--dsw-font-family').trim() || FALLBACK_FONT,
      label: styles.getPropertyValue('--dsw-alias-label-secondary').trim() || NO_SPEED_COLOR,
      value: styles.getPropertyValue('--dsw-alias-label-primary').trim() || VALUE_COLOR,
    }
  })()
  return themeCache
}

/** Band color of one speed, or the neutral color for no reading. */
function tierColor(tps: number): string {
  return tps > 0 ? (SPEED_TIERS[speedTierIndex(tps)]?.color ?? NO_SPEED_COLOR) : NO_SPEED_COLOR
}

/** One canvas fitted to its CSS box at the device pixel ratio. */
function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D, w: number, h: number } | null {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w < 8 || h < 8) return null
  const dpr = window.devicePixelRatio || 1
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return { ctx, w, h }
}

/** Eased value and peak-tracking scale shared by both rings. */
class Ring {
  private value = 0
  private target = 0
  private max: number

  /** @param minScale - smallest scale the ring ever shows. */
  constructor(private readonly minScale: number) {
    this.max = minScale
  }

  /**
   * Advance the easing and the scale.
   * @param target - this frame's reading, in tokens/sec.
   * @param dt - seconds since the previous frame.
   * @returns the fraction of the scale the indicator now covers.
   */
  step(target: number, dt: number): number {
    this.target = Number.isFinite(target) && target > 0 ? target : 0
    this.value += (this.target - this.value) * (1 - Math.exp(-dt * EASE_RATE))
    if (Math.abs(this.target - this.value) < 0.005) this.value = this.target
    // The scale follows the peak: it grows at once and shrinks slowly, so a
    // falling reading never drains from a full ring in a single frame.
    const desired = scaleFor(Math.max(this.value, this.target), this.minScale)
    if (desired > this.max) this.max = desired
    else if (desired < this.max) this.max += (desired - this.max) * (1 - Math.exp(-dt * SHRINK_RATE))
    return Math.max(0.0001, Math.min(1, this.value / this.max))
  }

  /** Eased reading. */
  get reading(): number {
    return this.value
  }
}

/**
 * The floating window's main ring: the live reading in its speed band's color.
 * @param props - live input and the canvas class.
 * @returns the canvas element.
 */
export function LiveGauge({ input, className }: {
  readonly input: LiveGaugeInput
  readonly className: string | undefined
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    return runGaugeLoop(canvas, inputRef, drawLive)
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/**
 * The badge ring: the latest completed step's average speed.
 * @param props - the settled speed and the canvas class.
 * @returns the canvas element.
 */
export function LastGauge({ tps, className }: {
  readonly tps: number
  readonly className: string | undefined
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tpsRef = useRef(tps)
  tpsRef.current = tps

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    return runGaugeLoop(canvas, tpsRef, drawBadge)
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/**
 * Drive one ring on the animation clock until the effect is disposed.
 * @param canvas - the ring's canvas.
 * @param sourceRef - latest reading, re-read every frame.
 * @param draw - the ring's painter.
 * @returns the teardown.
 */
function runGaugeLoop<T>(
  canvas: HTMLCanvasElement,
  sourceRef: Latest<T>,
  draw: (canvas: HTMLCanvasElement, frame: GaugeFrame, source: T) => void,
): () => void {
  const ring = new Ring(MIN_SCALE)
  let raf = 0
  let disposed = false
  let last = performance.now()
  // A canvas that cannot hand out a 2D context (a DOM test environment with no
  // canvas backend) would otherwise keep scheduling frames that draw nothing.
  if (canvas.getContext('2d') === null) return () => {}

  const tick = (now: number): void => {
    if (disposed) return
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    const source = sourceRef.current
    const fraction = ring.step(targetOf(source), dt)
    draw(canvas, { value: ring.reading, fraction, pulse: 0.5 + 0.5 * Math.sin(now / 300) }, source)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    disposed = true
    cancelAnimationFrame(raf)
  }
}

/**
 * The reading one ring's source carries.
 * @param source - live input or a settled speed.
 * @returns tokens/sec.
 */
function targetOf(source: unknown): number {
  return typeof source === 'number' ? source : (source as LiveGaugeInput).tps
}

/**
 * Paint the live ring.
 * @param canvas - target canvas.
 * @param frame - eased state of this frame.
 * @param input - live reading of this frame.
 */
function drawLive(canvas: HTMLCanvasElement, frame: GaugeFrame, input: LiveGaugeInput): void {
  const fit = fitCanvas(canvas)
  if (fit === null) return
  const { ctx, w, h } = fit
  const cx = w / 2
  const r = Math.min(w, h) * 0.36
  // The arc's low endpoints and their round caps sit 8px above the canvas
  // bottom, mirroring the badge's 8px inset from the top.
  const cy = h - 8 - (r * Math.SQRT1_2 + 3.5)
  const colors = theme()

  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.strokeStyle = TRACK_COLOR
  ctx.beginPath()
  ctx.arc(cx, cy, r, A0, A0 + SWEEP)
  ctx.stroke()

  if (input.starting) {
    ctx.save()
    ctx.globalAlpha = 0.45 + 0.55 * frame.pulse
    ctx.shadowColor = '#22d3ee'
    ctx.shadowBlur = 9
    ctx.strokeStyle = '#22d3ee'
    ctx.beginPath()
    ctx.arc(cx, cy, r, A0, A0 + SWEEP * (0.05 + 0.06 * frame.pulse))
    ctx.stroke()
    ctx.restore()
  } else {
    const color = input.estimating ? EST_COLOR : tierColor(frame.value)
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 9
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, r, A0, A0 + SWEEP * frame.fraction)
    ctx.stroke()
    ctx.restore()
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = frame.value <= 0 || input.estimating ? colors.value : tierColor(frame.value)
  if (input.starting) ctx.globalAlpha = 0.45 + 0.55 * frame.pulse
  const main = input.starting ? '…' : `${input.estimating ? '≈' : ''}${formatTps(frame.value)}`
  ctx.font = `600 ${Math.round(r * 0.46)}px ${colors.font}`
  ctx.fillText(main, cx, cy + r * 0.12)
  ctx.globalAlpha = 1
  ctx.fillStyle = colors.label
  ctx.font = `9px ${colors.font}`
  ctx.fillText('t/s', cx, cy + r * 0.55)
}

/**
 * Paint the badge ring.
 * @param canvas - target canvas.
 * @param frame - eased state of this frame.
 * @param tps - the settled speed; 0 when no call has completed.
 */
function drawBadge(canvas: HTMLCanvasElement, frame: GaugeFrame, tps: number): void {
  const fit = fitCanvas(canvas)
  if (fit === null) return
  const { ctx, w, h } = fit
  const cx = w / 2
  const cy = h * 0.4
  const r = Math.min(w, h) * 0.34
  const color = tierColor(frame.value)
  const colors = theme()

  ctx.lineCap = 'round'
  ctx.lineWidth = 5
  ctx.strokeStyle = TRACK_COLOR
  ctx.beginPath()
  ctx.arc(cx, cy, r, A0, A0 + SWEEP)
  ctx.stroke()

  if (frame.value > 0) {
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, r, A0, A0 + SWEEP * frame.fraction)
    ctx.stroke()
    ctx.restore()
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const main = formatTps(frame.value)
  let fs = Math.round(r * 0.68)
  ctx.font = `600 ${fs}px ${colors.font}`
  while (fs > 9 && ctx.measureText(main).width > r * 1.6) {
    fs -= 1
    ctx.font = `600 ${fs}px ${colors.font}`
  }
  ctx.fillStyle = color
  ctx.fillText(main, cx, cy + 1)
  ctx.fillStyle = colors.label
  ctx.font = `8px ${colors.font}`
  // The badge is the settled figure, so its caption never changes.
  ctx.fillText(tps > 0 ? '上轮' : '--', cx, cy + r * 0.62)
}
