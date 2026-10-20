import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { IMcpPublication } from '@xpert-ai/contracts'
import { injectConfirmDelete, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom, of } from 'rxjs'
import { getErrorMessage, injectToastr } from '../../../@core'

@Component({
  selector: 'xp-mcp-publication-actions',
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent],
  host: { class: 'flex items-center gap-2' },
  template: `
    @if (publication().status === 'disabled') {
      <button z-button zType="destructive" type="button" [zDisabled]="busy() || confirming()" (click)="remove()">
        {{ 'XP.McpPublication.Delete' | translate: { Default: 'Delete' } }}
      </button>
    }
    <button
      z-button
      type="button"
      [zType]="publication().status === 'active' ? 'destructive' : 'secondary'"
      [zDisabled]="busy() || confirming()"
      (click)="toggleStatus()"
    >
      {{
        publication().status === 'active'
          ? ('XP.McpPublication.Disable' | translate: { Default: 'Disable' })
          : ('XP.McpPublication.Enable' | translate: { Default: 'Enable' })
      }}
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class McpPublicationActionsComponent {
  readonly #destroyRef = inject(DestroyRef)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #confirmDelete = injectConfirmDelete()
  readonly publication = input.required<IMcpPublication>()
  readonly organizationId = input<string | null>(null)
  readonly busy = input(false)
  readonly confirming = signal(false)
  readonly statusChangeRequested = output<void>()
  readonly deleteRequested = output<string>()

  toggleStatus() {
    if (!this.busy() && !this.confirming()) this.statusChangeRequested.emit()
  }

  async remove() {
    const publication = this.publication()
    const organizationId = this.organizationId()
    if (publication.status !== 'disabled' || this.busy() || this.confirming()) return
    this.confirming.set(true)
    try {
      const shared = !!organizationId && !publication.organizationId
      const confirmed = await firstValueFrom(
        this.#confirmDelete(
          {
            title: this.#translate.instant('XP.McpPublication.DeleteTitle'),
            information: this.#translate.instant(
              shared ? 'XP.McpPublication.DeleteSharedConfirm' : 'XP.McpPublication.DeleteConfirm',
              { name: publication.name }
            )
          },
          () => of(true)
        ),
        { defaultValue: false }
      )
      if (
        !confirmed ||
        this.busy() ||
        this.#destroyRef.destroyed ||
        this.publication().id !== publication.id ||
        this.organizationId() !== organizationId ||
        this.publication().status !== 'disabled'
      )
        return
      this.deleteRequested.emit(publication.id)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.confirming.set(false)
    }
  }
}
