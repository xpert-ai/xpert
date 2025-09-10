import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Component, Inject, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms'
import { nonNullable } from '@metad/core'
import { AggregationRole, Cube, DBTable, isNil, omitBy, Property, PropertyDimension } from '@metad/ocap-core'
import { of } from 'rxjs'
import { debounceTime, distinctUntilChanged, map, startWith, switchMap, tap } from 'rxjs/operators'
import { SemanticModelService } from '../model.service'
import { MODEL_TYPE, SemanticModelEntityType } from '../types'
import { uuid } from '@cloud/app/@core'
import { debouncedSignal, ISelectOption } from '@metad/ocap-angular/core'
import { CommonModule } from '@angular/common'
import { MatIconModule } from '@angular/material/icon'
import { MatButtonModule } from '@angular/material/button'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { TranslateModule } from '@ngx-translate/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatSelectModule } from '@angular/material/select'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'

export type CreateEntityColumnType = {
  name: string
  caption: string
  visible: boolean
  role: AggregationRole
  dataType?: string
  isMeasure?: boolean
  aggregator?: string
  isDimension?: boolean
  dimension?: Property
}

export type CreateEntityDialogDataType = {
  model: {
    name?: string
    expression?: string
    table?: string
    caption?: string
  }
  /**
   * provide selectable tables
   */
  entitySets?: DBTable[]
  modelType?: MODEL_TYPE
  type?: SemanticModelEntityType
  /**
   * Provide selectable types
   */
  types?: SemanticModelEntityType[]
  /**
   * Field list of fact table, to pick one for inline dimension
   */
  factFields?: ISelectOption[]
}

export type CreateEntityDialogRetType = {
  type: SemanticModelEntityType
  name: string
  caption: string
  table: string
  foreignKey: string

  expression: string
  primaryKey: string
  columns: CreateEntityColumnType[]
  cubes: Cube[]
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatSelectModule,
    TranslateModule,
    NgmCommonModule
  ],
  selector: 'pac-model-create-entity',
  templateUrl: 'create-entity.component.html',
  styleUrls: ['create-entity.component.scss']
})
export class ModelCreateEntityComponent {
  SemanticModelEntityType = SemanticModelEntityType
  MODEL_TYPE = MODEL_TYPE

  private readonly modelService = inject(SemanticModelService)

  modelType: MODEL_TYPE
  hiddenTable = false

  readonly primaryKey = signal<string>(null)
  readonly columns = signal<CreateEntityColumnType[]>([])
  readonly searchTerm = model<string>('')
  readonly #search = debouncedSignal(this.searchTerm, 300)

  readonly filteredColumns = computed(() => {
    const search = this.#search()?.toLowerCase()
    if (!search) {
      return this.columns()
    }
    return this.columns()?.filter((column) => column.name.toLowerCase().includes(search) || column.caption?.toLowerCase().includes(search))
  })
  
  cubes: Cube[] = []
  table = new FormControl(null)
  type = new FormControl<SemanticModelEntityType>(null, [Validators.required])
  name = new FormControl(null, [Validators.required, this.forbiddenNameValidator()])

  formGroup = new FormGroup({
    type: this.type,
    name: this.name,
    caption: new FormControl('', [Validators.required]),
    table: this.table,
    foreignKey: new FormControl()
  })

  expression: string
  readonly loading = signal(false)

  readonly types = signal(this.data.types ?? (this.data.modelType===MODEL_TYPE.OLAP ? [
    SemanticModelEntityType.CUBE,
    SemanticModelEntityType.DIMENSION,
    SemanticModelEntityType.VirtualCube
  ] : [
    SemanticModelEntityType.CUBE,
    SemanticModelEntityType.DIMENSION,
  ]))

  readonly factFields = signal(this.data.factFields)

  private readonly tableName$ = this.table.valueChanges.pipe(
    startWith(this.data.model?.table),
    debounceTime(300),
    distinctUntilChanged()
  )

  public filteredTables = this.tableName$.pipe(
    map((value) => {
      const name = typeof value === 'string' ? value : value?.name
      return name
        ? this.data.entitySets?.filter(
            (item) => item.caption?.includes(name) || item.label?.includes(name) || item.name.includes(name)
          )
        : this.data.entitySets.slice()
    })
  )

  public readonly cubes$ = this.modelService.cubeStates$.pipe(map((states) => states.map((state) => state.cube)))

