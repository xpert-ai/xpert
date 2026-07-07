import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { IXpertMarketplaceItem } from '@cloud/app/@core'

type AccessRequestDialogData = {
  item: IXpertMarketplaceItem
}

@Component({
  standalone: true,
  selector: 'xp-agent-square-access-request-dialog',
  imports: [CommonModule, FormsModule, TranslateModule, ZardButtonComponent],
  template: `
    <section class="w-[min(92vw,520px)] rounded-lg border border-border bg-card p-5 shadow-xl">
      <header class="space-y-2">
        <h2 class="text-lg font-semibold text-foreground">
          {{ 'PAC.Explore.AgentSquare.RequestAccessTitle' | translate: { Default: 'Request access' } }}
        </h2>
        <p class="text-sm leading-6 text-muted-foreground">
          {{ itemTitle() }}
        </p>
      </header>

      <label class="mt-5 block text-sm font-medium text-foreground">
        {{ 'PAC.Explore.AgentSquare.RequestReason' | translate: { Default: 'Reason' } }}
      </label>
      <textarea
        class="mt-2 min-h-28 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        [placeholder]="
          'PAC.Explore.AgentSquare.RequestReasonPlaceholder'
            | translate: { Default: 'Tell the owner what you plan to use this agent for.' }
        "
        [ngModel]="reason()"
        (ngModelChange)="reason.set($event)"
        maxlength="500"
      ></textarea>

      <footer class="mt-5 flex justify-end gap-2">
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button
          z-button
          type="button"
          class="bg-primary text-primary-foreground hover:bg-primary/90"
          (click)="submit()"
        >
          {{ 'PAC.Explore.AgentSquare.SubmitRequest' | translate: { Default: 'Submit request' } }}
        </button>
      </footer>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentSquareAccessRequestDialogComponent {
  readonly #dialogRef = inject(DialogRef<string | null>)
  readonly #data = inject<AccessRequestDialogData>(DIALOG_DATA)

  readonly reason = signal('')
  readonly item = this.#data.item

  itemTitle() {
    return this.item.xpert.title || this.item.xpert.titleCN || this.item.xpert.name
  }

  close() {
    this.#dialogRef.close(null)
  }

  submit() {
    this.#dialogRef.close(this.reason().trim())
  }
}
