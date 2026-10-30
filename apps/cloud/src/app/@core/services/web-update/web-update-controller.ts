export interface WebRelease {
  buildId: string
  version: string
}

export type WebUpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'failed'

export interface WebUpdateState {
  status: WebUpdateStatus
  latest: WebRelease | null
  incomplete: boolean
  dismissed: boolean
}

export const UPDATE_SESSION_KEYS = {
  dismissed: 'xpert.web-update.dismissed',
  expected: 'xpert.web-update.expected'
} as const

export function isWebRelease(value: unknown): value is WebRelease {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buildId' in value &&
    typeof value.buildId === 'string' &&
    value.buildId.length > 0 &&
    'version' in value &&
    typeof value.version === 'string' &&
    value.version.length > 0
  )
}

/** Framework-independent state; the UI owns prompting and permission to leave. */
export class WebUpdateController {
  state: WebUpdateState = { status: 'idle', latest: null, incomplete: false, dismissed: false }
  private pending: Promise<void> | null = null
  private dismissedBuild: string | null
  private expectedBuild: string | null

  constructor(
    readonly current: WebRelease,
    private readonly fetchRelease: (signal: AbortSignal) => Promise<unknown>,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    private readonly changed: (state: WebUpdateState) => void
  ) {
    this.dismissedBuild = this.read(UPDATE_SESSION_KEYS.dismissed)
    this.expectedBuild = this.read(UPDATE_SESSION_KEYS.expected)
    this.state.incomplete = !!this.expectedBuild && this.expectedBuild !== current.buildId
  }

  check(): Promise<void> {
    if (this.pending) return this.pending
    this.publish({ status: 'checking' })
    this.pending = this.load().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  dismiss(buildId = this.state.latest?.buildId) {
    if (!buildId) return
    this.dismissedBuild = buildId
    this.write(UPDATE_SESSION_KEYS.dismissed, this.dismissedBuild)
    this.publish({ dismissed: this.state.latest?.buildId === buildId })
  }

  expectUpdate(): boolean {
    if (!this.state.latest || this.state.latest.buildId === this.current.buildId) return false
    this.expectedBuild = this.state.latest.buildId
    this.write(UPDATE_SESSION_KEYS.expected, this.expectedBuild)
    return true
  }

  private async load() {
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const release = await Promise.race([
        this.fetchRelease(abort.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort.abort()
            reject(new Error('Version check timed out'))
          }, 5000)
        })
      ])
      if (!isWebRelease(release)) throw new Error('Invalid web release')
      const current = release.buildId === this.current.buildId
      if (current || this.expectedBuild === this.current.buildId) {
        this.expectedBuild = null
        this.write(UPDATE_SESSION_KEYS.expected, null)
      }
      this.publish({
        latest: release,
        status: current ? 'current' : 'available',
        incomplete: !!this.expectedBuild,
        dismissed: release.buildId === this.dismissedBuild
      })
    } catch {
      this.publish({ status: 'failed' })
    } finally {
      clearTimeout(timer)
    }
  }

  private publish(patch: Partial<WebUpdateState>) {
    this.state = { ...this.state, ...patch }
    this.changed(this.state)
  }

  private read(key: string) {
    try {
      return this.storage.getItem(key)
    } catch {
      return null
    }
  }

  private write(key: string, value: string | null) {
    try {
      if (value === null) this.storage.removeItem(key)
      else this.storage.setItem(key, value)
    } catch {
      /* Private browsing can disable storage; keep this page's in-memory state. */
    }
  }
}
