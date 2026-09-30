/**
 * The `speed-pet` view target: aggregates Step nodes into one snapshot — the
 * newest step's live facts and awaiting state plus the capped settled history
 * that calibrates the live estimate and backs the last-call reference.
 */
import type {
  ConversationViewBuilder, ConversationViewDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SpeedStepNode } from './speed-definition.ts'
import type { SpeedLiveFacts, SpeedSettledSample } from './speed-reading.ts'
import { SETTLED_HISTORY } from './speed-reading.ts'

/** Snapshot consumed by the shell-overlay pet. */
export interface SpeedSnapshot {
  /** Live facts of the newest step's streaming attempt, once its first token arrived. */
  readonly live: SpeedLiveFacts | undefined
  /** Whether the newest step is still waiting for evidence (the first-token wait). */
  readonly awaitingFirstToken: boolean
  /** Newest-last capped settled calls across the loaded window. */
  readonly settled: readonly SpeedSettledSample[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    /** Newest step's live facts plus capped settled history. */
    'speed-pet': SpeedSnapshot
  }
}

const EMPTY: SpeedSnapshot = { live: undefined, awaitingFirstToken: false, settled: [] }

/** One materialized node keyed by its engine identity. */
interface StepRecord {
  readonly anchorSeq: number
  readonly data: SpeedStepNode['data']
}

/** Incremental builder keeping one record per Step node. */
class SpeedSnapshotBuilder implements ConversationViewBuilder<SpeedStepNode, SpeedSnapshot> {
  readonly empty: SpeedSnapshot = EMPTY
  private readonly records = new Map<string, StepRecord>()

  replace(input: { readonly nodes: readonly SpeedStepNode[] }): SpeedSnapshot {
    this.records.clear()
    for (const node of input.nodes) this.records.set(node.key, { anchorSeq: node.anchorSeq, data: node.data })
    return this.snapshot()
  }

  apply(input: { readonly upserts: readonly SpeedStepNode[] }): SpeedSnapshot {
    for (const node of input.upserts) this.records.set(node.key, { anchorSeq: node.anchorSeq, data: node.data })
    return this.snapshot()
  }

  private snapshot(): SpeedSnapshot {
    const ordered = [...this.records.values()].sort((left, right) => left.anchorSeq - right.anchorSeq)
    const current = ordered.at(-1)
    const settled: SpeedSettledSample[] = []
    for (const record of ordered) {
      if (record.data.settled === undefined) continue
      settled.push(record.data.settled)
      if (settled.length > SETTLED_HISTORY) settled.shift()
    }
    return {
      live: current?.data.live,
      awaitingFirstToken: current?.data.awaiting === true,
      settled,
    }
  }
}

/** The `speed-pet` target factory. */
export const speedPetViewDefinition: ConversationViewDefinition<SpeedStepNode, SpeedSnapshot> = {
  target: 'speed-pet',
  create: () => new SpeedSnapshotBuilder(),
}
