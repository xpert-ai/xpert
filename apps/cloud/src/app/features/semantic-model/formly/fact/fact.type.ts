import { CommonModule } from '@angular/common'
import { Component, inject, Injector, OnInit, OnDestroy, runInInjectionContext, signal, computed, effect, DestroyRef, ChangeDetectorRef } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule } from '@angular/forms'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { attrModel, bindFormControlToSignal, linkedModel } from '@metad/core'
import { NgmDisplayBehaviourComponent, NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { TSelectOption } from '@metad/ocap-angular/core'
import { Cube, Table, uuid } from '@metad/ocap-core'
import { FieldType } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TablesJoinComponent } from '../../tables-join/tables-join.component'
import { firstValueFrom, of, Observable } from 'rxjs'
import { catchError, filter, startWith, map, take } from 'rxjs/operators'
import { SemanticModelService } from '../../model/model.service'
import { getSemanticModelKey } from '@metad/story/core'

/**
 * Fact type component for formly form
 * Supports single table, multi-table, and SQL view modes
 */
@Component({
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    TranslateModule, 
    NgmRadioSelectComponent, 
    NgmSelectComponent, 
    NgmDisplayBehaviourComponent,
    TablesJoinComponent
  ],
  selector: 'ngm-formly-fact',
  templateUrl: `fact.type.html`,
  host: {
    class: 'ngm-formly-fact'
  },
  styleUrls: ['fact.type.scss']
})
export class NgmFactComponent extends FieldType implements OnInit, OnDestroy {
  readonly injector = inject(Injector)
  private readonly translateService = inject(TranslateService)
  private readonly destroyRef = inject(DestroyRef) // Inject DestroyRef
  private readonly cdr = inject(ChangeDetectorRef) // Inject ChangeDetectorRef for manual change detection
  private readonly modelService = inject(SemanticModelService, { optional: true }) // Inject SemanticModelService as optional

  // Signal to track current language for reactive updates
  private readonly currentLang = signal<string>(this.translateService.currentLang || 'en')

  // Use computed signal to dynamically generate select options based on current language
  // This will automatically update when the language changes
  readonly selectOptions = computed<TSelectOption[]>(() => {
    // Read currentLang signal to track language changes
    const lang = this.currentLang()
    return [
      {
        value: 'table',
        label: this.translateService.instant('PAC.MODEL.SingleTable', { Default: 'Single Table' })
      },
      {
        value: 'multi-table',
        label: this.translateService.instant('PAC.MODEL.MultiTable', { Default: 'Multi Table' })
      },
      {
        value: 'view',
        label: this.translateService.instant('PAC.MODEL.SQLView', { Default: 'SQL View' })
      }
    ]
  })

  // Placeholder signal for form control value
  // Extend fact type to support 'multi-table' mode
  readonly value = signal<Cube['fact'] & { type?: 'table' | 'view' | 'multi-table' }>(null)

  readonly type = linkedModel<'table' | 'view' | 'multi-table' | null>({
    initialValue: null,
    compute: () => {
      const factValue = this.value() as any
      const factType = factValue?.type
      const factMode = factValue?._mode
      
      // Check _mode first (used when loading from saved data)
      if (factMode === 'multi-table') {
        return 'multi-table'
      }
      
      // If no type is set but cube has multiple tables, return 'multi-table'
      if (!factType) {
        const cube = this.field.parent?.model as Cube
        if (cube?.tables && cube.tables.length > 1) {
          return 'multi-table'
        }
        // Also check if cube.tables exists but is empty or has one table with _mode
        if (cube?.tables && cube.tables.length >= 0 && factMode === 'multi-table') {
          return 'multi-table'
        }
      }
      return factType as 'table' | 'view' | 'multi-table' | null
    },
    update: (type) => {
      this.value.update((state) => {
        if (type === 'multi-table') {
          // For multi-table mode, we don't set fact.type, but use cube.tables instead
          // Also set a hidden formControl value to help hideExpression detect multi-table mode
          const result = state ? { ...state, type: undefined } : null
          // Update formControl to trigger hideExpression re-evaluation
          // Use a custom property to store the mode
          if (this.formControl) {
            // Store mode in formControl value as a marker
            this.formControl.setValue({ ...this.formControl.value, _mode: 'multi-table' }, { emitEvent: true })
          }
          return result
        } else {
          // Clear the mode marker for non-multi-table modes
          if (this.formControl && this.formControl.value?._mode) {
            const newValue = { ...this.formControl.value }
            delete newValue._mode
            this.formControl.setValue(newValue, { emitEvent: true })
          }
          return state ? { ...state, type: type as 'table' | 'view' } : null
        }
      })
    }
  })

