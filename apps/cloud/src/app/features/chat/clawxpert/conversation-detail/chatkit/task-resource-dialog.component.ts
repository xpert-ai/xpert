import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { TChatElementReference } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { ClawXpertConversationPreviewComponent } from '../../clawxpert-conversation-preview.component'
import { FileChangeReviewComponent } from '../../file-change-review.component'
import type { FileChangeReviewTab } from '../../file-change-review.types'

type TaskResourcePreview =
  | { kind: 'review'; tab: FileChangeReviewTab }
  | { kind: 'browser'; conversationId: string | null; serviceId?: string; url?: string }

/** Fallback for resource effects not handled by the embedded ChatKit workbench. */
@Component({
  standalone: true,
  selector: 'xp-chatkit-task-resource-dialog',
  imports: [
    ...XpDialogFrameImports,
    ZardButtonComponent,
    TranslateModule,
    ClawXpertConversationPreviewComponent,
    FileChangeReviewComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section xpDialogLayout="wide" class="flex h-full min-h-0 flex-col">
      <header xpDialogHeader>
        <h2 xpDialogHeading>{{ data.title | translate }}</h2>
        <button
          z-button
          zType="ghost"
          zSize="icon"
          xpDialogCloseButton
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="ref.close()"
        >
          <z-icon zType="x" />
        </button>
      </header>
      <div xpDialogBody="section" class="min-h-0 flex-1 overflow-hidden">
        @if (data.preview.kind === 'review') {
          <xp-file-change-review [tab]="data.preview.tab" />
        } @else {
          <xp-clawxpert-conversation-preview
            class="block h-full min-h-0"
            [conversationId]="data.preview.conversationId"
            [serviceId]="data.preview.serviceId"
            [url]="data.preview.url"
            (referenceRequest)="data.onReference?.($event)"
          />
        }
      </div>
    </section>
  `
})
export class ChatkitTaskResourceDialogComponent {
  readonly data = inject<{
    title: string
    preview: TaskResourcePreview
    onReference?: (reference: TChatElementReference) => void
  }>(DIALOG_DATA)
  readonly ref = inject(DialogRef)
}

export function openChatkitTaskResourceDialog(
  dialog: Dialog,
  title: string,
  preview: TaskResourcePreview,
  onReference?: (reference: TChatElementReference) => void
) {
  return dialog.open(ChatkitTaskResourceDialogComponent, {
    data: { title, preview, onReference },
    width: 'min(1440px, calc(100vw - 32px))',
    height: 'min(960px, calc(100dvh - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100dvh - 32px)',
    backdropClass: 'backdrop-blur-xs-black',
    panelClass: 'xp-overlay-pane-dialog'
  })
}
