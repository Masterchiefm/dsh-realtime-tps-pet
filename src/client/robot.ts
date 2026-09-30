/**
 * The vector pet: the original plugin's SVG robot, drawn procedurally so it can
 * share the sprite packs' animation table, clock, and speed-band schedule.
 *
 * The motion is the port of that first version's CSS keyframes — idle bob,
 * trot, hop, sprint shimmy, antenna wave, and the blink — expressed as
 * per-frame transforms of the same geometry.
 */

/** Body colors resolved from the host theme each frame. */
export interface RobotPalette {
  /** Body fill. */
  readonly fill: string
  /** Body outline. */
  readonly stroke: string
  /** Face plate fill. */
  readonly face: string
  /** Eye and mouth color. */
  readonly ink: string
  /** Antenna light (the current speed band's accent). */
  readonly accent: string
}

/** The box the robot is drawn into, in canvas CSS pixels. */
export interface RobotBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** One frame's transform of the robot. */
interface Motion {
  /** Vertical offset in art units (positive lifts the robot). */
  readonly lift: number
  /** Horizontal offset in art units. */
  readonly slide: number
  /** Lift of the leading foot in art units. */
  readonly stride: number
  /** Whole-body lean in radians. */
  readonly lean: number
  /** Body rotation about the feet (the trot) in radians. */
  readonly trot: number
  /** Antenna sweep in radians. */
  readonly antenna: number
  /** Eye openness 0..1. */
  readonly blink: number
}

/** The source artwork's own coordinate space (y down), as the SVG declared it. */
const ART_W = 72
const ART_H = 64
/** Where the trot pivots: the original CSS used `transform-origin: 36px 52px`. */
const TROT_ORIGIN = { x: 36, y: 52 }
/** Where the antenna sways from. */
const ANTENNA_ORIGIN = { x: 36, y: 17 }

/**
 * The motion one animation frame calls for.
 * @param anim - animation name from the shared table.
 * @param phase - position in the animation, 0..1 (frame over frame count).
 * @param now - wall clock, for the motions that run on their own period.
 * @returns the frame's transform.
 */
export function robotMotion(anim: string, phase: number, now: number): Motion {
  const wave = Math.sin(phase * Math.PI * 2)
  // The blink keeps the original's 4.6s cycle with its brief shutter,
  // independent of which row is playing.
  const blinkCycle = (now % 4_600) / 4_600
  const blink = blinkCycle > 0.93 && blinkCycle < 0.96 ? 0.15 : 1
  const antenna = Math.sin(now / 520) * 0.1
  switch (anim) {
    case 'running':
      return { lift: 0, slide: 0, stride: wave * 1.6, lean: 0, trot: wave * 0.044, antenna, blink }
    case 'review':
      return { lift: 0, slide: 0, stride: wave * 0.9, lean: 0, trot: wave * 0.026, antenna, blink }
    case 'jumping': {
      // Hop: rise to the 35% keyframe, hold to 55%, fall back — the original's
      // -7px peak scaled into art units.
      const hop = phase < 0.35 ? phase / 0.35 : phase < 0.55 ? 1 : 1 - (phase - 0.55) / 0.45
      return { lift: hop * 7, slide: 0, stride: 0, lean: 0, trot: 0, antenna, blink }
    }
    case 'running_right':
    case 'running_left': {
      const dir = anim === 'running_right' ? 1 : -1
      return { lift: Math.abs(wave) * 4, slide: wave * 1.5 * dir, stride: wave * 2.4, lean: wave * 0.05 * dir, trot: 0, antenna, blink }
    }
    default:
      // Idle bob: the original's 3.2s breathing, +2.5px at the midpoint.
      return { lift: (1 - Math.cos((now % 3_200) / 3_200 * Math.PI * 2)) / 2 * 2.5, slide: 0, stride: 0, lean: 0, trot: 0, antenna, blink }
  }
}