  readonly table = linkedModel({
    initialValue: null,
    compute: () => this.value()?.table,
    update: (table) => {
      this.value.update((state) => ({ ...(state ?? {}), table }))
    }
  })

  readonly tableName = linkedModel({
    initialValue: null,
    compute: () => {
      // In multi-table mode, get fact table from cube.tables[0]
      if (this.type() === 'multi-table') {
        const cube = this.field.parent?.model as Cube
        return cube?.tables?.[0]?.name || this.table()?.name
      }
      return this.table()?.name
    },
    update: (name) => {
      if (this.type() === 'multi-table') {
        // Update fact table in cube.tables[0]
        const cube = this.field.parent?.model as Cube
        if (cube) {
          if (!cube.tables) {
            cube.tables = []
          }
          if (cube.tables.length === 0) {
            cube.tables.push({ name } as Table)
          } else {
            cube.tables[0].name = name
          }
          this.formControl.updateValueAndValidity()
        }
      } else {
        this.table.update((state) => ({ ...(state ?? {}), name }))
      }
    }
  })

  readonly view = linkedModel({
    initialValue: null,
    compute: () => this.value()?.view,
    update: (view) => {
      this.value.update((state) => ({ ...(state ?? {}), view }))
    }
  })

  readonly viewAlias = attrModel(this.view, 'alias')
  readonly viewSql = attrModel(this.view, 'sql')

  readonly sqlContent = attrModel(this.viewSql, 'content')

  // Multi-table mode: all tables array (fact table is the first one)
  // This includes both fact table and join tables in a single list
  readonly allTables = signal<Table[]>([])
  
  // Legacy: joinTables for backward compatibility (now computed from allTables)
  readonly joinTables = computed(() => {
    const tables = this.allTables()
    // Return all tables except the first one (fact table)
    return tables.length > 1 ? tables.slice(1) : []
  })
  
  // Effect to sync allTables with cube.tables
  // Fact table is always the first element in allTables
  private syncJoinTables() {
    const cube = this.field.parent?.model as Cube
    const factTableName = this.tableName() || cube.tables?.[0]?.name || (cube.fact?.table as any)?.name || cube.fact?.table
    const factValue = this.value() as any
    const isMultiTable = this.type() === 'multi-table' || factValue?._mode === 'multi-table'
    
    if (cube?.tables && cube.tables.length > 0) {
      // Get all tables (fact table is first, then join tables)
      // Filter out any duplicate fact tables
      const allTables = cube.tables
        .filter((table, index) => {
          // Keep first table (fact table) always
          if (index === 0) return true
          // Filter out duplicates of fact table
          return table.name && table.name.trim() && table.name !== factTableName
        })
        .map(t => ({ ...t }))
      
      // Always set to trigger change detection, even if values are the same
      // Create new array reference to ensure signal change detection
      this.allTables.set([...allTables])
    } else if (factTableName) {
      // If cube.tables is empty but we have a fact table name, create array with just fact table
      this.allTables.set([{ name: factTableName } as Table])
    } else if (isMultiTable) {
      // In multi-table mode, create a placeholder table to ensure component renders
      // This is critical when loading from saved data where tables might be null
      const placeholderTable: Table = { name: '', __id__: uuid() } as Table
      this.allTables.set([placeholderTable])
      // Also update cube.tables to keep them in sync
      if (cube) {
        cube.tables = [placeholderTable]
      }
    } else {
      // Always set to trigger change detection
      this.allTables.set([])
    }
    // Force change detection after signal update
    this.cdr.markForCheck()
  }
  
