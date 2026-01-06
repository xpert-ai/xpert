import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, OnChanges, SimpleChanges, Output, inject, signal, DestroyRef, WritableSignal, Signal, effect } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TranslateModule } from '@ngx-translate/core'
import { NgmDisplayBehaviourComponent, NgmInputModule } from '@metad/ocap-angular/common'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { Join, Table, Property } from '@metad/ocap-core'
import { cloneDeep, isEqual } from 'lodash-es'
import { BehaviorSubject, map, shareReplay, Observable, of } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { ISelectOption, TSelectOption } from '@metad/ocap-angular/core'
import { map as rxjsMap, switchMap } from 'rxjs/operators'
import { computed } from '@angular/core'
import { SemanticModelService } from '../model/model.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule,
    TranslateModule,
    NgmInputModule,
    NgmSelectComponent,
    NgmDisplayBehaviourComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-tables-join',
  templateUrl: 'tables-join.component.html',
  styleUrls: ['tables-join.component.scss']
})
export class TablesJoinComponent implements OnInit, OnChanges {
  private cdr = inject(ChangeDetectorRef)
  // Inject SemanticModelService to get original table properties
  private modelService = inject(SemanticModelService, { optional: true })

  @Input() dataSource: string
  
  // Fact table name to filter out from join table options
  @Input() factTableName: string

  // Table options for dropdown selection
  // Accept both ISelectOption and TSelectOption, convert to TSelectOption for NgmSelectComponent
  private _tableOptionsInput$ = new BehaviorSubject<Observable<any[]>>(of([]))
  
  @Input() 
  set tableOptions(value: Observable<ISelectOption[] | TSelectOption<any>[]>) {
    if (value) {
      this._tableOptionsInput$.next(value)
    }
  }
  
  // Converted options for NgmSelectComponent - always returns TSelectOption[] with string labels
  // Includes all tables (including fact table) in the dropdown
  readonly convertedTableOptions$: Observable<TSelectOption<any>[]> = this._tableOptionsInput$.pipe(
    switchMap((input$) => input$.pipe(
      rxjsMap((options: any[]): TSelectOption<any>[] => {
        if (!options || !Array.isArray(options)) {
          return []
        }
        // Include all tables in options (no filtering)
        
        return options.map((opt: any): TSelectOption<any> => {
          // Extract value - must be primitive type
          let value: string | number | boolean
          if (opt.value !== undefined && (typeof opt.value === 'string' || typeof opt.value === 'number' || typeof opt.value === 'boolean')) {
            value = opt.value
          } else {
            value = opt.value ?? opt.key ?? ''
          }
          
          // Extract and convert label to string (TSelectOption allows TI18N | string, but we ensure it's string)
          let label: string
          const labelSource = opt.label ?? opt.caption ?? ''
          if (typeof labelSource === 'string') {
            label = labelSource
          } else if (labelSource && typeof labelSource === 'object') {
            // If it's an i18n object, convert to string (use default or key)
            label = (labelSource as any).default || (labelSource as any).key || String(labelSource)
          } else {
            label = String(labelSource)
          }
          
          return {
            key: opt.key,
            value: value,
            label: label
          } as TSelectOption<any>
        })
      })
    ))
  )

  @Input()
  get tables() {
    return this.tables$.value
  }
  set tables(value) {
    if (!isEqual(value, this.tables)) {
      this.tables$.next(cloneDeep(value))
    }
  }
  public tables$ = new BehaviorSubject<Table[]>([])

  @Output() tablesChange = new EventEmitter<Table[]>()

  private _tableTypes = {}
  private readonly destroyRef = inject(DestroyRef)
  
  // Cache for field options signals by table name
  private _fieldOptionsCache = new Map<string, WritableSignal<ISelectOption[]>>()
  // Track subscriptions to avoid duplicate subscriptions
  private _subscriptions = new Map<string, any>()

  ngOnInit() {
    this.tables$.subscribe((value) => this.tablesChange.emit(cloneDeep(value)))
  }
  
  ngOnChanges(changes: SimpleChanges) {
    // When tables change, clear left field options cache since relationships may have changed
    if (changes['tables']) {
      this._leftFieldOptionsForSelectCache.clear()
      this.cdr.markForCheck()
    }
  }
  
