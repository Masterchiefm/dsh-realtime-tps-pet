/**
 * Canvas sprite pet: the pack's animation rows on a sheet, switched by speed
 * band, with the speed bubble drawn above the sprite. Ported from the
 * zcode-speed-panel pet widget, minus the multi-task rows that have no DSH
 * counterpart.
 *
 * The animation clock, the bubble's expansion and its visibility are all driven
 * by one wall-clock rAF loop rather than React state: the canvas is the only
 * output, so a React render per frame would only add work between the frames.
 */
import { useEffect, useRef } from 'react'
import {
  advanceAnim, animCols, packById, pickIdle, runAnimOf, speedColor, type PetPack,
} from './pets.ts'
import { drawRobot, type RobotPalette } from './robot.ts'
import { formatTps } from './speed-reading.ts'

/** A box whose latest value is read on every frame (a mutable ref). */
interface Latest<T> {
  current: T
}

/** Bubble text colors and the values that are not band-dependent. */
const EST_COLOR = '#fbbf24'
const NEUTRAL_COLOR = '#8b93a7'
const LABEL_COLOR = '#8b93a7'

/** Exponential-smoothing rate of the bubble's expansion and visibility (per second). */
const SMOOTHING = 12

/** Smallest gap kept between the bubble and the canvas edge, in px. */
const EDGE_MARGIN = 2

/** Default font when the host theme exposes no family. */
const FALLBACK_FONT = '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif'

/** Live facts the sprite needs on every frame. */
export interface PetFrameInput {
  /** Whether work is streaming (drives the running animation and the bubble). */
  readonly running: boolean
  /** Whether the reading is an estimate rather than measured output. */
  readonly estimating: boolean
  /** Live tokens/sec of the newest step. */
  readonly tps: number
  /** Whether work is connected but has not produced its first token yet. */
  readonly starting: boolean
  /**
   * Whether the followed session is still busy even though no step is
   * streaming right now (a tool running, a command executing). The bubble then
   * stays up and reports the honest zero instead of dropping to idle.
   */
  readonly active: boolean
  /** Last completed step's average speed; 0 when there is none yet. */
  readonly averageTps: number
  /** Label the average row carries, in the user's chosen naming. */
  readonly averageLabel: string
  /** Whether the bubble stays expanded without hover. */
  readonly alwaysLast: boolean
  /** Whether the pointer is over the widget. */
  readonly hover: boolean
}

/** One bubble row. */
interface BubbleRow {
  readonly label: string
  readonly value: string
  readonly color: string
}

/** Bubble geometry for one frame. */
interface BubbleLayout {
  readonly rows: readonly BubbleRow[]
  /** Expansion progress 0 (live speed only) to 1 (labeled rows). */
  readonly t: number
  readonly fs: number
  readonly labelFs: number
  readonly lineH: number
  readonly gapY: number
  readonly padX: number
  readonly padY: number
  readonly colGap: number
  /** Label column width already scaled by the expansion progress. */
  readonly labelW: number
  readonly boxW: number
  readonly boxH: number
  /** Bottom edge the box grows up from. */
  readonly bottom: number
  /** Visibility 0 to 1. */
  readonly vis: number
}

/** Read one theme token, trimmed; empty when unset. */
function themeValue(styles: CSSStyleDeclaration, token: string): string {
  return styles.getPropertyValue(token).trim()
}

/**
 * The floating sprite pet.
 * @param props - live facts, pack id, and the canvas to draw on.
 * @returns the canvas element.
 */
