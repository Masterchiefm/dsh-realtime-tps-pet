/**
 * Pure output-speed math for the speed pet: a text-based token estimator,
 * second-bucketed live throughput over a rolling window, and settled-call
 * readings used both as the "last call" reference and as calibration samples
 * for the live estimate.
 */

/** One second-aligned bucket of raw estimated tokens. */
export interface SpeedBucket {
  /** Bucket start (Unix epoch ms), a whole-second multiple. */
  readonly time: number
  /** Raw estimated tokens accumulated inside this bucket, before calibration. */
  readonly est: number
}

/** Live streaming facts of one model attempt, folded from timed deltas. */
export interface SpeedLiveFacts {
  /** Time of the first token delta of the attempt. */
  readonly firstTokenTime: number
  /** Time of the most recent token delta of the attempt. */
  readonly lastTokenTime: number
  /** Ascending one-second buckets covering `[firstTokenTime, lastTokenTime]`. */
  readonly buckets: readonly SpeedBucket[]
}

/** One settled model call measured from its embedded stream. */
export interface SpeedSettledSample {
  /** Model identity from the settled message source; `''` when unavailable. */
  readonly model: string
  /** Raw estimated output tokens of the settled stream (same estimator as live). */
  readonly estTokens: number
  /** Adapter-reported output tokens; absent when the call carried no usage. */
  readonly outputTokens: number | undefined
  /** Pure decode window: last token-delta time minus first, in ms. */
  readonly decodeMs: number
}

/** Live display phase of the current step. */
export type SpeedPhase = 'awaiting' | 'streaming' | 'stalled'

/** Live reading derived from facts, calibration, and a wall-clock sample. */
export interface SpeedReading {
  readonly phase: SpeedPhase
  /** Calibrated tokens/sec over the rolling window; `0` before the first token. */
  readonly tps: number
  /** Display band of {@link tps}. */
  readonly tier: SpeedTier
  /**
   * Whether {@link tps} rests on the text estimator alone. It is true until a
   * settled call has contributed a usable sample, so a surface can mark the
   * weaker reading. A median that happens to be exactly 1 is still calibrated:
   * the flag follows the evidence, not the value.
   */
  readonly estimation: boolean
}

/** Display band index: 0 slowest through 5 fastest. */
export type SpeedTier = 0 | 1 | 2 | 3 | 4 | 5

/** Rolling window a live reading integrates over. */
export const LIVE_WINDOW_MS = 15_000

/** A stream this quiet is displayed as stalled rather than streaming. */
export const STALL_AFTER_MS = 5_000

/** Shortest window a reading divides by, so the first bucket cannot spike. */
export const MIN_WINDOW_MS = 1_000

/** Settled calls below these thresholds never calibrate: estimator noise dominates. */
export const MIN_CALIBRATION_TOKENS = 80
export const MIN_CALIBRATION_MS = 1_000

/** Newest-last cap of settled samples kept for calibration and reference. */
export const SETTLED_HISTORY = 8

/**
 * Estimate tokens in one delta text. CJK characters tokenize near one token
 * each across the DeepSeek family; the remaining characters average close to
 * four per token. Systematic bias is absorbed by the settled calibration.
 * @param text - delta text of one streamed token chunk.
 * @returns estimated token count.
 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || code >= 0x20000) cjk += 1
    else other += 1
  }
  return cjk + other / 4
}

/**
 * Fold one timed delta into second-aligned buckets.
 * @param buckets - ascending buckets of the current attempt.
 * @param time - delta timestamp (Unix epoch ms).
 * @param est - estimated tokens of the delta.
 * @returns the next bucket list (new when changed, otherwise the same array).
 */
export function pushBucket(buckets: readonly SpeedBucket[], time: number, est: number): readonly SpeedBucket[] {
  const second = Math.floor(time / 1_000) * 1_000
  const last = buckets.at(-1)
  if (last !== undefined && last.time === second) {
    const next = buckets.slice()
    next[next.length - 1] = { time: second, est: last.est + est }
    return next
  }
  return [...buckets, { time: second, est }]
}

/**
 * Sum raw estimated tokens inside the live window.
 * @param facts - live attempt facts.
 * @param windowStart - inclusive left edge (Unix epoch ms).
 * @returns raw estimated tokens whose bucket starts at or after the edge.
 */
