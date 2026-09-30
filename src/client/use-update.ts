/**
 * Shared update-check state: one throttled background probe (mounted once by
 * the floating window) plus a manual re-check for the settings page.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  CURRENT_VERSION, compareVersions, fetchLatestRelease, shouldCheckNow,
  type UpdateInfo,
} from './updater.ts'

/** Status of the newest check, driving both the menu badge and the settings row. */
export type UpdateStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'checking' }
  | { readonly phase: 'failed' }
  | { readonly phase: 'latest' }
  | { readonly phase: 'available'; readonly info: UpdateInfo }

/**
 * Create the update-check seat: `probe()` runs the throttled background check
 * (call once on mount), `checkNow()` re-runs it unconditionally.
 * @returns the current status, the new release when any, and the two triggers.
 */
export function createUpdateCheck(): {
  readonly useStatus: () => { readonly status: UpdateStatus; readonly checkNow: () => void }
  readonly probe: () => void
} {
  let setStatusExternal: ((next: UpdateStatus) => void) | undefined
  let status: UpdateStatus = { phase: 'idle' }

  const run = async (force: boolean): Promise<void> => {
    if (status.phase === 'checking') return
    if (!force && !shouldCheckNow(false)) return
    status = { phase: 'checking' }
    setStatusExternal?.(status)
    const info = await fetchLatestRelease()
    if (info === null) {
      status = { phase: 'failed' }
    } else if (compareVersions(info.version, CURRENT_VERSION) > 0) {
      status = { phase: 'available', info }
    } else {
      status = { phase: 'latest' }
    }
    setStatusExternal?.(status)
  }

  return {
    probe: () => { void run(false) },
    useStatus: () => {
      const [current, setStatus] = useState<UpdateStatus>(status)
      useEffect(() => {
        setStatusExternal = setStatus
        return () => { setStatusExternal = undefined }
      }, [])
      const checkNow = useCallback(() => { void run(true) }, [])
      return { status: current, checkNow }
    },
  }
}