  /**
   * Get field options signal for a table
   * Returns a signal that updates when table fields are loaded
   * Uses SemanticModelService.selectOriginalEntityProperties to get ORIGINAL database table fields
   */
  getFieldOptionsSignal(table: Table): WritableSignal<ISelectOption[]> {
    // Guard: if table or table name is missing, return empty signal immediately
    if (!table || !table.name || !table.name.trim()) {
      return signal<ISelectOption[]>([])
    }
    
    // Guard: if modelService is not available, return empty signal
    if (!this.modelService) {
      return signal<ISelectOption[]>([])
    }
    
    // Use table.name as cache key
    const cacheKey = String(table.name).trim()
    
    // If we already have a cached signal AND subscription, return it
    if (this._fieldOptionsCache.has(cacheKey) && this._subscriptions.has(cacheKey)) {
      return this._fieldOptionsCache.get(cacheKey)!
    }
    
    // Create a new signal for this table
    const optionsSignal = signal<ISelectOption[]>([])
    this._fieldOptionsCache.set(cacheKey, optionsSignal)
    
    // Subscribe to Observable and update signal (only once per table)
    if (!this._subscriptions.has(cacheKey)) {
      try {
        // Create table object with the correct name
        const tableToLoad: Table = { name: cacheKey } as Table
        
        const subscription = this.selectTableType(tableToLoad).pipe(
          takeUntilDestroyed(this.destroyRef)
        ).subscribe({
          next: (options) => {
            // Update signal with new options
            if (options && Array.isArray(options)) {
              optionsSignal.set(options)
            } else {
              optionsSignal.set([])
            }
            // Trigger change detection after async data load (for OnPush strategy)
            this.cdr.markForCheck()
          },
          error: (err) => {
            // On error, keep empty array
            console.warn(`Failed to load fields for table ${cacheKey}:`, err)
            optionsSignal.set([])
            this.cdr.markForCheck()
          }
        })
        this._subscriptions.set(cacheKey, subscription)
      } catch (error) {
        // If subscription fails, clean up cache and return empty signal
        console.warn(`Failed to subscribe to fields for table ${cacheKey}:`, error)
        this._fieldOptionsCache.delete(cacheKey)
        return signal<ISelectOption[]>([])
      }
    }
    
    return this._fieldOptionsCache.get(cacheKey)!
  }
  
  /**
   * Get left table field options signal
   * For first table (fact table), leftKey can reference any previous table in the chain
   * For other tables, leftKey references the immediately previous table
   */
  getLeftFieldOptionsSignal(table: Table): WritableSignal<ISelectOption[]> {
    // Guard: if table or table name is missing, return empty signal immediately
    if (!table || !table.name || !table.name.trim()) {
      return signal<ISelectOption[]>([])
    }
    
    const index = this.tables.findIndex((item) => item?.name === table.name)
    if (index < 0) {
      return signal<ISelectOption[]>([])
    }
    
    // For first table (fact table, index 0), there's no left table
    // But we can allow it to reference itself or other tables if needed
    // For now, return empty for first table
    if (index === 0) {
      // First table (fact table) - no left table to reference
      return signal<ISelectOption[]>([])
    }
    
    // For other tables, get fields from the previous table
    const leftTable = this.tables[index - 1]
    if (!leftTable || !leftTable.name) {
      return signal<ISelectOption[]>([])
    }
    
    return this.getFieldOptionsSignal(leftTable)
  }
  
  // Cache for computed field options signals by table name
  private _fieldOptionsForSelectCache = new Map<string, Signal<TSelectOption<any>[]>>()
  // Cache for computed left field options signals by table name
  private _leftFieldOptionsForSelectCache = new Map<string, Signal<TSelectOption<any>[]>>()

