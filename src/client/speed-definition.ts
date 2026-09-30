/**
 * Speed-pet Step Definition: folds live Assistant deltas and durable
 * settlements of one Step into timing facts for the `speed-pet` view target.
 * Live chunks accumulate second-buckets of estimated tokens; a settlement
 * derives its exact sample from the embedded compact stream.
 */
import type {
  ConversationNodeContext, ConversationNodeDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { expandAssistantStream } from '@deepseek-ai/dsh-llm/assistant-stream'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SpeedBucket, SpeedLiveFacts, SpeedSettledSample } from './speed-reading.ts'
import { estimateTokens, pushBucket } from './speed-reading.ts'

/** View-node payload of one Step's speed facts. */
export interface SpeedStepData {
  /** Facts of the attempt still producing deltas; retired at settlement. */
  readonly live: SpeedLiveFacts | undefined
  /** Exact sample once the Step's `assistant/message` settled. */
  readonly settled: SpeedSettledSample | undefined
  /** Whether the Step is still waiting for evidence: open, unsettled, and without live tokens. */
  readonly awaiting: boolean
}

/** A `speed-pet` view node with its ordering sequence. */
export interface SpeedStepNode extends ConversationViewNode {
  readonly data: SpeedStepData
  /** Sequence of the Step's start evidence; orders nodes inside the builder. */
  readonly anchorSeq: number
}

/** Attempt accumulation state inside one Step. */
interface LiveAttempt {
  /** Identity of the attempt whose deltas were folded; a change resets. */
  attemptId: string
  firstTokenTime: number
  lastTokenTime: number
  buckets: readonly SpeedBucket[]
}

interface SpeedStepState {
  readonly turn: number
  readonly step: number
  readonly awaiting: boolean
  readonly live: LiveAttempt | undefined
  readonly settled: SpeedSettledSample | undefined
}

function initialState(turn: number, step: number, awaiting: boolean): SpeedStepState {
  return { turn, step, awaiting, live: undefined, settled: undefined }
}

/** Estimated token text of one delta chunk; `undefined` for non-token chunks. */
function deltaText(chunk: StreamChunk): string | undefined {
  if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return chunk.text
  if (chunk.type === 'tool-call-delta') return chunk.argumentsDelta
  return undefined
}

function foldChunk(state: SpeedStepState, attemptId: string, chunk: StreamChunk, time: number): SpeedStepState {
  const text = deltaText(chunk)
  if (text === undefined) return state
  if (state.live === undefined || state.live.attemptId !== attemptId) {
    return {
      ...state,
      live: {
        attemptId,
        firstTokenTime: time,
        lastTokenTime: time,
        buckets: pushBucket([], time, estimateTokens(text)),
      },
    }
  }
  const previous = state.live
  return {
    ...state,
    live: {
      attemptId,
      firstTokenTime: previous.firstTokenTime,
      lastTokenTime: time,
      buckets: pushBucket(previous.buckets, time, estimateTokens(text)),
    },
  }
}

/**
 * Exact sample of one settled call from its embedded compact stream: the
 * estimator runs over the same delta family the live buckets count.
 * @param event - the settled `assistant/message`.
 * @returns the sample, or `undefined` when the stream carried no token delta.
 */
function settleSample(event: SessionEvent<'assistant/message'>): SpeedSettledSample | undefined {
  let firstTokenTime: number | undefined
  let lastTokenTime: number | undefined
  let estTokens = 0
  for (const timed of expandAssistantStream(event.data.stream)) {
    const text = deltaText(timed.chunk)
    if (text === undefined) continue
    firstTokenTime ??= timed.time
    lastTokenTime = timed.time
    estTokens += estimateTokens(text)
  }
  if (firstTokenTime === undefined || lastTokenTime === undefined) return undefined
  return {
    model: event.data.message.source.model,
    estTokens,
    outputTokens: event.data.usage?.outputTokens,
    decodeMs: lastTokenTime - firstTokenTime,
  }
}

