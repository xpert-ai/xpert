import { DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { XpertAccessRequestReviewListComponent } from '../../xpert-access-requests/review-requests-list.component'

@Component({
  standalone: true,
  selector: 'xp-agent-square-review-requests-dialog',
  imports: [
    CommonModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    XpertAccessRequestReviewListComponent
  ],
  template: `
    <section class="flex max-h-[82vh] w-[min(94vw,820px)] flex-col rounded-lg border border-border bg-card shadow-xl">
      <header class="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 class="text-lg font-semibold text-foreground">
            {{ 'PAC.Explore.AgentSquare.ReviewTitle' | translate: { Default: 'Requests to review' } }}
          </h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {{
              'PAC.Explore.AgentSquare.ReviewSubtitle'
                | translate: { Default: 'Approve or reject pending agent access requests.' }
            }}
          </p>
        </div>
        <button z-button zType="ghost" zSize="sm" type="button" (click)="close()">
          <z-icon zType="x" zSize="sm" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-auto p-5">
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
