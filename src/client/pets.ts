/**
 * Sprite pet packs: one sheet per pack, laid out as fixed-width columns and one
 * row per animation. Ported from the zcode-speed-panel pet packs (Codex Pet
 * format, MIT, see THIRD_PARTY_NOTICES.md): 1536px of sheet split into 8
 * columns of 192px, each animation occupying one row of `cellH`.
 *
 * The sheets import as data URLs: the plugin's web bundle ships as a single
 * file with no asset route to serve beside it, so the build inlines them (the
 * same pattern ui-chat uses for its inline whale).
 */
import whaleSheet from '../../assets/pets/maid-deepseek-whale/spritesheet.webp'
import catSheet from '../../assets/pets/yuexinmiao/spritesheet.webp'

/** One animation: its sheet row, declared non-empty frame count, and an optional explicit column order. */
export interface AnimDef {
  /** Sheet row of this animation. */
  readonly row: number
  /** Frames the sheet actually carries; the play order length when `play` is absent. */
  readonly frames: number
  /** Explicit column order (repeats and skips allowed) for sheets with bad or oversized frames. */
  readonly play?: readonly number[]
}

/** One pet pack's sheet geometry and animation table. */
export interface PetPack {
  readonly id: string
  readonly displayName: string
  /**
   * How the pack paints: `sprite` blits the sheet below, `vector` draws itself
   * procedurally. Both play the same animation table through the same clock, so
   * a vector pack joins the speed-band schedule unchanged.
   */
  readonly kind: 'sprite' | 'vector'
  /** Sheet URL: the inlined data URL of the pack's spritesheet; empty for vector packs. */
  readonly sheet: string
  readonly sheetW: number
  readonly cellW: number
  readonly cellH: number
  /** Sheet rows. */
  readonly rows: number
  /** Animation name to definition. */
  readonly anims: Readonly<Record<string, AnimDef>>
  /** Animations the idle rotation picks from, one per completed animation. */
  readonly idleAnims: readonly string[]
  readonly frameMs: number
}

/** Shipped packs, in cycle order. */
export const PET_PACKS: readonly PetPack[] = [
  {
    id: 'maid-deepseek-whale',
    displayName: '小肥鱼',
    kind: 'sprite',
    sheet: whaleSheet,
    sheetW: 1536,
    cellW: 192,
    cellH: 208,
    rows: 11,
    anims: {
      idle: { row: 0, frames: 7 },
      running_right: { row: 1, frames: 8 },
      running_left: { row: 2, frames: 8 },
      waving: { row: 3, frames: 4 },
      jumping: { row: 4, frames: 5 },
      failed: { row: 5, frames: 8 },
      waiting_permission: { row: 6, frames: 6 },
      running: { row: 7, frames: 6 },
      // Column 4 is a broken frame and column 5 draws oversized: neither plays,
      // and the loop closes back on column 0.
      review: { row: 8, frames: 6, play: [0, 1, 2, 3, 0] },
      idle_talk: { row: 9, frames: 8 },
      idle_shy: { row: 10, frames: 8 },
    },
    idleAnims: ['idle'],
    frameMs: 160,
  },
  {
    id: 'yuexinmiao',
    displayName: '月薪喵',
    kind: 'sprite',
    sheet: catSheet,
    sheetW: 1536,
    cellW: 192,
    cellH: 208,
    rows: 9,
    anims: {
      idle: { row: 0, frames: 6 },
      running_right: { row: 1, frames: 8 },
      running_left: { row: 2, frames: 8 },
      waving: { row: 3, frames: 4 },
      jumping: { row: 4, frames: 5 },
      failed: { row: 5, frames: 8 },
      waiting_permission: { row: 6, frames: 6 },
      running: { row: 7, frames: 6 },
      review: { row: 8, frames: 6 },
    },
    idleAnims: ['idle'],
    frameMs: 160,
  },
  {
    // The first version of this plugin drew this robot with CSS keyframes; it
    // returns as a vector pack so it plays the very same animation table (and
    // therefore the same speed-band schedule) as the sprite packs.
    id: 'robot',
    displayName: '小机器人',
    kind: 'vector',
    sheet: '',
    sheetW: 1536,
    cellW: 192,
    cellH: 208,
    rows: 9,
    anims: {
      idle: { row: 0, frames: 7 },
      running: { row: 1, frames: 6 },
      review: { row: 2, frames: 6 },
      jumping: { row: 3, frames: 5 },
      running_right: { row: 4, frames: 8 },
      running_left: { row: 5, frames: 8 },
    },
    idleAnims: ['idle'],
    frameMs: 160,
  },
]

/** First pack, used as the fallback for an unknown id. */
const DEFAULT_PACK = PET_PACKS[0] as PetPack

/**
 * Resolve one pack by id.
 * @param id - pack id, or undefined for the default.
 * @returns the pack, or the first pack when the id is unknown.
 */
export function packById(id: string | undefined): PetPack {
  return PET_PACKS.find(pack => pack.id === id) ?? DEFAULT_PACK
}

/**
 * The columns one animation plays, in order.
 * @param anim - animation definition.
 * @returns explicit columns when declared, otherwise 0..frames-1.
 */
