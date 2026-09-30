/**
 * Main-view speed source for the shell overlay: follows the session retained
 * by the main view and publishes its `speed-pet` snapshot plus identity as one
 * bare observable. The pet reads it through the entry's registrant-private
 * hooks compartment; the apply world owns the session following.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SpeedSnapshot } from './speed-view.ts'

/** The followed main-view session and its current speed snapshot. */
export interface MainViewSpeed {
  readonly sessionId: SessionId | undefined
  readonly snapshot: SpeedSnapshot | undefined
}

/** The published speed source and its teardown. */
export interface SpeedSource {
  /** Observable handed to the slot entry's hooks compartment. */
  readonly observable: ObservableSnapshot<MainViewSpeed>
  /** Stop following and drop state; called from the owning effect's teardown. */
  readonly dispose: () => void
}

/**
 * Create the main-view speed source over one client root context.
 * @param ctx - client root context with `sessions` and `uiConversation`.
 * @returns the observable and its teardown.
 */
export function createSpeedSource(ctx: ClientContext): SpeedSource {
  const listeners = new Set<() => void>()
  let value: MainViewSpeed = { sessionId: undefined, snapshot: undefined }
  let stopList: (() => void) | undefined
  let stopTarget: (() => void) | undefined
  let followed: SessionId | undefined

  const notifyAll = (): void => {
    for (const listener of listeners) listener()
  }

  const publish = (next: MainViewSpeed): void => {
    if (value.sessionId === next.sessionId && value.snapshot === next.snapshot) return
    value = next
    notifyAll()
  }

  /** Bind to the main-view session's target source, dropping the previous one. */
  const follow = (): void => {
    const byId = ctx.sessions.list.getSnapshot().byId
    const sessionId = Object.values(byId)
      .find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
    stopTarget?.()
    stopTarget = undefined
    followed = sessionId
    const binding = sessionId === undefined ? undefined : ctx.sessions.binding(sessionId)
    const target = binding === undefined
      ? undefined
      : ctx.uiConversation.binding(binding.sessionId).target('speed-pet')
    stopTarget = target?.subscribe(() => {
      publish({ sessionId: followed, snapshot: target.getSnapshot() })
    })
    publish({ sessionId: followed, snapshot: target?.getSnapshot() })
  }

  const observable: ObservableSnapshot<MainViewSpeed> = {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (listeners.size === 1) {
        follow()
        stopList = ctx.sessions.list.subscribe(follow)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          stopList?.()
          stopList = undefined
          stopTarget?.()
          stopTarget = undefined
          followed = undefined
          value = { sessionId: undefined, snapshot: undefined }
        }
      }
    },
  }

  const dispose = (): void => { listeners.clear() }

  return { observable, dispose }
}
