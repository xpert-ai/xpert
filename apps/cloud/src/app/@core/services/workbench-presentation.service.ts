import { computed, Injectable, signal } from '@angular/core'

/** A routed workbench borrows the shell without changing saved sidebar preferences. */
@Injectable({ providedIn: 'root' })
export class WorkbenchPresentationService {
  private readonly owners = signal<ReadonlySet<symbol>>(new Set())
  readonly immersive = computed(() => this.owners().size > 0)

  enter(): () => void {
    const owner = Symbol('workbench')
    this.owners.update((owners) => new Set([...owners, owner]))
    return () =>
      this.owners.update((owners) => {
        const next = new Set(owners)
        next.delete(owner)
        return next
      })
  }
}