/**
 * Draw one frame of the robot.
 * @param ctx - target context, already cleared and scaled to CSS pixels.
 * @param box - where the artwork sits.
 * @param anim - animation name from the shared table.
 * @param phase - position in the animation, 0..1.
 * @param now - wall clock of this frame.
 * @param palette - resolved theme colors and the speed-band accent.
 */
export function drawRobot(
  ctx: CanvasRenderingContext2D,
  box: RobotBox,
  anim: string,
  phase: number,
  now: number,
  palette: RobotPalette,
): void {
  const motion = robotMotion(anim, phase, now)
  // One scale for both axes keeps the artwork's proportions, centred in the box.
  const scale = Math.min(box.w / ART_W, box.h / ART_H)
  const originX = box.x + (box.w - ART_W * scale) / 2
  const originY = box.y + (box.h - ART_H * scale) / 2
  /** Art x (0..72) to canvas x. */
  const ax = (x: number): number => originX + x * scale
  /** Art y (0..64, downward) to canvas y, lifted by the frame's motion. */
  const ay = (y: number): number => originY + (y - motion.lift) * scale

  ctx.save()
  ctx.lineWidth = Math.max(1, 1.5 * scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Whole-body motion first: trot pivots at the feet, the sprint leans.
  const pivotX = ax(TROT_ORIGIN.x)
  const pivotY = originY + TROT_ORIGIN.y * scale
  ctx.translate(pivotX + motion.slide * scale, pivotY)
  ctx.rotate(motion.trot + motion.lean)
  ctx.translate(-pivotX, -pivotY)

  // Antenna: a swaying stalk plus its light, tinted by the speed band.
  ctx.save()
  ctx.translate(ax(ANTENNA_ORIGIN.x), originY + ANTENNA_ORIGIN.y * scale)
  ctx.rotate(motion.antenna)
  ctx.translate(-ax(ANTENNA_ORIGIN.x), -(originY + ANTENNA_ORIGIN.y * scale))
  ctx.strokeStyle = palette.stroke
  ctx.beginPath()
  ctx.moveTo(ax(36), ay(9))
  ctx.lineTo(ax(36), ay(17))
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(ax(36), ay(7), 4 * scale, 0, Math.PI * 2)
  ctx.fillStyle = palette.accent
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  // Ears, then the body, then the face plate.
  ctx.fillStyle = palette.fill
  ctx.strokeStyle = palette.stroke
  for (const ear of [[21, 22, 26, 9, 33, 19], [51, 22, 46, 9, 39, 19]] as const) {
    ctx.beginPath()
    ctx.moveTo(ax(ear[0]), ay(ear[1]))
    ctx.lineTo(ax(ear[2]), ay(ear[3]))
    ctx.lineTo(ax(ear[4]), ay(ear[5]))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.roundRect(ax(17), ay(17), 38 * scale, 36 * scale, 13 * scale)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(ax(24), ay(25), 24 * scale, 14 * scale, 7 * scale)
  ctx.fillStyle = palette.face
  ctx.fill()

  // Eyes, closed by the blink, and the smile.
  ctx.fillStyle = palette.ink
  for (const eyeX of [30, 42]) {
    ctx.save()
    ctx.translate(ax(eyeX), ay(32))
    ctx.scale(1, motion.blink)
    ctx.beginPath()
    ctx.arc(0, 0, 2.4 * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.strokeStyle = palette.ink
  ctx.beginPath()
  ctx.moveTo(ax(33), ay(41))
  ctx.quadraticCurveTo(ax(36), ay(43.4), ax(39), ay(41))
  ctx.stroke()

  // Feet: the leading one lifts with the stride.
  ctx.fillStyle = palette.fill
  ctx.strokeStyle = palette.stroke
  for (const foot of [[27, 1], [45, -1]] as const) {
    ctx.beginPath()
    ctx.ellipse(
      ax(foot[0]),
      ay(56) - (foot[1] === 1 ? Math.abs(motion.stride) : 0) * scale,
      5 * scale,
      2.6 * scale,
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}