export function SpritePet({ input, packId, className }: {
  readonly input: PetFrameInput
  readonly packId: string | undefined
  readonly className: string | undefined
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef(input)
  inputRef.current = input
  const packRef = useRef<PetPack>(packById(packId))
  const packSwitch = useRef(false)
  if (packRef.current.id !== packById(packId).id) {
    packRef.current = packById(packId)
    packSwitch.current = true
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    return runPetLoop(canvas, inputRef, packRef)
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/**
 * Drive one canvas from the animation clock until the effect is disposed.
 * @param canvas - the pet's canvas.
 * @param inputRef - latest live facts, re-read every frame.
 * @param packRef - the selected pack; a changed pack restarts the animation.
 * @returns the teardown.
 */
function runPetLoop(
  canvas: HTMLCanvasElement,
  inputRef: Latest<PetFrameInput>,
  packRef: Latest<PetPack>,
): () => void {
  const sprite = new SpriteState()
  let raf = 0
  let disposed = false
  // Load unconditionally, and before the context check: when the persisted pack
  // IS the default the change-detector below never fires and the sheet would
  // never load — the sprite stays blank until the user cycled packs once. A
  // canvas without a 2D context still gets its sheet requested, so the mount
  // path is observable in tests that cannot back a canvas.
  sprite.load(packRef.current, inputRef.current)
  // A canvas that cannot hand out a 2D context (a DOM test environment with no
  // canvas backend) would otherwise keep scheduling frames that draw nothing.
  if (canvas.getContext('2d') === null) return () => {}

  const frame = (now: number): void => {
    if (disposed) return
    if (packRef.current !== sprite.pack) sprite.load(packRef.current, inputRef.current)
    sprite.draw(canvas, now, inputRef.current)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
  }
}

/** Mutable animation, bubble and image state of one canvas. */
class SpriteState {
  pack: PetPack = packById(undefined)
  private img: HTMLImageElement | null = null
  private anim = 'idle'
  /** Position inside the current animation's column list. */
  private seq = 0
  private lastFrameAt = 0
  /** Numeric speed, for band selection. */
  private tpsNum = 0
  /** Which way the top two bands face; flipped每 pass. */
  private fastDir = true
  private running = false
  private estimating = false
  private starting = false
  /** Whether the followed session is busy without a streaming step. */
  private active = false
  private averageTps = 0
  /** Row label of the average, from the reading the menu selected. */
  private averageLabel = ''
  private alwaysLast = false
  private hover = false
  /** Smoothed expansion progress. */
  private expandT = 0
  /** Smoothed visibility. */
  private visT = 0
  private lastDrawAt = 0
  /** Cached font family of the host theme. */
  private font: string | null = null

  /**
   * Adopt one pack, restarting its animation and reloading its sheet.
   * @param pack - the pack to show.
   * @param input - current facts, so the first animation matches the phase.
   */
  load(pack: PetPack, input: PetFrameInput): void {
    this.pack = pack
    this.img = null
    this.running = input.running
    this.anim = input.running ? runAnimOf(input.tps, this.fastDir) : pickIdle(pack)
    this.seq = 0
    // A vector pack draws itself: no sheet to fetch.
    if (pack.kind === 'vector') return
    const img = new Image()
    img.src = pack.sheet
    img.onload = () => { this.img = img }
  }

  /**
   * Draw one frame.
   * @param canvas - target canvas.
   * @param now - frame timestamp from the animation clock.
   * @param input - live facts of this render.
   */
  draw(canvas: HTMLCanvasElement, now: number, input: PetFrameInput): void {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w < 8 || h < 8) return
    const dpr = window.devicePixelRatio || 1
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    this.adopt(input)
    const dt = Math.min(0.1, Math.max(0, (now - this.lastDrawAt) / 1000))
    this.lastDrawAt = now
    const wantExpand = this.hover || this.alwaysLast ? 1 : 0
    // An unfinished conversation keeps the bubble up: while a command runs the
    // live figure is honestly zero, which is information, not idle.
    const wantVis = this.hover || this.running || this.estimating || this.starting || this.active ? 1 : 0
    this.expandT = smooth(this.expandT, wantExpand, dt)
    this.visT = smooth(this.visT, wantVis, dt)

    // The row-completion rule lives in the pure advance, so the clock here only
    // supplies the frame boundary.
    const advanced = advanceAnim(
      this.pack,
      { anim: this.anim, seq: this.seq, fastDir: this.fastDir },
      this.running,
      this.tpsNum,
      now,
      this.lastFrameAt,
    )
    this.anim = advanced.state.anim
    this.seq = advanced.state.seq
    this.fastDir = advanced.state.fastDir
    this.lastFrameAt = advanced.lastFrameAt

    const anim = this.pack.anims[this.anim] ?? this.pack.anims.idle
    if (anim === undefined) return
    const cols = animCols(anim)

    const scale = Math.min((w * 0.94) / this.pack.cellW, (h * 0.72) / this.pack.cellH)
    const dw = this.pack.cellW * scale
    const dh = this.pack.cellH * scale
    const dx = (w - dw) / 2
    // The bubble's bottom edge sits just above the sprite's head, growing up
    // into the canvas's headroom band — never over the sprite itself.
    const spriteTop = h - dh - EDGE_MARGIN
    const bottom = spriteTop - 4
    const bubble = this.layoutBubble(ctx, w, bottom)

    const img = this.img
    if (this.pack.kind === 'vector') {
      drawRobot(ctx, { x: dx, y: h - dh - EDGE_MARGIN, w: dw, h: dh }, this.anim, (this.seq + 1) / Math.max(1, cols.length), now, this.robotPalette())
    } else if (img !== null) {
      const sx = (cols[this.seq] ?? 0) * this.pack.cellW
      const sy = anim.row * this.pack.cellH
      // Cells carry their own transparent margin, so the sprite sits on the
      // canvas bottom edge instead of leaving a gap under its feet.
      ctx.drawImage(img, sx, sy, this.pack.cellW, this.pack.cellH, dx, h - dh - EDGE_MARGIN, dw, dh)
    }

    if (bubble.vis > 0.01) this.paintBubble(ctx, w, bubble)
  }

  /** Theme colors and the speed-band accent the vector pet draws with. */
  private robotPalette(): RobotPalette {
    const styles = getComputedStyle(document.documentElement)
    return {
      fill: themeValue(styles, '--dsw-menu-surface-fill') || 'rgba(13,20,36,0.88)',
      stroke: themeValue(styles, '--dsw-alias-border-l1') || 'rgba(255,255,255,0.22)',
      face: themeValue(styles, '--dsw-alias-bg-base') || '#0d1424',
      ink: themeValue(styles, '--dsw-alias-label-primary') || '#e6e9f0',
      // The antenna light carries the live band, so the robot changes color with
      // speed exactly as the sprite packs' tinted accents do.
      accent: this.running || this.estimating ? speedColor(this.tpsNum) : NEUTRAL_COLOR,
    }
  }

  /** Fold this render's facts into the animation state. */
  private adopt(input: PetFrameInput): void {
    this.tpsNum = input.tps
    this.averageTps = Number.isFinite(input.averageTps) && input.averageTps > 0 ? input.averageTps : 0
    this.averageLabel = input.averageLabel
    this.alwaysLast = input.alwaysLast
    this.hover = input.hover
    this.estimating = input.estimating
    this.starting = input.starting
    this.active = input.active
    // Only measured streaming (or the first-token wait) enters the run group: an
    // estimating fallback keeps the idle rotation.
    this.running = input.running || input.starting
  }

  /** The live reading as the bubble shows it. */
  private liveText(): string {
    if (this.starting) return '…'
    return (this.estimating ? '≈' : '') + formatTps(this.tpsNum)
  }

  /**
   * Lay the bubble out for one frame: rows, then the font and box that fit.
   * @param ctx - measuring context.
   * @param w - canvas width.
   * @param bottom - anchored bottom edge.
   * @returns the frame's bubble geometry.
   */
  private layoutBubble(ctx: CanvasRenderingContext2D, w: number, bottom: number): BubbleLayout {
    const padX = 11
    const padY = 5
    const colGap = 8
    const gapY = 3
    const t = this.expandT
    this.font ??= themeValue(getComputedStyle(document.documentElement), '--dsw-font-family') || FALLBACK_FONT
    const liveColor = this.estimating
      ? EST_COLOR
      : this.running
        ? speedColor(this.tpsNum)
        : NEUTRAL_COLOR
    const rows: BubbleRow[] = [
      { label: '实时', value: `${this.liveText()} t/s`, color: liveColor },
      {
        label: this.averageLabel,
        value: this.averageTps > 0 ? `${formatTps(this.averageTps)} t/s` : '--',
        color: speedColor(this.averageTps),
      },
    ]

    let fs = Math.max(11, Math.min(15, w * 0.09))
    let labelFs = Math.max(8, fs * 0.78)
    let lineH = fs * 1.2

    let labelW = 0
    let valueW = 0
    let valueW0 = 0
    const maxBoxW = Math.max(40, w - 6)
    const expanded = t > 0.01 || this.hover || this.alwaysLast
    for (;;) {
      ctx.font = `600 ${fs}px ${this.font}`
      valueW0 = ctx.measureText(rows[0]!.value).width
      valueW = expanded ? Math.max(...rows.map(row => ctx.measureText(row.value).width)) : valueW0
      ctx.font = `500 ${labelFs}px ${this.font}`
      labelW = expanded ? Math.max(...rows.map(row => ctx.measureText(row.label).width)) : 0
      if (padX * 2 + labelW + colGap + valueW <= maxBoxW || fs <= 8) break
      fs -= 1
      labelFs = Math.max(8, fs * 0.78)
      lineH = fs * 1.2
    }

    const boxW1 = padX * 2 + valueW0
    const boxW2 = padX * 2 + labelW + colGap + valueW
    const boxH1 = padY * 2 + lineH
    const boxH2 = padY * 2 + lineH * rows.length + gapY * (rows.length - 1)
    return {
      rows,
      t,
      vis: this.visT,
      fs,
      labelFs,
      lineH,
      gapY,
      padX,
      padY,
      colGap,
      labelW: labelW * t,
      boxW: boxW1 + (boxW2 - boxW1) * t,
      boxH: boxH1 + (boxH2 - boxH1) * t,
      bottom,
    }
  }

  /**
   * Paint the bubble: card, tail, then the rows clipped to the box so a row
   * never draws outside while the box grows.
   * @param ctx - target context.
   * @param w - canvas width.
   * @param b - this frame's layout.
   */
  private paintBubble(ctx: CanvasRenderingContext2D, w: number, b: BubbleLayout): void {
    const styles = getComputedStyle(document.documentElement)
    const fill = themeValue(styles, '--dsw-menu-surface-fill') || 'rgba(13,20,36,0.88)'
    const border = themeValue(styles, '--dsw-alias-border-l1') || 'rgba(255,255,255,0.22)'
    const labelColor = themeValue(styles, '--dsw-alias-label-secondary') || LABEL_COLOR
    const font = this.font ?? FALLBACK_FONT
    const bx = w / 2 - b.boxW / 2
    const by = Math.max(EDGE_MARGIN, b.bottom - b.boxH)

    ctx.globalAlpha = b.vis
    ctx.fillStyle = fill
    ctx.strokeStyle = this.estimating
      ? 'rgba(251,191,36,0.75)'
      : this.running
        ? 'rgba(34,211,238,0.75)'
        : border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(bx, by, b.boxW, b.boxH, Math.min(13, b.boxH / 2))
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(w / 2 - 5, by + b.boxH - 1)
    ctx.lineTo(w / 2 + 5, by + b.boxH - 1)
    ctx.lineTo(w / 2, by + b.boxH + 7)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.rect(bx, by, b.boxW, b.boxH)
    ctx.clip()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    b.rows.forEach((row, index) => {
      if (index > 0 && b.t <= 0.01) return
      const cy = by + b.padY + b.lineH * (index + 0.5) + b.gapY * index
      let x = bx + b.padX
      if (b.t > 0.01) {
        ctx.globalAlpha = b.t * b.vis
        ctx.font = `500 ${b.labelFs}px ${font}`
        ctx.fillStyle = labelColor
        ctx.fillText(row.label, x, cy)
        x += b.labelW + b.colGap
      }
      ctx.globalAlpha = (index > 0 ? b.t : 1) * b.vis
      ctx.font = `600 ${b.fs}px ${font}`
      ctx.fillStyle = row.color
      ctx.fillText(row.value, x, cy)
    })
    ctx.restore()
    ctx.globalAlpha = 1
  }
}

/**
 * One exponential-smoothing step that snaps once it is close enough.
 * @param current - smoothed value.
 * @param target - value to approach.
 * @param dt - seconds since the previous frame.
 * @returns the next smoothed value.
 */
function smooth(current: number, target: number, dt: number): number {
  const next = current + (target - current) * (1 - Math.exp(-dt * SMOOTHING))
  return Math.abs(target - next) < 0.002 ? target : next
}