  // Update cube.tables when allTables changes
  // allTables already includes fact table as first element
  private updateCubeTables(tables: Table[]) {
    const cube = this.field.parent?.model as Cube
    if (cube) {
      // allTables already has fact table as first element
      // Just update cube.tables directly
      if (tables && tables.length > 0) {
        // Ensure first table (fact table) has a name
        if (!tables[0].name) {
          // If first table has no name, try to get from existing cube.tables or form control
          const existingFactTableName = this.tableName() || cube.tables?.[0]?.name || (cube.fact?.table as any)?.name || cube.fact?.table
          if (existingFactTableName) {
            tables[0].name = existingFactTableName
          }
        }
        
        // Update cube.tables with all tables (fact table is first)
        cube.tables = tables.map(t => ({ ...t }))
        
        // Update tableName signal to match first table
        if (tables[0]?.name) {
          this.tableName.set(tables[0].name)
        }
      } else {
        // If no tables, clear cube.tables
        cube.tables = []
      }
      
      // Trigger form update
      this.formControl.updateValueAndValidity()
    }
  }

  // Computed: check if current mode is multi-table
  readonly isMultiTableMode = computed(() => this.type() === 'multi-table')
  
  // Get model key from SemanticModelService if available
  private readonly modelKey = this.modelService 
    ? toSignal(this.modelService.model$.pipe(map(getSemanticModelKey)))
    : null

  // Computed: get data source name for tables-join component
  readonly dataSource = computed(() => {
    // Try to get data source from multiple sources in order of priority:
    // 1. formState.dataSource (if set in form configuration)
    // 2. modelKey from SemanticModelService (if available)
    // 3. parent model catalog or key
    // 4. formState.model.key or catalog
    const formState = this.field.options?.formState as any
    const dataSource = formState?.dataSource || 
                       (this.modelKey ? this.modelKey() : null) ||
                       this.field.parent?.model?.catalog ||
                       this.field.parent?.model?.key ||
                       formState?.model?.key ||
                       formState?.model?.catalog
    
    // Log for debugging if dataSource is still missing
    if (!dataSource) {
      console.warn('DataSource not found in formState, modelService, or parent model:', {
        formState,
        modelKey: this.modelKey ? this.modelKey() : 'SemanticModelService not available',
        parentModel: this.field.parent?.model,
        fieldOptions: this.field.options
      })
    }
    
    return dataSource
  })

  // Convert props.options$ Observable to signal for fact table dropdown
  // This ensures proper handling of async data and prevents CdkListbox errors
  readonly factTableOptions = signal<TSelectOption[]>([])

  private cleanup?: () => void

