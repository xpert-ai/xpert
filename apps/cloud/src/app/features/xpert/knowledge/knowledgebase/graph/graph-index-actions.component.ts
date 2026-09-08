import { Component, computed, DestroyRef, effect, inject, input, model, output, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { catchError, EMPTY, exhaustMap, finalize, switchMap, takeWhile, timer } from 'rxjs'
import {
  getErrorMessage,
  KnowledgebaseService,
  KnowledgeGraphStatus,
  KnowledgeGraphStatusResponse,
  ToastrService
} from '../../../../../@core'

/** Keeps graph indexing operations separate from graph browsing and editing. */
@Component({
  standalone: true,
  selector: 'xp-knowledge-graph-index-actions',
  imports: [TranslateModule, ZardButtonComponent, ZardIconComponent],
  template: `
    <button z-button type="button" zType="outline" [zDisabled]="!canRebuild()" (click)="rebuild()">
      <z-icon zType="refresh" [class.animate-spin]="requesting()" />
      {{ 'XP.Knowledgebase.RebuildGraph' | translate: { Default: 'Rebuild graph' } }}
    </button>
  `
})
export class KnowledgeGraphIndexActionsComponent {
  readonly #service = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)

  readonly knowledgebaseId = input<string>()
  readonly status = model<KnowledgeGraphStatusResponse | null>(null)
  readonly indexingComplete = output<void>()
  readonly requesting = signal(false)
  readonly canRebuild = computed(
    () =>
      !!this.knowledgebaseId() &&
      this.status()?.enabled === true &&
      this.status()?.status !== KnowledgeGraphStatus.INDEXING &&
      !this.requesting()
  )
  readonly #pollingKnowledgebaseId = computed(() =>
    this.status()?.enabled && this.status()?.status === KnowledgeGraphStatus.INDEXING ? this.knowledgebaseId() : null
  )

  constructor() {
    effect((onCleanup) => {
      const knowledgebaseId = this.#pollingKnowledgebaseId()
      if (!knowledgebaseId) return

      let errorReported = false
      const subscription = timer(2500, 2500)
        .pipe(
          exhaustMap(() =>
            this.#service.getGraphStatus(knowledgebaseId).pipe(
              catchError((error) => {
                if (!errorReported) this.#toastr.error(getErrorMessage(error))
                errorReported = true
                return EMPTY
              })
            )
          ),
          takeWhile((status) => status.enabled && status.status === KnowledgeGraphStatus.INDEXING, true)
        )
        .subscribe({
          next: (status) => {
            errorReported = false
            this.updateStatus(status)
          }
        })
      onCleanup(() => subscription.unsubscribe())
    })
  }

  rebuild() {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || !this.canRebuild()) return

    this.requesting.set(true)
    this.#service
      .rebuildGraph(knowledgebaseId)
      .pipe(
        switchMap(() => this.#service.getGraphStatus(knowledgebaseId)),
        takeUntilDestroyed(this.#destroyRef),
        finalize(() => this.requesting.set(false))
      )
      .subscribe({
        next: (status) => {
          this.#toastr.success('XP.Knowledgebase.GraphRebuildStarted', { Default: 'Graph rebuild started' })
          this.updateStatus(status)
        },
        error: (error) => this.#toastr.error(getErrorMessage(error))
      })
  }

  private updateStatus(status: KnowledgeGraphStatusResponse) {
    this.status.set(status)
    if (status.status !== KnowledgeGraphStatus.INDEXING) this.indexingComplete.emit()
  }
}
