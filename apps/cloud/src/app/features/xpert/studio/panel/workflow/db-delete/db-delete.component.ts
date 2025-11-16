import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNDBDelete, IWFNDBSql } from 'apps/cloud/src/app/@core'
import { XpertWorkflowPanelDBBaseComponent } from '../db/db.component'

@Component({
  selector: 'xp-workflow-panel-db-delete',
  templateUrl: './db-delete.component.html',
  styleUrls: ['./db-delete.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule, CopilotPromptEditorComponent]
})
export class XpertWorkflowPanelDBDeleteComponent extends XpertWorkflowPanelDBBaseComponent {
  // States
  readonly dbDeleteEntity = linkedModel<IWFNDBDelete>({
    initialValue: null,
    compute: () => this.entity() as IWFNDBDelete,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })


  readonly dbDeleteExpand = signal(false)

  readonly toggleDBDeleteExpand = () => {
    this.dbDeleteExpand.update((expand) => !expand)
  }
}