/** Whether one event belongs to a Step's speed fold, with its Step identity. */
function stepIdOf(event: SessionEventLike): string | undefined {
  if (event.type === 'step/start'
    || event.type === 'step/end'
    || event.type === 'assistant/live-chunk'
    || event.type === 'assistant/message'
    || event.type === 'assistant/attempt'
    || event.type === 'llm/retry') {
    return `${event.data.turn}:${event.data.step}`
  }
  return undefined
}

/** Speed-pet Step streaming and settlement fold. */
export const speedStepDefinition: ConversationNodeDefinition<SpeedStepState> = {
  kind: 'speed-pet-step',
  target: 'speed-pet',
  match: (event) => {
    const id = stepIdOf(event)
    if (id === undefined) return null
    return event.type === 'step/start' ? { id, role: 'start' } : { id, role: 'update' }
  },
  start: (_context, match) => {
    /* v8 ignore next 3 -- role guard: match() assigns the start role only to step/start */
    if (match.event.type !== 'step/start') {
      throw new Error('speed-pet-step start requires step/start')
    }
    return initialState(match.event.data.turn, match.event.data.step, true)
  },
  update: (context, match) => {
    const event = match.event
    if (event.type === 'assistant/live-chunk') {
      return foldChunk(context.state, String(event.data.attemptId), event.data.chunk, event.time)
    }
    if (event.type === 'assistant/message') {
      return { ...context.state, live: undefined, settled: settleSample(event) ?? context.state.settled, awaiting: false }
    }
    // An attempt that settled without a surface message (failed, retried,
    // cancelled) retires the live reading and contributes no calibration sample.
    if (event.type === 'assistant/attempt') return { ...context.state, live: undefined, awaiting: true }
    // A retry restarts the request; the next attempt's deltas re-accumulate.
    if (event.type === 'llm/retry') return { ...context.state, live: undefined, awaiting: true }
    if (event.type === 'step/end') return { ...context.state, live: undefined, awaiting: false }
    return context.state
  },
  publication: (match) => {
    if (match.event.type !== 'assistant/live-chunk') return 'immediate'
    return deltaText(match.event.data.chunk) === undefined ? 'none' : 'animation-frame'
  },
  // `publication` above keeps the awaiting/live/settled transitions immediate
  // (an attempt end visibly retires the live reading) and defers only token
  // deltas to the animation frame; silent frame bookkeeping publishes nothing.
  buildViewNode: (context) => {
    const state = context.state ?? fallbackState(context)
    if (state === undefined) return null
    const data: SpeedStepData = {
      live: state.live === undefined
        ? undefined
        : {
          firstTokenTime: state.live.firstTokenTime,
          lastTokenTime: state.live.lastTokenTime,
          buckets: state.live.buckets,
        },
      settled: state.settled,
      awaiting: state.awaiting && state.live === undefined && state.settled === undefined,
    }
    const node: SpeedStepNode = {
      key: context.key,
      kind: 'speed-pet-step',
      id: context.id,
      target: 'speed-pet',
      data,
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
    }
    return node
  },
}

/**
 * Chunk-only fallback for a Context whose `step/start` sits outside the loaded
 * window: the earliest matched event initializes, later evidence folds in order.
 * @param context - engine-owned Context without State.
 * @returns the replayed State, or `undefined` without any matched evidence.
 */
function fallbackState(context: ConversationNodeContext<SpeedStepState>): SpeedStepState | undefined {
  let state: SpeedStepState | undefined
  for (const match of context.matches) {
    const event = match.event
    if (event.type === 'assistant/live-chunk') {
      state ??= initialState(event.data.turn, event.data.step, false)
      state = foldChunk(state, String(event.data.attemptId), event.data.chunk, event.time)
    } else if (event.type === 'assistant/message') {
      state ??= initialState(event.data.turn, event.data.step, false)
      state = { ...state, live: undefined, settled: settleSample(event) ?? state.settled, awaiting: false }
    } else if (event.type === 'assistant/attempt' || event.type === 'llm/retry') {
      if (state !== undefined) state = { ...state, live: undefined, awaiting: true }
    } else if (event.type === 'step/end') {
      if (state !== undefined) state = { ...state, live: undefined, awaiting: false }
    }
  }
  return state
}
