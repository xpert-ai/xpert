import { DOCUMENT } from '@angular/common'
import { computed, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { fromEvent } from 'rxjs'
import { Store } from '../../@core'

@Injectable({ providedIn: 'root' })
export class WorkspacePetPreference {
  private readonly window = inject(DOCUMENT).defaultView
  private readonly store = inject(Store)
  private readonly user = toSignal(this.store.user$, { initialValue: this.store.user })
  private readonly organizationId = toSignal(this.store.selectOrganizationId(), {
    initialValue: this.store.organizationId
  })
  private readonly key = computed(() => {
    const userId = this.user()?.id
    const orgId = this.organizationId()
    return userId && orgId ? `xpert:workspace-pet:hidden:${JSON.stringify([userId, orgId])}` : null
  })

  readonly current = computed(() => {
    const key = this.key()
    if (!key) return null

    const choice = signal(this.read(key))
    return {
      key,
      visible: choice.asReadonly(),
      reload: () => choice.set(this.read(key)),
      setVisible: (visible: boolean) => {
        choice.set(visible)
        try {
          this.window?.localStorage.setItem(key, visible ? '0' : '1')
        } catch {
          // Keep the personal choice for this session when storage is restricted.
        }
      }
    }
  })

  constructor() {
    if (this.window) {
      fromEvent<StorageEvent>(this.window, 'storage')
        .pipe(takeUntilDestroyed())
        .subscribe((event) => {
          const scope = this.current()
          if (scope && (event.key === null || event.key === scope.key)) scope.reload()
        })
    }
  }

  private read(key: string) {
    try {
      const hidden = this.window?.localStorage.getItem(key)
      if (hidden === '1' || hidden === '0') return hidden === '0'
    } catch {
      // Fall back to the host default.
    }
    return null
  }
}
