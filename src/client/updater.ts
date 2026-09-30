/**
 * Update check against the GitHub release tag. The browser half cannot write
 * into the DSH installation, so "install" means: copy the `dsh plugin install`
 * command to the clipboard and open the release page for the user to paste it
 * (or use the in-app plugin installer with the repository URL).
 */

/** The plugin's own version, kept in step with `package.json`. */
export const CURRENT_VERSION = '0.2.0'

/** GitHub slug and canonical URLs of the plugin. */
export const REPO_SLUG = 'masterchiefm/dsh-realtime-tps-pet'
export const REPO_URL = `https://github.com/${REPO_SLUG}`
export const RELEASES_URL = `${REPO_URL}/releases/latest`

/** The install command copied to the clipboard when the user clicks install. */
export const INSTALL_COMMAND = `dsh plugin install ${REPO_URL}`

/** LocalStorage throttle key: at most one network check per 6 hours. */
const CHECK_THROTTLE_KEY = 'dsh.speed-pet.updateCheckAt'
const CHECK_THROTTLE_MS = 6 * 60 * 60 * 1000

/** What a successful check reports. */
export interface UpdateInfo {
  /** Latest release tag, normalized without the leading `v`. */
  readonly version: string
  /** The release page the install action opens. */
  readonly url: string
}

/**
 * Compare two dotted numeric versions, ignoring a leading `v` and any
 * pre-release suffix (a suffix sorts before its plain release).
 * @param a - candidate version, e.g. `v0.2.0-rc.1`.
 * @param b - the running version, e.g. `0.1.0`.
 * @returns negative when `a` is older, 0 when equal, positive when newer.
 */
export function compareVersions(a: string, b: string): number {
  const split = (version: string): { readonly core: readonly number[]; readonly pre: readonly string[] } => {
    const [plain, ...preParts] = version.replace(/^v/i, '').split('-')
    const core = (plain ?? '').split('.').map(part => Number.parseInt(part, 10))
    return { core, pre: preParts.join('-') === '' ? [] : [preParts.join('-')] }
  }
  const left = split(a)
  const right = split(b)
  const width = Math.max(left.core.length, right.core.length)
  for (let index = 0; index < width; index += 1) {
    const l = left.core[index] ?? 0
    const r = right.core[index] ?? 0
    if (l !== r) return l - r
  }
  // Same core: a pre-release (0.2.0-rc.1) counts as older than the release.
  if (left.pre.length !== right.pre.length) return right.pre.length - left.pre.length
  return left.pre.join('-').localeCompare(right.pre.join('-'))
}

/**
 * Read the latest release from the GitHub API.
 * @returns the newest published release, or null when the network/limit fails.
 */
export async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO_SLUG}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null) return null
    const tag = (data as { tag_name?: unknown }).tag_name
    const htmlUrl = (data as { html_url?: unknown }).html_url
    if (typeof tag !== 'string' || tag === '') return null
    return { version: tag.replace(/^v/i, ''), url: typeof htmlUrl === 'string' ? htmlUrl : RELEASES_URL }
  } catch {
    return null
  }
}

/**
 * Whether a network check should run now: throttled to once per 6 hours,
 * remembered in localStorage so every reload does not hit the API.
 * @param force - bypass the throttle (the settings page's manual check).
 * @returns true when the caller should fetch.
 */
export function shouldCheckNow(force: boolean = false): boolean {
  try {
    const last = Number.parseInt(window.localStorage.getItem(CHECK_THROTTLE_KEY) ?? '', 10)
    if (!force && Number.isFinite(last) && Date.now() - last < CHECK_THROTTLE_MS) return false
    window.localStorage.setItem(CHECK_THROTTLE_KEY, String(Date.now()))
    return true
  } catch {
    return force
  }
}

/**
 * The "install" action: copy the one-line install command for DSH to run (or
 * to paste into the in-app plugin installer) and open the release page.
 * @returns whether the command reached the clipboard.
 */
export async function installUpdate(): Promise<boolean> {
  window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')
  try {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
    return true
  } catch {
    return false
  }
}