  /**
   * Convert ISelectOption[] to TSelectOption[] for ngm-select component
   * Returns a computed signal that automatically updates when field options change
   * For RIGHT KEY field - loads fields from the CURRENT table
   */
  getFieldOptionsForSelect(table: Table): Signal<TSelectOption<any>[]> {
    // Guard: if table or table name is missing, return empty signal
    if (!table || !table.name || !table.name.trim()) {
      return signal<TSelectOption<any>[]>([])
    }
    
    const cacheKey = String(table.name).trim()
    
    // Return cached computed signal if exists
    if (this._fieldOptionsForSelectCache.has(cacheKey)) {
      return this._fieldOptionsForSelectCache.get(cacheKey)!
    }
    
    // Create table object with ONLY the name to ensure correct loading
    const tableForLoading: Table = { name: cacheKey } as Table
    const fieldOptionsSignal = this.getFieldOptionsSignal(tableForLoading)
    
    const computedSignal = computed(() => {
      const options = fieldOptionsSignal()
      
      if (!options || !Array.isArray(options) || options.length === 0) {
        return []
      }
      return options.map(opt => {
        // Clean field name: remove brackets, quotes, and other SQL delimiters
        const valueStr = String(opt.value ?? opt.key ?? '')
        const keyStr = String(opt.key ?? opt.value ?? '')
        const captionStr = String(opt.caption || opt.label || (opt.value ?? opt.key ?? ''))
        
        const cleanValue = this.cleanFieldName(valueStr)
        const cleanKey = this.cleanFieldName(keyStr)
        const cleanCaption = this.cleanFieldName(captionStr)
        
        return {
          value: cleanValue,
          label: cleanCaption,
          key: cleanKey
        }
      }).filter(opt => opt.value !== '' && opt.value != null)
    })
    
    this._fieldOptionsForSelectCache.set(cacheKey, computedSignal)
    return computedSignal
  }
  
  /**
   * Convert ISelectOption[] to TSelectOption[] for ngm-select component (left field)
   * Returns a computed signal that automatically updates when left field options change
   * For LEFT KEY field - loads fields from the PREVIOUS table
   */
  getLeftFieldOptionsForSelect(table: Table): Signal<TSelectOption<any>[]> {
    // Guard: if table or table name is missing, return empty signal
    if (!table || !table.name || !table.name.trim()) {
      return signal<TSelectOption<any>[]>([])
    }
    
    // Get the left table (previous table) to use as cache key
    const index = this.tables.findIndex((item) => item?.name === table.name)
    
    let cacheKey: string
    if (index <= 0) {
      // First table or not found - no left table, use empty key
      cacheKey = `__empty__${table.name.trim()}`
    } else {
      const leftTable = this.tables[index - 1]
      cacheKey = leftTable?.name?.trim() || `__empty__${table.name.trim()}`
    }
    
    // Return cached computed signal if exists
    if (this._leftFieldOptionsForSelectCache.has(cacheKey)) {
      return this._leftFieldOptionsForSelectCache.get(cacheKey)!
    }
    
    // Get left field options signal (from previous table)
    const leftFieldOptionsSignal = this.getLeftFieldOptionsSignal(table)
    const computedSignal = computed(() => {
      const options = leftFieldOptionsSignal()
      if (!options || !Array.isArray(options) || options.length === 0) {
        return []
      }
      return options.map(opt => {
        // Clean field name: remove brackets, quotes, and other SQL delimiters
        const valueStr = String(opt.value ?? opt.key ?? '')
        const keyStr = String(opt.key ?? opt.value ?? '')
        const captionStr = String(opt.caption || opt.label || (opt.value ?? opt.key ?? ''))
        
        const cleanValue = this.cleanFieldName(valueStr)
        const cleanKey = this.cleanFieldName(keyStr)
        const cleanCaption = this.cleanFieldName(captionStr)
        
        return {
          value: cleanValue,
          label: cleanCaption,
          key: cleanKey
        }
      }).filter(opt => opt.value !== '' && opt.value != null)
    })
    
    this._leftFieldOptionsForSelectCache.set(cacheKey, computedSignal)
    return computedSignal
  }
  