  ngOnInit(): void {
    runInInjectionContext(this.injector, () => {
      this.cleanup = bindFormControlToSignal(this.formControl as FormControl, this.value)
      
      // Subscribe to language changes to update selectOptions reactively
      this.translateService.onLangChange
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => {
          this.currentLang.set(event.lang)
        })
      
      // Subscribe to props.options$ to update factTableOptions signal
      if (this.props?.options$) {
        (this.props.options$ as Observable<TSelectOption[]>)
          .pipe(
            startWith([] as TSelectOption[]),
            catchError(() => of([] as TSelectOption[])),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe((options) => {
            this.factTableOptions.set(options)
          })
      }
      
      // Initialize type based on existing data
      const cube = this.field.parent?.model as Cube
      const factValue = this.value() as any
      const factMode = factValue?._mode
      
      if (cube) {
        // Check _mode first (used when loading from saved data)
        if (factMode === 'multi-table') {
          this.type.set('multi-table')
          this.syncJoinTables()
        }
        // If cube has multiple tables, set mode to multi-table
        else if (cube.tables && cube.tables.length > 1 && !factValue?.type) {
          this.type.set('multi-table')
          this.syncJoinTables()
        }
        // If cube has fact.view, set mode to view
        else if (cube.fact?.view && !factValue?.type) {
          this.type.set('view')
        }
        // If cube has single table in cube.tables, also might be multi-table mode
        else if (cube.tables && cube.tables.length === 1 && !factValue?.type) {
          // Check if the single table has join configuration or if we should default to multi-table
          // For now, keep as single table mode but sync the data
          this.type.set('table')
          this.syncJoinTables()
        }
        // Otherwise default to table
        else if (!factValue?.type) {
          this.type.set('table')
        }
      }
      
      // Also watch factTableOptions changes to initialize multi-table mode properly
      // This handles the case when user switches to multi-table mode before options are loaded
      effect(() => {
        const options = this.factTableOptions()
        const currentType = this.type()
        const currentAllTables = this.allTables()
        const cube = this.field.parent?.model as Cube
        
        // If we're in multi-table mode and options are available
        if (currentType === 'multi-table' && options.length > 0) {
          // Check if we need to initialize: allTables is empty OR allTables[0] has no valid name
          const needsInitialization = currentAllTables.length === 0 || 
            !currentAllTables[0]?.name || 
            !currentAllTables[0].name.trim()
          
          // Initialize with first available table if no fact table is set
          if (needsInitialization) {
            // Try to get existing table name from various sources
            let tableName = this.tableName() || cube?.tables?.[0]?.name
            
            // If no existing table name, use first option
            if (!tableName && options[0]?.value) {
              tableName = String(options[0].value)
            }
            
            if (tableName && cube) {
              this.tableName.set(tableName)
              cube.tables = [{ name: tableName, __id__: uuid() } as Table]
              this.allTables.set([{ name: tableName, __id__: uuid() } as Table])
              this.cdr.markForCheck()
            }
          }
        }
      }, { allowSignalWrites: true })
      
      // Watch type changes and sync data accordingly
      effect(() => {
        const currentType = this.type()
        const cube = this.field.parent?.model as Cube
        
        if (currentType === 'multi-table') {
          // When switching to multi-table mode, ensure cube.tables is set up correctly
          runInInjectionContext(this.injector, () => {
            // Ensure cube.tables exists
            if (!cube.tables) {
              cube.tables = []
            }
            
            // Helper function to initialize tables with a given fact table name
            const initializeTablesWithFactName = (factTableName: string) => {
              // Only initialize if we have a valid table name
              if (!factTableName || !factTableName.trim()) {
                return false
              }
              
              // Add fact table to cube.tables if not present
              if (!cube.tables.length) {
                cube.tables = [{ name: factTableName, __id__: uuid() } as Table]
              } else if (cube.tables[0].name !== factTableName) {
                cube.tables = [{ name: factTableName, __id__: uuid() } as Table, ...cube.tables.slice(1)]
              }
              
              // Update tableName signal
              this.tableName.set(factTableName)
              
              // Sync allTables from cube.tables
              const allTables = cube.tables
                .filter((table, index) => {
                  if (index === 0) return true
                  return table.name && table.name.trim() && table.name !== factTableName
                })
                .map(t => ({ ...t }))
              
              if (allTables.length === 0) {
                allTables.push({ name: factTableName, __id__: uuid() } as Table)
              }
              
              this.allTables.set([...allTables])
              this.cdr.markForCheck()
              return true
            }
            
            // Try to initialize from various sources
            let initialized = false
            const currentFactTableName = this.tableName()
            const cubeFactTableName = cube.tables[0]?.name
            
            if (currentFactTableName) {
              initialized = initializeTablesWithFactName(currentFactTableName)
            } else if (cubeFactTableName) {
              initialized = initializeTablesWithFactName(cubeFactTableName)
            }
            
            // If not initialized yet, try factTableOptions synchronously
            if (!initialized) {
              const options = this.factTableOptions()
              if (options.length > 0 && options[0]?.value) {
                const tableName = String(options[0].value)
                initialized = initializeTablesWithFactName(tableName)
              }
            }
            
            // If still not initialized, create a placeholder table to ensure component renders
            // This is critical for the UI to show up immediately when switching to multi-table mode
            if (!initialized) {
              // Create a placeholder table with empty name - this allows ngm-tables-join to render
              const placeholderTable: Table = { name: '', __id__: uuid() } as Table
              if (!cube.tables.length) {
                cube.tables = [placeholderTable]
              }
              this.allTables.set([...cube.tables])
              this.cdr.markForCheck()
              
              // Then wait for props.options$ to provide table options and update the placeholder
              if (this.props?.options$) {
                this.props.options$.pipe(
                  filter((options: any) => options && Array.isArray(options) && options.length > 0),
                  take(1)
                ).subscribe((options: unknown) => {
                  const opts = options as any[]
                  if (opts[0]?.value) {
                    const tableName = opts[0].value as string
                    initializeTablesWithFactName(tableName)
                  }
                })
              }
            }
            
            // Force form update
            if (this.formControl) {
              this.formControl.setValue({ ...this.formControl.value, _mode: 'multi-table' }, { emitEvent: true })
            }
            this.formControl.updateValueAndValidity()
            this.cdr.markForCheck()
          })
        } else if (currentType === 'table') {
          // When switching to single table mode, clear join tables
          if (cube?.tables && cube.tables.length > 1) {
            // Keep only the first table (fact table)
            const factTable = cube.tables[0]
            cube.tables = [factTable]
          }
          // Always clear allTables when switching to single table mode (keep only fact table if exists)
          const factTable = cube?.tables?.[0]
          this.allTables.set(factTable ? [factTable] : [])
          // Clear _mode marker
          if (this.formControl && this.formControl.value?._mode) {
            const newValue = { ...this.formControl.value }
            delete newValue._mode
            this.formControl.setValue(newValue, { emitEvent: true })
          }
          this.cdr.markForCheck()
        } else if (currentType === 'view') {
          // When switching to view mode, clear tables
          if (cube?.tables) {
            cube.tables = []
          }
          this.allTables.set([])
          // Clear _mode marker
          if (this.formControl && this.formControl.value?._mode) {
            const newValue = { ...this.formControl.value }
            delete newValue._mode
            this.formControl.setValue(newValue, { emitEvent: true })
          }
          this.cdr.markForCheck()
        }
      }, { allowSignalWrites: true })
      
      // Watch allTables changes and update cube.tables
      effect(() => {
        const tables = this.allTables()
        if (this.type() === 'multi-table') {
          this.updateCubeTables(tables)
        }
      }, { allowSignalWrites: true })
    })
  }

