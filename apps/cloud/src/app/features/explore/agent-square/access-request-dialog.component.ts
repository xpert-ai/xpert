import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { XpDialogFrameImports, ZardInputDirective, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { IXpertMarketplaceItem } from '@cloud/app/@core'

type AccessRequestDialogData = {
  item: IXpertMarketplaceItem
}

@Component({
  standalone: true,
  selector: 'xp-agent-square-access-request-dialog',
  imports: [
    ...XpDialogFrameImports,
    ZardInputDirective,
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent
  ],
  template: `
    <section xpDialogLayout="standard" class="w-[min(520px,calc(100vw-32px))] max-h-[84vh]">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ 'XP.Explore.AgentSquare.RequestAccessTitle' | translate: { Default: 'Request access' } }}
        </h2>
        <p xpDialogDescription>
          {{ itemTitle() }}
        </p>
      </header>

      <div xpDialogBody>
        <div class="space-y-2">
          <label for="agent-access-reason" class="block text-sm font-medium text-foreground">
            {{ 'XP.Explore.AgentSquare.RequestReason' | translate: { Default: 'Reason' } }}
          </label>
          <textarea
            z-input
            id="agent-access-reason"
            class="min-h-28 w-full resize-y"
            [placeholder]="
              'XP.Explore.AgentSquare.RequestReasonPlaceholder'
                | translate: { Default: 'Tell the owner what you plan to use this agent for.' }
            "
            [ngModel]="reason()"
            (ngModelChange)="reason.set($event)"
            maxlength="500"
          ></textarea>
        </div>
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button z-button type="button" (click)="submit()">
          {{ 'XP.Explore.AgentSquare.SubmitRequest' | translate: { Default: 'Submit request' } }}
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