export function windowEstTokens(facts: SpeedLiveFacts, windowStart: number): number {
  let total = 0
  for (const bucket of facts.buckets) {
    if (bucket.time < windowStart) continue
    total += bucket.est
  }
  return total
}

/**
 * Derive the live reading of one attempt at a wall-clock sample. The window is
 * anchored on the newest delta, never extending before the first token, and a
 * stream quiet past {@link STALL_AFTER_MS} holds its value under a stalled phase.
 * @param facts - live attempt facts.
 * @param ratio - calibration multiplier (settled tokens per estimated token).
 * @param now - wall-clock sample (Unix epoch ms).
 * @returns the display reading.
 */
export function liveReading(
  facts: SpeedLiveFacts,
  ratio: number,
  now: number,
  calibrated = false,
): SpeedReading {
  const windowStart = Math.max(facts.firstTokenTime, facts.lastTokenTime - LIVE_WINDOW_MS)
  const durationMs = Math.max(facts.lastTokenTime - windowStart, MIN_WINDOW_MS)
  const tps = windowEstTokens(facts, windowStart) * ratio / (durationMs / 1_000)
  const phase: SpeedPhase = now - facts.lastTokenTime > STALL_AFTER_MS ? 'stalled' : 'streaming'
  return { phase, tps, tier: speedTierOf(tps), estimation: !calibrated }
}

/**
 * Whether a settled history carries any sample the calibration accepts. The
 * caller passes this alongside {@link calibrationRatio} so a median of exactly
 * 1 stays distinguishable from "nothing has been measured yet".
 * @param settled - settled samples, newest last.
 * @returns true when at least one sample qualifies.
 */
export function hasCalibration(settled: readonly SpeedSettledSample[]): boolean {
  return settled.some(sample =>
    sample.outputTokens !== undefined
    && sample.outputTokens >= MIN_CALIBRATION_TOKENS
    && sample.decodeMs >= MIN_CALIBRATION_MS
    && sample.estTokens > 0)
}

/**
 * Display band of one tokens/sec value.
 * @param tps - tokens/sec.
 * @returns 0 (slowest) through 5 (fastest).
 */
export function speedTierOf(tps: number): SpeedTier {
  if (tps >= 320) return 5
  if (tps >= 240) return 4
  if (tps >= 160) return 3
  if (tps >= 80) return 2
  if (tps >= 40) return 1
  return 0
}

/**
 * Settled-call reading: exact adapter tokens when usage exists, otherwise the
 * calibrated estimate.
 * @param sample - one settled call.
 * @param ratio - calibration multiplier.
 * @returns tokens/sec, or `undefined` when the call left no usable decode window.
 */
export function settledReading(sample: SpeedSettledSample, ratio: number): number | undefined {
  if (sample.decodeMs < MIN_CALIBRATION_MS) return undefined
  if (sample.outputTokens !== undefined) return sample.outputTokens / (sample.decodeMs / 1_000)
  if (sample.estTokens <= 0) return undefined
  return sample.estTokens * ratio / (sample.decodeMs / 1_000)
}

/**
 * Calibration multiplier from the newest-last settled history: the median of
 * reported-over-estimated token ratios of calls above both thresholds.
 * @param settled - settled samples, newest last.
 * @returns the multiplier; 1 (no correction) without qualifying samples.
 */
export function calibrationRatio(settled: readonly SpeedSettledSample[]): number {
  const ratios: number[] = []
  for (const sample of settled) {
    if (sample.outputTokens === undefined) continue
    if (sample.outputTokens < MIN_CALIBRATION_TOKENS) continue
    if (sample.decodeMs < MIN_CALIBRATION_MS || sample.estTokens <= 0) continue
    ratios.push(sample.outputTokens / sample.estTokens)
  }
  return median(ratios)
}

/**
 * Median of a numeric sample.
 * @param values - sample values; an even count averages the middle pair.
 * @returns the median, or 1 for an empty sample (the neutral calibration).
 */
function median(values: readonly number[]): number {
  if (values.length === 0) return 1
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle]
  if (upper === undefined) return 1
  if (sorted.length % 2 === 1) return upper
  const lower = sorted[middle - 1]
  return lower === undefined ? upper : (lower + upper) / 2
}

/**
 * Format a tokens/sec value for display: whole above ten, one decimal below.
 * @param tps - tokens/sec.
 * @returns the display string.
 */
export function formatTps(tps: number): string {
  return tps >= 10 ? String(Math.round(tps)) : (Math.round(tps * 10) / 10).toString()
}
