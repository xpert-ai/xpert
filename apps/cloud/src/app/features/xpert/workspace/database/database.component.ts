import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { OverlayAnimation1 } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { map, shareReplay } from 'rxjs'
import {
  getErrorMessage,
  injectToastr,
  injectTranslate,
  injectXpertTableAPI,
  IXpertTable,
  TSelectOption,
  TXpertTableColumn,
  XpertAPIService,
  XpertTableStatus
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    NgmSpinComponent,
    NgmSelectComponent
  ],
  selector: 'xp-workspace-database',
  templateUrl: './database.component.html',
  styleUrl: 'database.component.scss',
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceDatabaseComponent {
  eXpertTableStatus = XpertTableStatus

  readonly #translate = inject(TranslateService)
  readonly colI18n = injectTranslate('PAC.Xpert.MemoryCols')
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly xpertTableAPI = injectXpertTableAPI()
  readonly xpertService = inject(XpertAPIService)
  readonly #clipboard = inject(Clipboard)
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)

  readonly workspace = this.homeComponent.workspace
  readonly #tablesResource = myRxResource({
    request: () => {
      return {
        workspaceId: this.workspace()?.id
      }
    },
    loader: ({ request }) => {
      return request.workspaceId
        ? this.xpertTableAPI.getAll({
            where: {
              workspaceId: request.workspaceId
            }
          })
        : null
    }
  })

  readonly status = model<XpertTableStatus>(null)
  readonly dataSourceId = model<string>(null)
  readonly tables = computed(() => {
    const status = this.status()
    const dataSourceId = this.dataSourceId()
    const databases = this.#tablesResource.value()?.items || []
    if (status || dataSourceId) {
      return databases.filter((table) => {
        return (
          (status ? table.status === status : true) &&
          (dataSourceId ? table.database === dataSourceId : true)
        )
      })
    }
    return databases
  })
  readonly #loading = signal(false)
  readonly loading = computed(() => this.#tablesResource.status() === 'loading' || this.#loading())

  readonly search = model<string>('')

  // Edit table
  readonly table = model<Partial<IXpertTable> | null>(null)
  readonly database = attrModel(this.table, 'database')
  readonly name = attrModel(this.table, 'name')
  readonly description = attrModel(this.table, 'description')
  readonly #schemasRs = myRxResource({
    request: () => ({
      databaseId: this.database()
    }),
    loader: ({ request }) => {
      if (request.databaseId) {
        return this.xpertTableAPI.getDatabaseSchemas(request.databaseId)
      }
      return null
    }
  })
  readonly schema = attrModel(this.table, 'schema')
  readonly columns = attrModel(this.table, 'columns')
  
  readonly schemasOptions = computed(() => {
    return (this.#schemasRs.value() || []).map((schema) => ({
      value: schema.name,
      label: schema.name
    }))
  })

  readonly statusOptions: TSelectOption[] = [
    {
      value: XpertTableStatus.ACTIVE,
      label: {
        en_US: 'Active',
        zh_Hans: '已激活'
      }
    },
    {
      value: XpertTableStatus.DRAFT,
      label: {
        en_US: 'Draft',
        zh_Hans: '草稿'
      }
    },
    {
      value: XpertTableStatus.PENDING_ACTIVATION,
      label: {
        en_US: 'Pending Activation',
        zh_Hans: '激活中'
      }
    },
    {
      value: XpertTableStatus.ERROR,
      label: {
        en_US: 'Error',
        zh_Hans: '错误'
      }
    },
    {
      value: XpertTableStatus.NEEDS_MIGRATION,
      label: {
        en_US: 'Needs Migration',
        zh_Hans: '需要迁移'
      }
    },
    {
      value: XpertTableStatus.DEPRECATED,
      label: {
        en_US: 'Deprecated',
        zh_Hans: '已弃用'
      }
    }
  ]

  readonly types: TSelectOption[] = [
    {
      value: 'string',
      label: {
        en_US: 'String',
        zh_Hans: '字符串'
      }
    },
    {
      value: 'number',
      label: {
        en_US: 'Number',
        zh_Hans: '数字'
      }
    },
    {
      value: 'boolean',
      label: {
        en_US: 'Boolean',
        zh_Hans: '布尔值'
      }
    },
    {
      value: 'date',
      label: {
        en_US: 'Date',
        zh_Hans: '日期'
      }
    },
    {
      value: 'datetime',
      label: {
        en_US: 'DateTime',
        zh_Hans: '日期时间'
      }
    },
    {
      value: 'object',
      label: {
        en_US: 'Object',
        zh_Hans: '对象'
      }
    }
  ]

  readonly databases$ = this.xpertTableAPI.getDatabases().pipe(
    map((databases) => {
      return databases.map((db) => ({
        value: db.id,
        label: db.name
      }))
    }),
    shareReplay(1)
  )

  addTable() {
    this.table.set({
      name: ''
    })
  }

  addColumn() {
    const columns = [
      ...(this.table().columns ?? []),
      { name: '', label: '', type: 'string', required: false } as TXpertTableColumn
    ]
    this.table.update((v) => ({ ...v, columns }))
  }

  removeColumn(index: number) {
    const columns = [...(this.table().columns ?? [])]
    columns.splice(index, 1)
    this.table.update((v) => ({ ...v, columns }))
  }

  toggleRequired(index: number) {
    const columns = [...(this.table().columns ?? [])]
    columns[index].required = !columns[index].required
    this.table.update((v) => ({ ...v, columns }))
  }

  editTable(table: IXpertTable) {
    this.table.set({ ...table })
  }

  save() {
    this.#loading.set(true)
    if (!this.table().workspaceId) {
      this.table.update((v) => ({ ...v, workspaceId: this.workspace()?.id }))
    }
    this.xpertTableAPI.create(this.table()).subscribe({
      next: () => {
        this.#loading.set(false)
        this.#toastr.success(this.#translate.instant('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully' }))
        this.#tablesResource.reload()
        this.table.set(null)
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.danger(getErrorMessage(err))
      }
    })
  }

  activate(tableId: string) {
    this.#loading.set(true)
    this.xpertTableAPI.activateTable(tableId).subscribe({
      next: () => {
        this.#loading.set(false)
        this.#toastr.success(this.#translate.instant('PAC.Xpert.MemoryMessages.TableActivationStarted', { Default: 'Table activation started' }))
        this.#tablesResource.reload()
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.danger(getErrorMessage(err))
      }
    })
  }
}
