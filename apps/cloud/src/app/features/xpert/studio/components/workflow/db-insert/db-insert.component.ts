import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectXpertTableAPI,
  IWFNDBInsert,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'

@Component({
  selector: 'xp-workflow-node-db-insert',
  templateUrl: './db-insert.component.html',
  styleUrls: ['./db-insert.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeDBInsertComponent extends WorkflowBaseNodeComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly xpertTableAPI = injectXpertTableAPI()

  // States
  readonly dbInsertEntity = computed(() => this.entity() as IWFNDBInsert)

  readonly tableId = computed(() => this.dbInsertEntity()?.tableId)

  readonly #tableResource = myRxResource({
    request: () => this.tableId(),
    loader: ({ request }) => (request ? this.xpertTableAPI.getById(request) : null)
  })
  readonly table = this.#tableResource.value

  readonly name = computed(() => this.table()?.name)
  readonly description = computed(() => this.table()?.description)
}