export function animCols(anim: AnimDef): readonly number[] {
  if (anim.play !== undefined && anim.play.length > 0) return anim.play
  return Array.from({ length: anim.frames }, (_, column) => column)
}

/** Six speed bands, slowest first; the last one is unbounded. */
export const SPEED_TIERS: readonly { readonly upTo: number; readonly color: string }[] = [
  { upTo: 40, color: '#34d399' },
  { upTo: 80, color: '#a3e635' },
  { upTo: 160, color: '#fbbf24' },
  { upTo: 240, color: '#fb923c' },
  { upTo: 320, color: '#f87171' },
  { upTo: Number.POSITIVE_INFINITY, color: '#e879f9' },
]

/** Color of a speed of zero or an absent reading. */
export const NO_SPEED_COLOR = '#8b93a7'

/**
 * Band index of one speed, matching {@link speedTierOf} in speed-reading: a
 * band's lower bound is inclusive, so 40 belongs to the second band.
 * @param tps - tokens/sec.
 * @returns 0 (slowest) through 5 (fastest).
 */
export function speedTierIndex(tps: number): number {
  const index = SPEED_TIERS.findIndex(tier => tps < tier.upTo)
  return index < 0 ? SPEED_TIERS.length - 1 : index
}

/**
 * Band color of one speed, or the neutral color when there is no reading.
 * @param tps - tokens/sec; 0 or less means no reading.
 * @returns a hex color.
 */
export function speedColor(tps: number): string {
  return tps > 0 ? (SPEED_TIERS[speedTierIndex(tps)]?.color ?? NO_SPEED_COLOR) : NO_SPEED_COLOR
}

/**
 * Running animation of one speed band: 0 runs, 1 walks, 2 and 3 jump, and the
 * top two bands trot sideways.
 * @param tps - tokens/sec.
 * @param fastDir - which way the top bands face on this pass.
 * @returns the animation name.
 */
export function runAnimOf(tps: number, fastDir: boolean): string {
  switch (speedTierIndex(tps)) {
    case 0: return 'running'
    case 1: return 'review'
    case 2:
    case 3: return 'jumping'
    default: return fastDir ? 'running_right' : 'running_left'
  }
}

/** Where one sprite's animation has reached. */
export interface AnimState {
  /** Animation name currently playing. */
  readonly anim: string
  /** Position inside that animation's column list. */
  readonly seq: number
  /** Which way the sideways trot faces; only the top two bands use it. */
  readonly fastDir: boolean
}

/**
 * Advance one animation by a single frame boundary. A row always finishes
 * before anything changes: both the idle/run switch and a band change inside the
 * run group take effect here and nowhere else, so a running pet never snaps
 * mid-stride.
 * @param pack - the pack being played.
 * @param state - where the animation stands.
 * @param running - whether work is streaming (the run group rather than idle).
 * @param tps - current speed, selecting the run-group animation.
 * @param now - frame timestamp.
 * @param lastFrameAt - timestamp of the previous frame boundary.
 * @returns the next state and the boundary to compare against next time.
 */
export function advanceAnim(
  pack: PetPack,
  state: AnimState,
  running: boolean,
  tps: number,
  now: number,
  lastFrameAt: number,
): { readonly state: AnimState, readonly lastFrameAt: number } {
  if (now - lastFrameAt < pack.frameMs) return { state, lastFrameAt }
  const cols = animCols(pack.anims[state.anim] ?? pack.anims.idle ?? { row: 0, frames: 1 })
  const seq = state.seq + 1
  if (seq < cols.length) return { state: { ...state, seq }, lastFrameAt: now }
  // Row complete: only now does the next animation get chosen.
  let fastDir = state.fastDir
  let anim: string
  if (running) {
    anim = runAnimOf(tps, fastDir)
    if (anim === state.anim && (anim === 'running_right' || anim === 'running_left')) {
      fastDir = !fastDir
      anim = fastDir ? 'running_right' : 'running_left'
    }
  } else {
    anim = pickIdle(pack)
  }
  return { state: { anim, seq: 0, fastDir }, lastFrameAt: now }
}

/**
 * Choose an idle animation from the pack's rotation.
 * @param pack - the pack being played.
 * @param random - sample in [0, 1); defaults to `Math.random`.
 * @returns the animation name.
 */
export function pickIdle(pack: PetPack, random: number = Math.random()): string {
  const keys = pack.idleAnims
  if (keys.length === 0) return 'idle'
  const index = Math.min(keys.length - 1, Math.max(0, Math.floor(random * keys.length)))
  return keys[index] ?? 'idle'
}

/**
 * The scale a gauge shows: the smallest scale while the peak is under it, then
 * the peak rounded up to a readable step. The caller grows instantly and shrinks
 * slowly, which is why this reports the step rather than the eased value.
 * @param peak - highest reading of the moment.
 * @param minScale - smallest scale the gauge ever shows.
 * @returns the target scale in tokens/sec.
 */
export function scaleFor(peak: number, minScale: number): number {
  return Math.max(minScale, niceCeil(Math.max(peak, 0) * 1.2))
}

/**
 * Round a value up to a readable step (1, 2, 2.5, 5 or 10 times a power of ten).
 * @param value - raw peak.
 * @returns the step, or 10 for a non-positive input.
 */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 10
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * base
}