  ngOnDestroy(): void {
    // Clean up subscription to prevent memory leaks
    this.cleanup?.()
  }

  /**
   * Update all tables from tables-join component
   * Tables array includes fact table as first element
   */
  updateAllTables(tables: Table[]) {
    this.allTables.set(tables)
    this.updateCubeTables(tables)
  }
  
  /**
   * Legacy method for backward compatibility
   * @deprecated Use updateAllTables instead
   */
  updateJoinTables(tables: Table[]) {
    // Convert join tables to allTables format (add fact table as first)
    const factTableName = this.tableName() || this.allTables()[0]?.name
    if (factTableName) {
      const factTable: Table = { __id__: uuid(), name: factTableName } as Table
      this.updateAllTables([factTable, ...tables])
    } else {
      this.updateAllTables(tables)
    }
  }

  /**
   * Add a new fact table in multi-table mode
   * This method focuses on the fact table select dropdown to help users select a table
   */
  addFactTable() {
    // Focus on the fact table select dropdown
    // The actual table selection is handled by the ngm-select component
    // Users can click this button to quickly access the fact table selector
    const factTableSelect = document.querySelector('.ngm-formly-fact ngm-select')
    if (factTableSelect) {
      const input = factTableSelect.querySelector('input')
      if (input) {
        input.focus()
        input.click()
      }
    }
  }

  /**
   * Add a new table in multi-table mode
   * If no tables exist, add fact table first, then add join table
   */
  addJoinTable() {
    const tables = this.allTables() || []
    
    // If no tables exist, add fact table first
    if (tables.length === 0) {
      const factTableName = this.tableName()
      if (factTableName) {
        // Add fact table as first table
        const factTable: Table = { __id__: uuid(), name: factTableName } as Table
        this.updateAllTables([factTable])
        return
      } else {
        // If no fact table name, try to get from props.options$
        if (this.props?.options$) {
          firstValueFrom(this.props.options$).then((options: unknown) => {
            const opts = options as any[]
            if (opts && Array.isArray(opts) && opts.length > 0 && opts[0]?.value) {
              const tableName = opts[0].value as string
              this.tableName.set(tableName)
              const factTable: Table = { __id__: uuid(), name: tableName } as Table
              this.updateAllTables([factTable])
            }
          }).catch(() => {
            // Ignore errors
          })
        }
        return
      }
    }
    
    // Add a new join table (not fact table)
    const newTable: Table = {
      __id__: uuid(),
      name: '',
      join: {
        type: 'Inner',
        fields: [{ leftKey: '', rightKey: '' }]
      }
    }
    this.updateAllTables([...tables, newTable])
  }

  /**
   * Remove a join table
   */
  removeJoinTable(index: number) {
    const tables = this.joinTables() || []
    tables.splice(index, 1)
    this.updateJoinTables([...tables])
  }
}
