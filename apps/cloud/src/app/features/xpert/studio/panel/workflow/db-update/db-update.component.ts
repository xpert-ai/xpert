import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, IWFNDBInsert, IWFNDBUpdate, ModelFeature, injectXpertTableAPI } from 'apps/cloud/src/app/@core'
import { CommonModule } from '@angular/common'
import { XpertVariableInputComponent } from '@cloud/app/@shared/agent/'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { XpertWorkflowPanelDBBaseComponent } from '../db/db.component'


@Component({
  selector: 'xp-workflow-panel-db-update',
  templateUrl: './db-update.component.html',
  styleUrls: ['./db-update.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule, XpertVariableInputComponent, StateVariableSelectComponent]
})
export class XpertWorkflowPanelDBUpdateComponent extends XpertWorkflowPanelDBBaseComponent {

  // States
  readonly dbInsertEntity = linkedModel<IWFNDBUpdate>({
    initialValue: null,
    compute: () => this.entity() as IWFNDBUpdate,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })
  readonly columns = attrModel(this.dbInsertEntity, 'columns')

}