  private readonly entityColumns = toSignal(
    this.tableName$.pipe(
      tap(() => (this.loading.set(true))),
      switchMap((tableName) => (tableName ? this.modelService.selectOriginalEntityProperties(tableName) : of([]))),
      tap(() => (this.loading.set(false)))
    )
  )

  private readonly entityType = toSignal(this.type.valueChanges)
  public readonly sharedDimensions = toSignal(this.modelService.sharedDimensions$)

  constructor(
    @Inject(DIALOG_DATA) public data: CreateEntityDialogDataType,
    public dialogRef: DialogRef<CreateEntityDialogRetType>
  ) {
    this.expression = this.data.model?.expression
    this.modelType = this.data.modelType
    const initValue = {
      name: this.data.model?.name,
      table: this.data.model?.table,
      caption: this.data.model?.caption,
      type: this.data.type ?? null
    }
    if (this.modelType === MODEL_TYPE.XMLA) {
      initValue.type = SemanticModelEntityType.CUBE
      this.type.disable()
      this.hiddenTable = true
      if (initValue.name) {
        this.formGroup.get('name').disable()
      }
    }
    this.formGroup.patchValue(initValue)

    effect(
      () => {
        let columns = this.entityColumns()
        if (!columns) {
          return
        }
        
        // this.columns = [...columns.map((item) => ({ ...item }))]
        const type = this.entityType()

        // 自动判断实体类型
        if (!nonNullable(type) && columns.length > 0) {
          this.type.setValue(
            columns.find((item) => item.role === AggregationRole.measure)
              ? SemanticModelEntityType.CUBE
              : SemanticModelEntityType.DIMENSION
          )
        } else {
          // 自动设置关联维度和度量
          if (type === SemanticModelEntityType.CUBE) {
            const sharedDimensions = this.sharedDimensions()
            columns.forEach((item) => {
              const dimension = sharedDimensions.find(
                (dimension) => dimension.hierarchies?.[0]?.primaryKey === item.name
              )
              if (dimension) {
                item.dimension = dimension
              } else if (item.role === AggregationRole.measure) {
                item.isMeasure = true
              }
            })
          } else if (type) {
            columns = columns.map((item) => ({
              ...item,
              dimension: null,
              isMeasure: null
            }))
          }
        }

        this.columns.set([...columns.map((item) => ({ ...item }))])
      },
      { allowSignalWrites: true }
    )
  }

  forbiddenNameValidator(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      // Entity name can't be one of table name
      const forbidden = !!this.data.entitySets?.find((item) => item.name === control.value)
      return forbidden ? { forbiddenName: { value: control.value } } : null
    }
  }

  getErrorMessage() {
    if (this.name.hasError('required')) {
      return 'The name is required'
    }

    return this.name.hasError('forbiddenName') ? 'Must be unique from the table name' : ''
  }

  compareWithCube(a: Cube, b: Cube) {
    return a.name === b.name
  }

  drop(event: CdkDragDrop<Property[]>) {
    this.columns.update((columns) => {
      moveItemInArray(columns, event.previousIndex, event.currentIndex)
      return [...columns]
    })
  }

  toggleDimension(value: boolean, column: CreateEntityColumnType) {
    if (value) {
      column.isMeasure = false
    }
  }

  toggleMeasure(value: boolean, column: CreateEntityColumnType) {
    if (value) {
      column.isDimension = false
    }
  }

  clearSelection() {
    this.columns.update((columns) =>
      columns.map((column) => ({
        ...column,
        isDimension: false,
        isMeasure: false
      }))
    )
  }

  onSubmit(event) {
    if (this.formGroup.valid) {
      this.apply()
    }
  }

  cancel() {
    this.dialogRef.close()
  }

  apply() {
    this.dialogRef.close({
      ...this.formGroup.getRawValue(),
      expression: this.expression,
      primaryKey: this.primaryKey(),
      columns: this.columns().filter((item) => item.visible || item.isMeasure || item.isDimension || item.dimension),
      cubes: this.cubes
    })
  }
}

export function toDimension({ name, caption, table, expression, primaryKey, columns, foreignKey }: CreateEntityDialogRetType) {
  const id = uuid()
  const dimension = {
    __id__: id,
    name: name,
    caption,
    foreignKey,
    expression,
    hierarchies: [
      {
        __id__: uuid(),
        caption,
        hasAll: true,
        primaryKey,
        tables: [
          {
            name: table
          }
        ],
        levels:
          columns?.map((column) => ({
            __id__: uuid(),
            name: column.name,
            caption: column.caption,
            column: column.name
          })) ?? []
      }
    ]
  } as PropertyDimension
  return omitBy(dimension, isNil)
}