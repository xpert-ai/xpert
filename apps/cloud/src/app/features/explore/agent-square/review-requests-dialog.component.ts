import { DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, XpDialogFrameImports } from '@xpert-ai/headless-ui'
import { XpertAccessRequestReviewListComponent } from '../../xpert-access-requests/review-requests-list.component'

@Component({
  standalone: true,
  selector: 'xp-agent-square-review-requests-dialog',
  imports: [
    CommonModule,
    TranslateModule,
    ZardButtonComponent,
    ...XpDialogFrameImports,
    XpertAccessRequestReviewListComponent
  ],
  template: `
    <section xpDialogLayout="wide" class="max-h-[82vh] w-[min(820px,calc(100vw-32px))]">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ 'XP.Explore.AgentSquare.ReviewTitle' | translate: { Default: 'Requests to review' } }}
        </h2>
        <p xpDialogDescription>
          {{
            'XP.Explore.AgentSquare.ReviewSubtitle'
              | translate: { Default: 'Approve or reject pending agent access requests.' }
          }}
        </p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="close()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>

      <div xpDialogBody>
        <xp-xpert-access-request-review-list (changed)="markChanged()" />
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentSquareReviewRequestsDialogComponent {
  readonly #dialogRef = inject(DialogRef<boolean>)
  readonly changed = signal(false)

  close() {
    this.#dialogRef.close(this.changed())
  }

  markChanged() {
    this.changed.set(true)
  }
}
