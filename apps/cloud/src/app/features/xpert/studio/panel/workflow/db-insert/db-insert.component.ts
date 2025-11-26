import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, IWFNDBInsert, IXpertTable, ModelFeature, injectXpertTableAPI } from 'apps/cloud/src/app/@core'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { CommonModule } from '@angular/common'
import { Dialog } from '@angular/cdk/dialog'
import { WorkspaceSelectDatabaseComponent } from '@cloud/app/@shared/workspace'
import { TXpertTableColumn } from '@metad/contracts'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'

type InsertColumns = NonNullable<IWFNDBInsert['columns']>
type InsertColumnConfig = InsertColumns[keyof InsertColumns]

@Component({
  selector: 'xp-workflow-panel-db-insert',
  templateUrl: './db-insert.component.html',
  styleUrls: ['./db-insert.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule, StateVariableSelectComponent]
})
export class XpertWorkflowPanelDBInsertComponent extends XpertWorkflowBaseComponent {
  eModelType = AiModelTypeEnum
  eModelFeature = ModelFeature

  readonly dialog = inject(Dialog)
  readonly xpertTableAPI = injectXpertTableAPI()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly entity = computed(() => this.node()?.entity as IWFNDBInsert)
  readonly dbInsertEntity = linkedModel({
    initialValue: null,
    compute: () => this.entity(),
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })
  readonly tableId = attrModel(this.dbInsertEntity, 'tableId')
  readonly columns = attrModel(this.dbInsertEntity, 'columns')

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
  readonly columnEntries = computed(() => Object.entries(this.columns() ?? {}))

  constructor() {
    super()

    // Drop column mappings that no longer exist on the selected table
    effect(
      () => {
        const available = new Set(this.tableColumns().map((col) => col.name))
        const data = this.columns()
        if (!data || available.size === 0) {
          return
        }
        const filteredEntries = Object.entries(data).filter(([key]) => available.has(key))
        if (filteredEntries.length !== Object.keys(data).length) {
          const filtered = filteredEntries.reduce((acc, [key, value]) => {
            acc[key] = value
            return acc
          }, {} as InsertColumns)
          this.columns.set(Object.keys(filtered).length ? filtered : null)
        }
      },
      { allowSignalWrites: true }
    )
  }

  toggleDBTableExpand() {
    this.dbTableExpand.update((expand) => !expand)
  }

  toggleDBColumnsExpand() {
    this.dbColumnsExpand.update((expand) => !expand)
  }

  toggleDBOutputExpand() {
    this.dbOutputExpand.update((expand) => !expand)
  }

  addDBTable() {
    this.dialog.open<IXpertTable>(WorkspaceSelectDatabaseComponent, {
      data: {
        workspaceId: this.workspaceId()
      }
    }).closed.subscribe((dbTable: IXpertTable) => {
      if (dbTable) {
        this.tableId.set(dbTable.id)
        this.columns.set(null)
        this.dbColumnsExpand.set(true)
      }
    })
  }

  addDBColumn(columnName?: string) {
    const availableColumns = this.tableColumns()
    if (!availableColumns.length) {
      return
    }
    const usedColumns = new Set(Object.keys(this.columns() ?? {}))
    const nextColumn = columnName ?? availableColumns.find((column) => !usedColumns.has(column.name))?.name

    if (!nextColumn) {
      return
    }

    this.columns.update((state) => {
      const nextState: InsertColumns = { ...(state ?? {}) }
      nextState[nextColumn] = nextState[nextColumn] ?? {
        type: this.getColumnType(nextColumn),
        value: ''
      }
      return nextState
    })
  }

  removeDBColumn(columnName: string) {
    this.columns.update((state) => {
      if (!state?.[columnName]) {
        return state
      }
      const nextState: InsertColumns = { ...state }
      delete nextState[columnName]
      return Object.keys(nextState).length ? nextState : null
    })
  }

  updateColumnValue(columnName: string, name: string, value: string) {
    this.columns.update((state) => {
      const nextState: InsertColumns = { ...(state ?? {}) }
      nextState[columnName] = {
        ...(nextState[columnName] ?? { type: this.getColumnType(columnName) }),
        [name]: value
      }
      return nextState
    })
  }

  switchColumnMode(columnName: string) {
    this.columns.update((state) => {
      const nextState: InsertColumns = { ...(state ?? {}) }
      nextState[columnName] = {
        ...(nextState[columnName] ?? { type: this.getColumnType(columnName) }),
        valueSelector: nextState[columnName]?.valueSelector ? undefined : '{{}}'
      }
      return nextState
    })
  }

  getColumnType(columnName: string) {
    return this.tableColumns().find((column) => column.name === columnName)?.type ?? 'string'
  }

  columnTypeLabel(columnName: string) {
    const column = this.tableColumns().find((col) => col.name === columnName)
    return column?.type ?? this.columns()?.[columnName]?.type ?? 'string'
  }

  changeColumnName(previous: string, next: string) {
    if (!next || previous === next) {
      return
    }
    const existing = this.columns()
    if (existing?.[next]) {
      return
    }
    this.columns.update((state) => {
      const nextState: InsertColumns = { ...(state ?? {}) }
      const current = nextState[previous]
      delete nextState[previous]
      nextState[next] = {
        ...current,
        type: this.getColumnType(next) ?? current?.type ?? 'string'
      }
      return nextState
    })
  }

  trackColumnEntries(_index: number, entry: [string, InsertColumnConfig]) {
    return entry?.[0]
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
