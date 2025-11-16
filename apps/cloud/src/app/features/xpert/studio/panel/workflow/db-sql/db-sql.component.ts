import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNDBSql } from 'apps/cloud/src/app/@core'
import { XpertWorkflowPanelDBBaseComponent } from '../db/db.component'

@Component({
  selector: 'xp-workflow-panel-db-sql',
  templateUrl: './db-sql.component.html',
  styleUrls: ['./db-sql.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule, CopilotPromptEditorComponent]
})
export class XpertWorkflowPanelDBSQLComponent extends XpertWorkflowPanelDBBaseComponent {
  // States
  readonly dbSqlEntity = linkedModel<IWFNDBSql>({
    initialValue: null,
    compute: () => this.entity() as IWFNDBSql,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly sqlTemplate = attrModel(this.dbSqlEntity, 'sqlTemplate')

  readonly dbSqlExpand = signal(false)

  readonly toggleDBSqlExpand = () => {
    this.dbSqlExpand.update((expand) => !expand)
  }
}