  /**
   * Clean field name by removing SQL delimiters like brackets, quotes, etc.
   * Keep table prefix to distinguish fields from different tables in multi-table join
   * Examples:
   *   - "cclts.[uuid]" -> "cclts.uuid"
   *   - "[field]" -> "field"
   *   - "table.[field]" -> "table.field"
   */
  private cleanFieldName(name: string): string {
    if (!name || typeof name !== 'string') {
      return ''
    }
    
    let cleaned = name.trim()
    
    // Remove all brackets: [field] -> field, table.[field] -> table.field
    cleaned = cleaned.replace(/\[|\]/g, '')
    // Remove all double quotes: "field" -> field
    cleaned = cleaned.replace(/"/g, '')
    // Remove all backticks: `field` -> field
    cleaned = cleaned.replace(/`/g, '')
    
    return cleaned.trim()
  }

  trackById(index: number, item: Table) {
    return item.name
  }

  removeTable(table: Table) {
    const index = this.tables?.findIndex((item) => item.name === table.name)
    if (index > -1) {
      this.tables.splice(index, 1)
      this.tables = [...this.tables]
    }
    this.tables$.next(this.tables)
  }

  // Change table name (for dropdown selection)
  changeTableName(table: Table, name: string) {
    const oldName = table.name
    table.name = name
    // Clear cached table type when name changes
    if (oldName && this._tableTypes[oldName]) {
      delete this._tableTypes[oldName]
    }
    // Clear field options cache for old name
    if (oldName && this._fieldOptionsCache.has(oldName)) {
      this._fieldOptionsCache.delete(oldName)
    }
    if (oldName && this._subscriptions.has(oldName)) {
      const subscription = this._subscriptions.get(oldName)
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe()
      }
      this._subscriptions.delete(oldName)
    }
    // Clear computed field options cache for old name
    if (oldName && this._fieldOptionsForSelectCache.has(oldName)) {
      this._fieldOptionsForSelectCache.delete(oldName)
    }
    // Clear all left field options cache since table relationships may have changed
    this._leftFieldOptionsForSelectCache.clear()
    // Trigger reload of field options for the new table name
    // This will be done automatically when getFieldOptionsSignal is called next time
    this.tables$.next(this.tables)
  }

  changeJoinType(table: Table, type: Join['type']) {
    table.join = table.join ?? { type, fields: [] }
    table.join.type = type
    this.tables$.next(this.tables)
  }

  changeLeftKey(table: Table, index: number, key: string) {
    // Validate and trim the key value
    // If key is empty or null, set to empty string (will be filtered out in SQL generation)
    if (table.join?.fields?.[index]) {
      table.join.fields[index].leftKey = key?.trim() || ''
      this.tables$.next(this.tables)
    }
  }
  
  changeRightKey(table: Table, index: number, key: string) {
    // Validate and trim the key value
    // If key is empty or null, set to empty string (will be filtered out in SQL generation)
    if (table.join?.fields?.[index]) {
      table.join.fields[index].rightKey = key?.trim() || ''
      this.tables$.next(this.tables)
    }
  }

  addJoinField(table: Table) {
    // Ensure join object exists
    if (!table.join) {
      table.join = {
        type: 'Inner',
        fields: []
      }
    }
    table.join.fields = table.join.fields ?? []
    table.join.fields.push({
      leftKey: null,
      rightKey: null
    })
    this.tables$.next(this.tables)
  }

  removeJoinField(table: Table, index: number) {
    table.join.fields.splice(index, 1)
    this.tables$.next(this.tables)
  }

  selectLeftTableFields(table: Table) {
    const index = this.tables.findIndex((item) => item.name === table.name)
    const leftTable = this.tables[index - 1]
    return this.selectTableType(leftTable)
  }

  selectTableType(table: Table) {
    // Guard: ensure table and table name exist
    if (!table || !table.name || !table.name.trim()) {
      return of([])
    }
    
    // Use table.name as the key - ensure it's a string and trimmed
    const tableName = String(table.name).trim()
    
    // Check if we already have a cached Observable for this table name
    if (!this._tableTypes[tableName]) {
      // Use SemanticModelService.selectOriginalEntityProperties to get ORIGINAL table fields
      // This is the correct way to get database table schema, not compiled cube schema
      if (this.modelService) {
        this._tableTypes[tableName] = this.modelService.selectOriginalEntityProperties(tableName).pipe(
          map((properties: Property[]) => {
            if (!properties || !Array.isArray(properties)) {
              return []
            }
            
            const options = properties.map((item) => ({ 
              value: item.name, 
              caption: item.caption || item.name,
              key: item.name
            }))
            
            return options
          }),
          catchError((error) => {
            console.warn(`[selectTableType] Error loading fields for table "${tableName}":`, error)
            return of([])
          }),
          shareReplay(1)
        )
      } else {
        // Fallback: if modelService is not available, return empty
        console.warn(`[selectTableType] ModelService not available, cannot load fields for table "${tableName}"`)
        return of([])
      }
    }
    return this._tableTypes[tableName]
  }
}
