import { ChangeDetectionStrategy, Component, computed, Directive, effect, inject, signal } from '@angular/core'
import { attrModel, linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { WorkspaceSelectDatabaseComponent } from '@cloud/app/@shared/workspace'
import { IWorkflowNodeDBOperation, TXpertTableColumn } from '@metad/contracts'
import { AiModelTypeEnum, IXpertTable, ModelFeature, injectXpertTableAPI } from 'apps/cloud/src/app/@core'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'


@Component({
  selector: '',
  template: ''
})
export class XpertWorkflowPanelDBBaseComponent extends XpertWorkflowBaseComponent {
  eModelType = AiModelTypeEnum
  eModelFeature = ModelFeature

  readonly dialog = inject(Dialog)
  readonly xpertTableAPI = injectXpertTableAPI()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly entity = computed(() => this.node()?.entity as IWorkflowNodeDBOperation)
  readonly dbEntity = linkedModel({
    initialValue: null,
    compute: () => this.entity(),
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })
  readonly tableId = attrModel(this.dbEntity, 'tableId')

  readonly dbTableExpand = signal(true)
  readonly dbColumnsExpand = signal(true)
  readonly dbOutputExpand = signal(true)

  readonly #tableResource = myRxResource({
    request: () => this.tableId(),
    loader: ({ request }) => (request ? this.xpertTableAPI.getById(request) : null)
  })
  readonly table = this.#tableResource.value
  readonly tableLoading = computed(() => this.#tableResource.status() === 'loading')
  readonly tableColumns = computed(() => this.table()?.columns ?? [])
  readonly tableColumnPreview = computed(() => this.tableColumns().slice(0, 3))
  readonly tableColumnOverflow = computed(() => Math.max(this.tableColumns().length - 3, 0))

  toggleDBTableExpand() {
    this.dbTableExpand.update((expand) => !expand)
  }

  toggleDBOutputExpand() {
    this.dbOutputExpand.update((expand) => !expand)
  }

  addDBTable() {
    this.dialog
      .open<IXpertTable>(WorkspaceSelectDatabaseComponent, {
        data: {
          workspaceId: this.workspaceId()
        }
      })
      .closed.subscribe((dbTable: IXpertTable) => {
        if (dbTable) {
          this.tableId.set(dbTable.id)
          this.dbColumnsExpand.set(true)
        }
      })
  }

  tableColumnIcon(column: TXpertTableColumn) {
    switch (column.type) {
      case 'number':
        return 'ri-hashtag'
      case 'boolean':
        return 'ri-toggle-line'
      case 'date':
      case 'datetime':
        return 'ri-calendar-2-line'
      case 'json':
        return 'ri-braces-line'
      default:
        return 'ri-chat-3-line'
    }
  }
}
