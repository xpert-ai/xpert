import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, model, OnDestroy, OnInit, signal } from '@angular/core'
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
  readonly #isClosing = signal(false)  // Flag to prevent side effects when closing
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
  
  // Track previous database ID to detect changes
  readonly #previousDatabaseId = signal<string | undefined>(undefined)
  readonly columns = attrModel(this.table, 'columns')
  
  // Clear schema when database changes - effect must be in field initializer (injection context)
  readonly #schemaClearEffect = effect(() => {
    // Skip if we're closing the dialog to prevent side effects
    if (this.#isClosing()) {
      return
    }
    
    // Skip if table is null (dialog is closed)
    if (!this.table()) {
      return
    }
    
    const databaseId = this.database()
    const previousDatabaseId = this.#previousDatabaseId()
    
    // If database changed, clear schema immediately
    if (databaseId !== previousDatabaseId && previousDatabaseId !== undefined) {
      // Database changed, clear schema immediately to avoid mismatch errors
      // Use setTimeout to ensure this happens after Angular's change detection
      setTimeout(() => {
        // Double check: table still exists and we're not closing
        if (this.table() && !this.#isClosing()) {
          this.schema.set(undefined)
          this.#previousDatabaseId.set(databaseId)
          this.#cdr.markForCheck()
        }
      }, 0)
      return
    }
    
    // Update previous database ID if it's the first time
    if (previousDatabaseId === undefined && databaseId !== undefined) {
      this.#previousDatabaseId.set(databaseId)
    }
    
    // Also check if current schema is valid in the current database's schema list
    // Only check after schemas have been loaded (when availableSchemas.length > 0)
    const currentSchema = this.schema()
    const availableSchemas = this.schemasOptions()
    
    // Wait for schemas to load before validating
    if (databaseId && currentSchema && availableSchemas.length > 0) {
      const schemaExists = availableSchemas.some(s => s.value === currentSchema)
      if (!schemaExists) {
        // Current schema doesn't exist in the new database, clear it
        setTimeout(() => {
          // Double check: table still exists and we're not closing
          if (this.table() && !this.#isClosing()) {
            this.schema.set(undefined)
            this.#cdr.markForCheck()
          }
        }, 0)
      }
    }
  }, { allowSignalWrites: true })
  
  readonly schemasOptions = computed(() => {
    return (this.#schemasRs.value() || []).map((schema) => ({
      value: schema.name,
      label: schema.name
    }))
  })

  // Placeholder for select components (multi-language support)
  readonly statusPlaceholder = signal('All Status')
  readonly databasePlaceholder = signal('All Databases')

  // Status options (use multi-language object, i18n pipe will handle automatically)
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

  // MySQL data types
  readonly mysqlTypes: TSelectOption[] = [
    // Numeric types - Integers
    {
      value: 'tinyint',
      label: {
        en_US: 'tinyint',
        zh_Hans: 'tinyint'
      }
    },
    {
      value: 'smallint',
      label: {
        en_US: 'smallint',
        zh_Hans: 'smallint'
      }
    },
    {
      value: 'mediumint',
      label: {
        en_US: 'mediumint',
        zh_Hans: 'mediumint'
      }
    },
    {
      value: 'number',
      label: {
        en_US: 'int',
        zh_Hans: 'int'
      }
    },
    {
      value: 'bigint',
      label: {
        en_US: 'bigint',
        zh_Hans: 'bigint'
      }
    },
    // Numeric types - Floating point
    {
      value: 'float',
      label: {
        en_US: 'float',
        zh_Hans: 'float'
      }
    },
    {
      value: 'double',
      label: {
        en_US: 'double',
        zh_Hans: 'double'
      }
    },
    {
      value: 'decimal',
      label: {
        en_US: 'decimal',
        zh_Hans: 'decimal'
      }
    },
    // String types - Fixed/Variable length
    {
      value: 'char',
      label: {
        en_US: 'char',
        zh_Hans: 'char'
      }
    },
    {
      value: 'string',
      label: {
        en_US: 'varchar',
        zh_Hans: 'varchar'
      }
    },
    // String types - Text
    {
      value: 'tinytext',
      label: {
        en_US: 'tinytext',
        zh_Hans: 'tinytext'
      }
    },
    {
      value: 'text',
      label: {
        en_US: 'text',
        zh_Hans: 'text'
      }
    },
    {
      value: 'mediumtext',
      label: {
        en_US: 'mediumtext',
        zh_Hans: 'mediumtext'
      }
    },
    {
      value: 'longtext',
      label: {
        en_US: 'longtext',
        zh_Hans: 'longtext'
      }
    },
    // String types - Binary
    {
      value: 'tinyblob',
      label: {
        en_US: 'tinyblob',
        zh_Hans: 'tinyblob'
      }
    },
    {
      value: 'blob',
      label: {
        en_US: 'blob',
        zh_Hans: 'blob'
      }
    },
    {
      value: 'mediumblob',
      label: {
        en_US: 'mediumblob',
        zh_Hans: 'mediumblob'
      }
    },
    {
      value: 'longblob',
      label: {
        en_US: 'longblob',
        zh_Hans: 'longblob'
      }
    },
    // String types - Special
    {
      value: 'enum',
      label: {
        en_US: 'enum',
        zh_Hans: 'enum'
      }
    },
    {
      value: 'set',
      label: {
        en_US: 'set',
        zh_Hans: 'set'
      }
    },
    // Date and time types
    {
      value: 'date',
      label: {
        en_US: 'date',
        zh_Hans: 'date'
      }
    },
    {
      value: 'time',
      label: {
        en_US: 'time',
        zh_Hans: 'time'
      }
    },
    {
      value: 'datetime',
      label: {
        en_US: 'datetime',
        zh_Hans: 'datetime'
      }
    },
    {
      value: 'timestamp',
      label: {
        en_US: 'timestamp',
        zh_Hans: 'timestamp'
      }
    },
    {
      value: 'year',
      label: {
        en_US: 'year',
        zh_Hans: 'year'
      }
    },
    // JSON type
    {
      value: 'object',
      label: {
        en_US: 'json',
        zh_Hans: 'json'
      }
    },
    // Spatial types
    {
      value: 'geometry',
      label: {
        en_US: 'geometry',
        zh_Hans: 'geometry'
      }
    },
    {
      value: 'point',
      label: {
        en_US: 'point',
        zh_Hans: 'point'
      }
    },
    {
      value: 'linestring',
      label: {
        en_US: 'linestring',
        zh_Hans: 'linestring'
      }
    },
    {
      value: 'polygon',
      label: {
        en_US: 'polygon',
        zh_Hans: 'polygon'
      }
    },
    {
      value: 'multipoint',
      label: {
        en_US: 'multipoint',
        zh_Hans: 'multipoint'
      }
    },
    {
      value: 'multilinestring',
      label: {
        en_US: 'multilinestring',
        zh_Hans: 'multilinestring'
      }
    },
    {
      value: 'multipolygon',
      label: {
        en_US: 'multipolygon',
        zh_Hans: 'multipolygon'
      }
    },
    {
      value: 'geometrycollection',
      label: {
        en_US: 'geometrycollection',
        zh_Hans: 'geometrycollection'
      }
    },
    // Other
    {
      value: 'boolean',
      label: {
        en_US: 'boolean',
        zh_Hans: 'boolean'
      }
    }
  ]

  readonly databases$ = this.xpertTableAPI.getDatabases().pipe(
    map((databases) => {
      return databases.map((db: any) => ({
        value: db.id,
        label: db.name,
        type: db.type  // Store database type (e.g., 'mysql', 'postgres')
      }))
    }),
    shareReplay(1)
  )

  // Store database type map
  readonly #databaseTypeMap = signal<Map<string, string>>(new Map())
  
  // PostgreSQL data types
  readonly postgresTypes: TSelectOption[] = [
    // Numeric types - Integers
    {
      value: 'smallint',
      label: {
        en_US: 'smallint',
        zh_Hans: 'smallint'
      }
    },
    {
      value: 'number',
      label: {
        en_US: 'integer',
        zh_Hans: 'integer'
      }
    },
    {
      value: 'bigint',
      label: {
        en_US: 'bigint',
        zh_Hans: 'bigint'
      }
    },
    {
      value: 'serial',
      label: {
        en_US: 'serial',
        zh_Hans: 'serial'
      }
    },
    {
      value: 'bigserial',
      label: {
        en_US: 'bigserial',
        zh_Hans: 'bigserial'
      }
    },
    // Numeric types - Floating point
    {
      value: 'real',
      label: {
        en_US: 'real',
        zh_Hans: 'real'
      }
    },
    {
      value: 'float',
      label: {
        en_US: 'double precision',
        zh_Hans: 'double precision'
      }
    },
    {
      value: 'decimal',
      label: {
        en_US: 'numeric',
        zh_Hans: 'numeric'
      }
    },
    {
      value: 'money',
      label: {
        en_US: 'money',
        zh_Hans: 'money'
      }
    },
    // String types
    {
      value: 'char',
      label: {
        en_US: 'char',
        zh_Hans: 'char'
      }
    },
    {
      value: 'string',
      label: {
        en_US: 'varchar',
        zh_Hans: 'varchar'
      }
    },
    {
      value: 'text',
      label: {
        en_US: 'text',
        zh_Hans: 'text'
      }
    },
    {
      value: 'bytea',
      label: {
        en_US: 'bytea',
        zh_Hans: 'bytea'
      }
    },
    // Date and time types
    {
      value: 'date',
      label: {
        en_US: 'date',
        zh_Hans: 'date'
      }
    },
    {
      value: 'time',
      label: {
        en_US: 'time',
        zh_Hans: 'time'
      }
    },
    {
      value: 'timetz',
      label: {
        en_US: 'timetz',
        zh_Hans: 'timetz'
      }
    },
    {
      value: 'datetime',
      label: {
        en_US: 'timestamp',
        zh_Hans: 'timestamp'
      }
    },
    {
      value: 'timestamp',
      label: {
        en_US: 'timestamptz',
        zh_Hans: 'timestamptz'
      }
    },
    {
      value: 'interval',
      label: {
        en_US: 'interval',
        zh_Hans: 'interval'
      }
    },
    // Boolean type
    {
      value: 'boolean',
      label: {
        en_US: 'boolean',
        zh_Hans: 'boolean'
      }
    },
    // JSON types
    {
      value: 'json',
      label: {
        en_US: 'json',
        zh_Hans: 'json'
      }
    },
    {
      value: 'object',
      label: {
        en_US: 'jsonb',
        zh_Hans: 'jsonb'
      }
    },
    // UUID type
    {
      value: 'uuid',
      label: {
        en_US: 'uuid',
        zh_Hans: 'uuid'
      }
    },
    // Geometric types
    {
      value: 'point',
      label: {
        en_US: 'point',
        zh_Hans: 'point'
      }
    },
    {
      value: 'line',
      label: {
        en_US: 'line',
        zh_Hans: 'line'
      }
    },
    {
      value: 'circle',
      label: {
        en_US: 'circle',
        zh_Hans: 'circle'
      }
    },
    // XML type
    {
      value: 'xml',
      label: {
        en_US: 'xml',
        zh_Hans: 'xml'
      }
    }
  ]

  // Dynamic types based on selected database
  readonly types = computed(() => {
    const databaseId = this.database()
    if (!databaseId) {
      return []  // Return empty array if no database selected
    }
    
    // Get database type from map
    const databaseType = this.#databaseTypeMap().get(databaseId)
    
    // Normalize database type for comparison (case-insensitive)
    const normalizedType = databaseType?.toLowerCase() || ''
    
    // Return types based on database type
    // Check for PostgreSQL variants: 'postgres', 'postgresql', 'pg', etc.
    if (normalizedType.includes('postgres') || normalizedType === 'pg') {
      return this.postgresTypes
    } else {
      // Default to MySQL types
      return this.mysqlTypes
    }
  })

  /**
   * Initialize - subscribe to language change events
   */
  ngOnInit() {
    // Initialize translated texts
    this.updateTranslations()
    
    // Subscribe to language change events and update all translated texts
    this.#translate.onLangChange
      .pipe(takeUntil(this.#destroy$))
      .subscribe(() => {
        this.updateTranslations()
        this.#cdr.markForCheck() // Trigger change detection
      })
    
    // Subscribe to databases to build type map
    this.databases$
      .pipe(takeUntil(this.#destroy$))
      .subscribe((databases) => {
        const typeMap = new Map<string, string>()
        databases.forEach((db: any) => {
          if (db.value && db.type) {
            typeMap.set(db.value, db.type)
          }
        })
        this.#databaseTypeMap.set(typeMap)
        // Trigger change detection after map is updated
        this.#cdr.markForCheck()
      })
  }
  
  /**
   * Update all translated texts
   */
  private updateTranslations() {
    this.statusPlaceholder.set(
      this.#translate.instant('PAC.Workspace.AllStatus', {Default: 'All Status'})
    )
    this.databasePlaceholder.set(
      this.#translate.instant('PAC.Workspace.AllDatabases', {Default: 'All Databases'})
    )
    
    // Note: Do not modify types and statusOptions arrays to avoid breaking CdkListbox internal state
    // These arrays' labels are already multi-language objects {en_US: '...', zh_Hans: '...'}
    // i18n pipe will automatically select the correct text based on current language
    // Just trigger markForCheck() to re-render the view
  }

  /**
   * Destroy - cleanup subscriptions
   */
  ngOnDestroy() {
    this.#destroy$.next()
    this.#destroy$.complete()
  }

  addTable() {
    // Don't open if we're in the process of closing
    if (this.#isClosing()) {
      return
    }
    this.#isClosing.set(false)  // Reset closing flag
    this.table.set({
      name: ''
    })
  }

  /**
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
        defaultValue: undefined,  // Do not set default value to avoid sending empty string to backend
        length: undefined
      } as TXpertTableColumn
    ]
    this.table.update((v) => ({ ...v, columns }))
  }

  /**
   * Remove column
   */
  removeColumn(index: number) {
    const columns = [...(this.table().columns ?? [])]
    columns.splice(index, 1)
    this.table.update((v) => ({ ...v, columns }))
  }

  editTable(table: IXpertTable) {
    this.#isClosing.set(false)  // Reset closing flag
    this.table.set({ ...table })
  }

  closeTableDialog() {
    this.#isClosing.set(true)  // Set closing flag to prevent side effects
    this.table.set(null)
    // Reset closing flag after a longer delay to ensure all effects have completed
    setTimeout(() => {
      this.#isClosing.set(false)
    }, 300)
  }

  save() {
    this.#loading.set(true)
    if (!this.table().workspaceId) {
      this.table.update((v) => ({ ...v, workspaceId: this.workspace()?.id }))
    }
    
    // Validate ENUM and SET types before saving
    const columns = this.table().columns || []
    for (const col of columns) {
      if (col.type === 'enum') {
        if (!col.enumValues || col.enumValues.length === 0) {
          this.#loading.set(false)
          this.#toastr.danger(
            this.#translate.instant('PAC.Workspace.EnumValuesRequired', {
              Default: 'Enum Values is required for ENUM type',
              fieldName: col.name || this.#translate.instant('PAC.Workspace.FieldName', {Default: 'Field'})
            })
          )
          return
        }
      }
      if (col.type === 'set') {
        if (!col.setValues || col.setValues.length === 0) {
          this.#loading.set(false)
          this.#toastr.danger(
            this.#translate.instant('PAC.Workspace.SetValuesRequired', {
              Default: 'Set Values is required for SET type',
              fieldName: col.name || this.#translate.instant('PAC.Workspace.FieldName', {Default: 'Field'})
            })
          )
          return
        }
      }
    }
    
    // Clean field data: remove empty string default values
    const cleanedTable = {
      ...this.table(),
      columns: columns.map(col => ({
        ...col,
        // Set empty string or whitespace-only default values to undefined
        defaultValue: col.defaultValue && col.defaultValue.trim() ? col.defaultValue : undefined,
        // Keep enumValues and setValues as they are (already validated above)
        enumValues: col.enumValues && col.enumValues.length > 0 ? col.enumValues : undefined,
        setValues: col.setValues && col.setValues.length > 0 ? col.setValues : undefined
      }))
    }
    
    // Use upsert method, update if id exists, otherwise create
    const isUpdate = !!cleanedTable.id
    this.xpertTableAPI.upsert(cleanedTable).subscribe({
      next: () => {
        this.#loading.set(false)
        const message = isUpdate
          ? this.#translate.instant('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated Successfully' })
          : this.#translate.instant('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully' })
        this.#toastr.success(message)
        // Set closing flag to prevent side effects
        this.#isClosing.set(true)
        // Close dialog immediately
        this.table.set(null)
        // Reload the table list after closing dialog
        // Use setTimeout to ensure dialog is closed before reload triggers any side effects
        setTimeout(() => {
          this.#tablesResource.reload()
        }, 50)
        // Reset closing flag after a longer delay to ensure all effects have completed
        setTimeout(() => {
          this.#isClosing.set(false)
        }, 300)
      },
      error: (err) => {
        this.#loading.set(false)
        const errorMessage = getErrorMessage(err)
        this.#toastr.danger(errorMessage)
        // Don't close dialog on error - let user see the error and fix it
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
   * Delete table (including physical table)
   */
  deleteTable(table: IXpertTable) {
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

  /**
   * Clear default value when primary key is toggled
   */
  onPrimaryKeyChange(col: TXpertTableColumn) {
    if (col.isPrimaryKey && col.defaultValue) {
      col.defaultValue = undefined
    }
  }

  /**
   * Clear default value when auto increment is toggled
   */
  onAutoIncrementChange(col: TXpertTableColumn) {
    if (col.autoIncrement && col.defaultValue) {
      col.defaultValue = undefined
    }
  }

  /**
   * Check if column type supports auto increment
   */
  isIntegerType(type: string | undefined): boolean {
    if (!type) return false
    const lowerType = type.toLowerCase()
    // MySQL integer types
    if (['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'number', 'bigint'].includes(lowerType)) {
      return true
    }
    // PostgreSQL integer types
    if (['smallint', 'int', 'integer', 'number', 'bigint', 'serial', 'bigserial'].includes(lowerType)) {
      return true
    }
    return false
    if (!type) return false
    const integerTypes = ['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'number', 'bigint']
    return integerTypes.includes(type.toLowerCase())
  }

  /**
   * Handle ENUM values change
   */
  onEnumValuesChange(col: TXpertTableColumn, event: Event) {
    const input = event.target as HTMLInputElement
    const value = input.value.trim()
    if (value) {
      col.enumValues = value.split(',').map(v => v.trim()).filter(v => v.length > 0)
    } else {
      col.enumValues = undefined
    }
  }

  /**
   * Handle SET values change
   */
  onSetValuesChange(col: TXpertTableColumn, event: Event) {
    const input = event.target as HTMLInputElement
    const value = input.value.trim()
    if (value) {
      col.setValues = value.split(',').map(v => v.trim()).filter(v => v.length > 0)
    } else {
      col.setValues = undefined
    }
  }

  /**
   * Check if current database is PostgreSQL
   */
  isPostgreSQL(): boolean {
    const databaseId = this.database()
    if (!databaseId) {
      return false
    }
    const databaseType = this.#databaseTypeMap().get(databaseId)
    const normalizedType = databaseType?.toLowerCase() || ''
    return normalizedType.includes('postgres') || normalizedType === 'pg'
  }
}


