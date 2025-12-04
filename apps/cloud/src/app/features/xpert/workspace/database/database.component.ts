import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, model, OnDestroy, OnInit, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { OverlayAnimation1 } from '@metad/core'
import { CdkConfirmDeleteComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { map, shareReplay, Subject, takeUntil } from 'rxjs'
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
    NgmSelectComponent,
    NgmI18nPipe
  ],
  selector: 'xp-workspace-database',
  templateUrl: './database.component.html',
  styleUrl: 'database.component.scss',
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceDatabaseComponent implements OnInit, OnDestroy {
  eXpertTableStatus = XpertTableStatus

  readonly #translate = inject(TranslateService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly colI18n = injectTranslate('PAC.Xpert.MemoryCols')
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly xpertTableAPI = injectXpertTableAPI()
  readonly xpertService = inject(XpertAPIService)
  readonly #clipboard = inject(Clipboard)
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly #destroy$ = new Subject<void>()

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

  // 下拉框占位符（支持多语言）
  // Placeholder for select components (multi-language support)
  readonly statusPlaceholder = signal('All Status')
  readonly databasePlaceholder = signal('All Databases')

  // 状态选项 - 使用 signal 以支持语言切换
  // Status options - use signal for language switching
  readonly statusOptions = signal<TSelectOption[]>([
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
  ])

  // 基础数据类型（通用）- 使用 signal 以支持语言切换
  // Basic data types (common) - use signal for language switching
  readonly types = signal<TSelectOption[]>([
    {
      value: 'string',
      label: {
        en_US: 'String (VARCHAR)',
        zh_Hans: '字符串 (VARCHAR)'
      }
    },
    {
      value: 'text',
      label: {
        en_US: 'Long Text (TEXT)',
        zh_Hans: '长文本 (TEXT)'
      }
    },
    {
      value: 'number',
      label: {
        en_US: 'Integer (INT)',
        zh_Hans: '整数 (INT)'
      }
    },
    {
      value: 'bigint',
      label: {
        en_US: 'Big Integer (BIGINT)',
        zh_Hans: '大整数 (BIGINT)'
      }
    },
    {
      value: 'decimal',
      label: {
        en_US: 'Decimal (DECIMAL)',
        zh_Hans: '小数 (DECIMAL)'
      }
    },
    {
      value: 'float',
      label: {
        en_US: 'Float (FLOAT)',
        zh_Hans: '浮点数 (FLOAT)'
      }
    },
    {
      value: 'boolean',
      label: {
        en_US: 'Boolean',
        zh_Hans: '布尔值 (BOOLEAN)'
      }
    },
    {
      value: 'date',
      label: {
        en_US: 'Date',
        zh_Hans: '日期 (DATE)'
      }
    },
    {
      value: 'datetime',
      label: {
        en_US: 'DateTime',
        zh_Hans: '日期时间 (DATETIME)'
      }
    },
    {
      value: 'timestamp',
      label: {
        en_US: 'Timestamp',
        zh_Hans: '时间戳 (TIMESTAMP)'
      }
    },
    {
      value: 'time',
      label: {
        en_US: 'Time',
        zh_Hans: '时间 (TIME)'
      }
    },
    {
      value: 'uuid',
      label: {
        en_US: 'UUID',
        zh_Hans: 'UUID'
      }
    },
    {
      value: 'object',
      label: {
        en_US: 'JSON Object',
        zh_Hans: 'JSON对象'
      }
    }
  ])

  readonly databases$ = this.xpertTableAPI.getDatabases().pipe(
    map((databases) => {
      return databases.map((db) => ({
        value: db.id,
        label: db.name
      }))
    }),
    shareReplay(1)
  )

  /**
   * 初始化 - 订阅语言变化事件
   * Initialize - subscribe to language change events
   */
  ngOnInit() {
    // 初始化翻译文本
    // Initialize translated texts
    this.updateTranslations()
    
    // 订阅语言变化事件，更新所有翻译文本
    // Subscribe to language change events and update all translated texts
    this.#translate.onLangChange
      .pipe(takeUntil(this.#destroy$))
      .subscribe(() => {
        this.updateTranslations()
        this.#cdr.markForCheck() // 触发变更检测
      })
  }
  
  /**
   * 更新所有翻译文本
   * Update all translated texts
   */
  private updateTranslations() {
    this.statusPlaceholder.set(
      this.#translate.instant('PAC.Workspace.AllStatus', {Default: 'All Status'})
    )
    this.databasePlaceholder.set(
      this.#translate.instant('PAC.Workspace.AllDatabases', {Default: 'All Databases'})
    )
    
    // 重新创建选项数组，包括每个 label 对象的新引用，以触发 i18n 管道重新计算
    // Recreate option arrays with new label object references to trigger i18n pipe recalculation
    const currentStatusOptions = this.statusOptions()
    this.statusOptions.set(currentStatusOptions.map(opt => ({
      ...opt,
      label: { ...opt.label as any }
    })))
    
    const currentTypes = this.types()
    this.types.set(currentTypes.map(opt => ({
      ...opt,
      label: { ...opt.label as any }
    })))
  }

  /**
   * 销毁 - 清理订阅
   * Destroy - cleanup subscriptions
   */
  ngOnDestroy() {
    this.#destroy$.next()
    this.#destroy$.complete()
  }

  addTable() {
    this.table.set({
      name: ''
    })
  }

  /**
   * 添加新字段
   * Add new column
   */
  addColumn() {
    const columns = [
      ...(this.table().columns ?? []),
      { 
        name: '', 
        label: '', 
        type: 'string', 
        required: false,
        isPrimaryKey: false,
        isUnique: false,
        autoIncrement: false,
        defaultValue: '',
        length: undefined
      } as TXpertTableColumn
    ]
    this.table.update((v) => ({ ...v, columns }))
  }

  /**
   * 删除字段
   * Remove column
   */
  removeColumn(index: number) {
    const columns = [...(this.table().columns ?? [])]
    columns.splice(index, 1)
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
    
    // 使用 upsert 方法，如果有 id 则更新，否则创建
    // Use upsert method, update if id exists, otherwise create
    const isUpdate = !!this.table().id
    this.xpertTableAPI.upsert(this.table()).subscribe({
      next: () => {
        this.#loading.set(false)
        const message = isUpdate
          ? this.#translate.instant('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated Successfully' })
          : this.#translate.instant('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully' })
        this.#toastr.success(message)
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

  /**
   * 删除表（包括物理表）
   * Delete table (including physical table)
   */
  deleteTable(table: IXpertTable) {
    // 打开确认删除对话框
    // Open confirm delete dialog
    const infoText = this.#translate.instant('PAC.Workspace.DeleteTableInfo', {
      Default: 'This operation will delete the physical table in the database and cannot be recovered!',
      name: table.name,
      description: table.description || this.#translate.instant('PAC.KEY_WORDS.None', {Default: 'None'}),
      status: table.status
    })
    
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: table.name,
          information: `${infoText}\n\n${this.#translate.instant('PAC.Workspace.TableName', {Default: 'Table Name'})}: ${table.name}\n${this.#translate.instant('PAC.KEY_WORDS.Description', {Default: 'Description'})}: ${table.description || this.#translate.instant('PAC.KEY_WORDS.None', {Default: 'None'})}\n${this.#translate.instant('PAC.KEY_WORDS.Status', {Default: 'Status'})}: ${table.status}`
        }
      })
      .closed.subscribe({
        next: (confirmed) => {
          if (!confirmed) {
            return
          }

          // 执行删除操作
          // Execute delete operation
          this.#loading.set(true)
          this.xpertTableAPI.deleteTable(table.id).subscribe({
            next: () => {
              this.#loading.set(false)
              this.#toastr.success(
                this.#translate.instant('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted Successfully' })
              )
              this.#tablesResource.reload()
            },
            error: (err) => {
              this.#loading.set(false)
              this.#toastr.danger(getErrorMessage(err))
            }
          })
        }
      })
  }

  /**
   * 获取约束标签的翻译文本
   * Get translated text for constraint labels
   */
  getConstraintLabelText(constraint: 'pk' | 'required' | 'unique' | 'autoIncrement'): string {
    const translationKeys = {
      pk: 'PAC.Workspace.PrimaryKeyShort',
      required: 'PAC.Workspace.RequiredShort',
      unique: 'PAC.Workspace.UniqueShort',
      autoIncrement: 'PAC.Workspace.AutoIncrementShort'
    }
    
    const defaults = {
      pk: 'PK',
      required: 'Required',
      unique: 'Unique',
      autoIncrement: 'Auto Inc'
    }
    
    return this.#translate.instant(translationKeys[constraint], {Default: defaults[constraint]})
  }
}
