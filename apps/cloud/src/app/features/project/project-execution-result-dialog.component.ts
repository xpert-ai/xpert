import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { ExtensionHostOutletComponent } from '@cloud/app/@shared/view-extension/extension-host-outlet.component'

export interface ProjectExecutionResultDialogData {
  projectId: string
  viewKey: 'platform.agent-results__results' | 'platform.coding-execution__execution'
  selectionId: string
}
@Component({
  standalone: true,
  selector: 'xp-project-execution-result-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...XpDialogFrameImports, TranslateModule, ZardButtonComponent, ExtensionHostOutletComponent],
  template: `<section xpDialogLayout="wide" class="h-[min(84vh,800px)] max-h-[calc(100vh-32px)]">
    <header xpDialogHeader>
      <h2 xpDialogHeading>{{ 'XP.XProject.TaskExecutionResult' | translate }}</h2>
      <button
        z-button
        zType="ghost"
        xpDialogCloseButton
        type="button"
        [attr.aria-label]="'XP.XProject.Close' | translate"
        (click)="dialog.close()"
      >
        <z-icon zType="x" aria-hidden="true" />
      </button>
    </header>
    <div xpDialogBody class="min-h-0 flex-1">
      <xp-extension-host-outlet
        hostType="project"
        [hostId]="data.projectId"
        slot="task.management"
        [viewKey]="data.viewKey"
        [query]="query"
        [fillAvailableHeight]="true"
        mode="single-view"
      />
    </div>
  </section>`
})
export class XpertProjectExecutionResultDialogComponent {
  readonly data = inject<ProjectExecutionResultDialogData>(DIALOG_DATA)
  readonly dialog = inject(DialogRef)
  readonly query = { selectionId: this.data.selectionId }
}
