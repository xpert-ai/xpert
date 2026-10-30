import { DestroyRef, Injectable } from '@angular/core'

/** Reuses mounted editors' route leave checks before a full-page update. */
@Injectable({ providedIn: 'root' })
export class PageLeaveService {
  private readonly checks = new Set<() => Promise<boolean>>()

  register(check: () => Promise<boolean>, owner: DestroyRef) {
    this.checks.add(check)
    owner.onDestroy(() => this.checks.delete(check))
  }

  async prepareLeave(): Promise<boolean> {
    for (const check of this.checks) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        // Prompt in sequence; a cancelled, failed or stalled check must not reload.
        const allowed = await Promise.race([
          check(),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), 15000)
          })
        ])
        if (allowed !== true) return false
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    }
    return true
  }
}
