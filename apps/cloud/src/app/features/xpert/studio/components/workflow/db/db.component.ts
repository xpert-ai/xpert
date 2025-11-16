import { Component, computed } from '@angular/core'
import { myRxResource } from '@metad/ocap-angular/core'
import {
  injectXpertTableAPI,
  IWFNDBInsert,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'

@Component({
  selector: '',
  template: ''
})
export class XpertWorkflowNodeDBBaseComponent extends WorkflowBaseNodeComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly xpertTableAPI = injectXpertTableAPI()

  // States
  readonly dbEntity = computed(() => this.entity() as IWFNDBInsert)

  readonly tableId = computed(() => this.dbEntity()?.tableId)

  readonly #tableResource = myRxResource({
    request: () => this.tableId(),
    loader: ({ request }) => (request ? this.xpertTableAPI.getById(request) : null)
  })
  readonly table = this.#tableResource.value

  readonly name = computed(() => this.table()?.name)
  readonly description = computed(() => this.table()?.description)
}
