import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNDBQuery } from 'apps/cloud/src/app/@core'
import { XpertWorkflowPanelDBBaseComponent } from '../db/db.component'

@Component({
  selector: 'xp-workflow-panel-db-query',
  templateUrl: './db-query.component.html',
  styleUrls: ['./db-query.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule]
})
export class XpertWorkflowPanelDBQueryComponent extends XpertWorkflowPanelDBBaseComponent {
  // States
  readonly dbQueryEntity = linkedModel<IWFNDBQuery>({
    initialValue: null,
    compute: () => this.entity() as IWFNDBQuery,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly columns = attrModel(this.dbQueryEntity, 'columns')
  readonly where = attrModel(this.dbQueryEntity, 'where')
  readonly orderBy = attrModel(this.dbQueryEntity, 'orderBy')
  readonly limit = attrModel(this.dbQueryEntity, 'limit')

  readonly dbQueryExpand = signal(true)
  readonly dbWhereExpand = signal(true)
  readonly dbOrderByExpand = signal(false)

  toggleDBQueryExpand() {
    this.dbQueryExpand.update((expand) => !expand)
  }

  toggleDBWhereExpand() {
    this.dbWhereExpand.update((expand) => !expand)
  }

  toggleDBOrderByExpand() {
    this.dbOrderByExpand.update((expand) => !expand)
  }
}
