import { DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-workspace-connector-migration-dialog',
  imports: [...XpDialogFrameImports, ZardButtonComponent, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section xpDialogLayout="standard" class="w-[448px] max-w-full">
      <header xpDialogHeader>
        <h2 xpDialogHeading>{{ 'XP.Xpert.Connectors' | translate }}</h2>
      </header>
      <div xpDialogBody>
        <p xpDialogDescription>{{ 'XP.Xpert.ConnectorWorkspaceMigration' | translate }}</p>
      </div>
      <footer xpDialogFooter>
        <button z-button type="button" zType="outline" (click)="dialog.close()">
          {{ 'XP.ACTIONS.Cancel' | translate }}
        </button>
        <button z-button type="button" (click)="dialog.close('manage')">
          {{ 'XP.Xpert.ConnectorManageWorkspace' | translate }}
        </button>
      </footer>
    </section>
  `
})
export class WorkspaceConnectorMigrationDialogComponent {
  readonly dialog = inject<DialogRef<'manage'>>(DialogRef)
}
