import { Dialog } from '@angular/cdk/dialog'
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  ViewChildren,
  ViewContainerRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  model
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { CommandDialogComponent } from '@metad/copilot-angular'
import { CdkConfirmDeleteComponent, injectConfirmOptions, NgmCommonModule, SplitterType } from '@metad/ocap-angular/common'
import { NgmCalculationEditorComponent, NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import {
  AggregationRole,
  CalculatedMember,
  CalculatedProperty,
  CalculationProperty,
  CalculationType,
  DimensionUsage,
  ParameterProperty,
  PropertyMeasure,
  Syntax,
  VariableProperty,
  getEntityDimensions,
  getEntityMeasures,
  getEntityVariables,
  isEntityType,
  isVisible
} from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { DeepPartial, injectToastr, uuid } from '@cloud/app/@core'
import { NGXLogger } from 'ngx-logger'
import { combineLatest, combineLatestWith, filter, map, switchMap, withLatestFrom } from 'rxjs'
import { SemanticModelService } from '../../model.service'
import {
  CdkDragDropContainers,
  MODEL_TYPE,
  ModelDesignerType,
  ModelDimensionState,
  SemanticModelEntity,
  SemanticModelEntityType
} from '../../types'
import { InlineDimensionComponent, UsageDimensionComponent } from '../dimension'
import { ModelEntityService } from '../entity.service'
import { CubeEventType } from '../types'
import { CubeVariableFormComponent } from '@cloud/app/@shared/model'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { SQLTableSchema } from '@metad/ocap-sql'
import { CreateEntityDialogRetType, ModelCreateEntityComponent, toDimension } from '../../create-entity/create-entity.component'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { CdkMenuModule } from '@angular/cdk/menu'
import { NgmParameterCreateComponent } from '@metad/ocap-angular/parameter'
import { ModelEntityComponent } from '../entity.component'

/**
 * Display and edit the field list of the multidimensional analysis model
 *
 * @param @readonly entityType Field in the target system, read-only
 * @param cube Configuration of the multidimensional analysis model of this system or enhancement information of the multidimensional model of the target system
 * @returns cube Output type of two-way binding
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-cube-structure',
  templateUrl: 'cube-structure.component.html',
  styleUrls: ['cube-structure.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatButtonModule,
    MatTooltipModule,
    MatIconModule,
    MatListModule,
    NgmCommonModule,
    CdkMenuModule,

    InlineDimensionComponent,
    UsageDimensionComponent,
    NgmEntityPropertyComponent,
  ]
})
export class ModelCubeStructureComponent {
  eCdkDragDropContainers = CdkDragDropContainers
  ModelDesignerType = ModelDesignerType
  AGGREGATION_ROLE = AggregationRole
  CALCULATION_TYPE = CalculationType
  SplitterType = SplitterType
  MODEL_TYPE = MODEL_TYPE
  isVisible = isVisible

  readonly cubeComponent = inject(ModelEntityComponent)
  private readonly modelService = inject(SemanticModelService)
  public readonly entityService = inject(ModelEntityService)
  private readonly _cdr = inject(ChangeDetectorRef)
  /**
   * @deprecated use `#dialog`
   */
  readonly _dialog = inject(MatDialog)
  readonly #dialog = inject(Dialog)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly _logger = inject(NGXLogger)
  readonly #vcr = inject(ViewContainerRef)
  readonly confirmOptions = injectConfirmOptions()
  readonly i18n = injectI18nService()

  readonly modelType = input<MODEL_TYPE>()
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  @Output() editChange = new EventEmitter<any>()

  @ViewChildren(CdkDropList) cdkDropList: CdkDropList[]

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly cubeName = this.entityService.cubeName
  readonly dataSettings = this.entityService.dataSettings
  readonly search = model<string>('')
  readonly dimensions = computed(() => {
    const dimensions = this.entityService.dimensions()
    const search = this.search()
    if (search) {
      const text = search.trim().toLowerCase()
      return dimensions?.filter(
        ({ name, caption }) => name.toLowerCase().includes(text) || caption?.toLowerCase().includes(text)
      )
    }
    return dimensions
  })

  readonly calculatedMembers = toSignal(
    combineLatest([this.entityService.calculatedMembers$, toObservable(this.search)]).pipe(
      map(([members, search]) => {
        if (search) {
          const text = search.trim().toLowerCase()
          members = members?.filter(
            ({ name, caption }) => name.toLowerCase().includes(text) || caption?.toLowerCase().includes(text)
          )
        }
        return members?.map(
          (member) =>
            ({
              ...member,
              role: AggregationRole.measure,
              calculationType: CalculationType.Calculated
            }) as Partial<CalculatedMember>
        )
      })
    )
  )

  readonly measures = computed(() => {
    const measures = this.entityService.measures()
    const search = this.search()
    if (search) {
      const text = search.trim().toLowerCase()
      return measures?.filter(
        ({ name, caption }) => name.toLowerCase().includes(text) || caption?.toLowerCase().includes(text)
      )
    }
    return measures
  })

  readonly variables = computed(() => {
    const variables = this.entityService.variables()
    const search = this.search()
    if (search) {
      const text = search.trim().toLowerCase()
      return variables?.filter(
        ({ name, caption }) => name.toLowerCase().includes(text) || caption?.toLowerCase().includes(text)
      )
    }
    return variables
  })

  readonly selectedProperty = this.entityService.selectedProperty
  readonly entityType = toSignal(this.entityService.originalEntityType$)

  // Fact
  readonly factFields = toSignal(this.entityService.factFields$)

  readonly calculations = this.entityService.calculations
  readonly parameters = this.entityService.parameters

  /**
  |--------------------------------------------------------------------------
  | Observables
  |--------------------------------------------------------------------------
  */
  readonly dimensionUsages$ = this.entityService.dimensionUsages$.pipe(
    withLatestFrom(this.modelService.sharedDimensions$),
    combineLatestWith(toObservable(this.search)),
    map(([[dimensionUsages, sharedDimensions], search]) => {
      if (search) {
        search = search.trim().toLowerCase()
        dimensionUsages = dimensionUsages?.filter(
          (usage) => usage.name.toLowerCase().includes(search) || usage.caption?.toLowerCase().includes(search)
        )
      }
      return dimensionUsages?.map((usage) => {
        const dimension = sharedDimensions.find((item) => usage.source === item.name)
        return {
          usage,
          dimension: {
            ...(dimension ?? {}),
            name: usage.name,
            caption: usage.caption || dimension?.caption,
            __id__: usage.__id__
          }
        }
      })
    })
  )

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private entityTypeSub = toObservable(this.modelType)
    .pipe(
      filter((modelType) => modelType === MODEL_TYPE.XMLA),
      switchMap(() => this.entityService.originalEntityType$),
      filter(isEntityType)
    )
    .subscribe((entityType) => {
      // Sync original dimensions and measures when that is empty
      if (!this.entityService.dimensions()?.length) {
        this.entityService.updateCube({
          dimensions: getEntityDimensions(entityType).map((dimension) => ({
            __id__: uuid(),
            name: dimension.name,
            caption: dimension.caption,
            visible: dimension.visible ?? true,
            hierarchies: dimension.hierarchies?.map((hierarchy) => ({
              __id__: uuid(),
              name: hierarchy.name,
              caption: hierarchy.caption,
              visible: hierarchy.visible ?? true,
              levels: hierarchy.levels?.map((level) => ({
                __id__: uuid(),
                name: level.name,
                caption: level.caption,
                visible: level.visible ?? true
              }))
            }))
          }))
        })
      }

      if (!this.entityService.measures()?.length) {
        this.entityService.updateCube({
          measures: getEntityMeasures(entityType).map((measure) => ({
            __id__: uuid(),
            name: measure.name,
            caption: measure.caption,
            visible: measure.visible ?? true
          }))
        })
      }

      if (!this.entityService.variables()?.length) {
        this.entityService.updateCube({
          variables: getEntityVariables(entityType).map((variable) => ({
            ...variable,
            __id__: uuid(),
            name: variable.name,
            caption: variable.caption,
            visible: variable.visible ?? true
          }))
        })
      }
    })
  // 手动 Stop Receiving dropListRef, 因为官方的程序在跨页面 DropList 间似乎 detectChanges 时间先后有问题
  private _dragReleasedSub = this.modelService.dragReleased$.pipe(takeUntilDestroyed()).subscribe((_dropListRef) => {
    this.cdkDropList.forEach((list) => list._dropListRef._stopReceiving(_dropListRef))
    this._cdr.detectChanges()
  })

  constructor() {
    // effect(() => {
    //   console.log(this.calculations())
    // })
  }

  trackById(index: number, el: any) {
    return el.name
  }

  emitEvent(event: CubeEventType) {
    this.entityService.event$.next(event)
  }

  /** Select the category so we can insert the new item. */
  addNewItem({ id, role }: { id?: string; role?: AggregationRole }, node?) {
    if (!id) {
      this.entityService.newDimension(null)
    } else {
      if (role === AggregationRole.dimension) {
        this.entityService.newHierarchy({ id, name: '' })
      } else if (role === AggregationRole.hierarchy) {
        this.entityService.newLevel({ id, name: '' })
      }
    }
  }

  onDelete(id: string) {
    this.entityService.deleteDimensionProperty(id)
  }

  isSelected(type: ModelDesignerType, key: string) {
    return this.entityService.isSelectedProperty(type, key)
  }

  onSelect(type: ModelDesignerType, node: Partial<CalculatedMember>) {
    if (type === ModelDesignerType.calculatedMember) {
      this.onCalculatedMemberEdit(node as CalculatedProperty)
    } else {
      this.entityService.setSelectedProperty(ModelDesignerType.measure, node.__id__)
    }
    this.cubeComponent.drawerOpened.set(true)
  }

  onAddMeasure(event) {
    event.stopPropagation()
    this.entityService.newMeasure(null)
  }

  duplicateMeasure(member: PropertyMeasure) {
    const newKey = uuid()
    this.entityService.duplicateMeasure({id: member.__id__, newKey})
    this.onSelect(ModelDesignerType.measure, {__id__: newKey})
  }

  onAddCalculatedMember(event) {
    event.stopPropagation()
    this.entityService.newCalculatedMeasure(null)
  }

  onCalculatedMemberEdit(member: Partial<CalculatedMember>) {
    this.entityService.setSelectedProperty(ModelDesignerType.calculatedMember, member.__id__)
    this.editChange.emit(member)
  }

  duplicateCalculatedMember(member: Partial<CalculatedMember>) {
    const newKey = uuid()
    this.entityService.duplicateCalculatedMeasure({id: member.__id__, newKey})
    this.onCalculatedMemberEdit({__id__: newKey})
  }

  onDeleteCalculatedMember(event: Event, member: Partial<CalculatedMember>) {
    event.stopPropagation()
    this.entityService.deleteCalculatedMember(member.__id__)
  }

  onDeleteMeasure(event, member: PropertyMeasure) {
    event.stopPropagation()
    this.entityService.deleteMeasure(member.__id__)
  }

  deleteDimensionUsage(event, member: DimensionUsage) {
    this.entityService.deleteDimensionUsage(member.__id__)
  }

  toDimensionUsage(member: DimensionUsage) {
    this.entityService.navigateDimension(member.__id__)
  }

  dropDimensionPredicate(item: CdkDrag<SemanticModelEntity>) {
    // Dimension usage
    return (
      item.data?.type === SemanticModelEntityType.DIMENSION ||
      // Dimension from source table columns
      item.dropContainer.id === CdkDragDropContainers.FactTableMeasures ||
      item.dropContainer.id === CdkDragDropContainers.FactTableDimensions ||
      // db tables
      item.dropContainer.id === CdkDragDropContainers.Tables
    )
  }

  measureEnterPredicate(item: CdkDrag<SemanticModelEntity>) {
    return item.dropContainer.id === CdkDragDropContainers.FactTableMeasures || item.dropContainer.id === CdkDragDropContainers.FactTableDimensions
  }
  calculatedEnterPredicate(item: CdkDrag<SemanticModelEntity>) {
    return item.dropContainer.id === CdkDragDropContainers.FactTableMeasures || item.dropContainer.id === CdkDragDropContainers.FactTableDimensions
  }
  calculationEnterPredicate(item: CdkDrag<SemanticModelEntity>) {
    return false
  }
  parameterEnterPredicate(item: CdkDrag<SemanticModelEntity>) {
    return false
  }

  /**
   * When drop in the dimension list
   */
  dropDimension(event: CdkDragDrop<any[]>) {
    const previousItem = event.item.data
    const index = event.currentIndex
    if (event.previousContainer.id === event.container.id) {
      this.entityService.moveItemInDimensions(event)
    } else if (event.previousContainer.id === 'list-measures') {
      // 将 Measure 变成 Dimension
      // this.cubeState.moveFromMeasureToDim(previousItem)
    } else if (
      event.previousContainer.id === CdkDragDropContainers.FactTableMeasures ||
      event.previousContainer.id === CdkDragDropContainers.FactTableDimensions
    ) {
      // Insert as a level in hierarchy if it above a level node
      if (event.container.getSortedItems()[event.currentIndex]?.data.role === AggregationRole.level) {
        for (let i = event.currentIndex - 1; i >= 0; i--) {
          const aboveItem = event.container.getSortedItems()[i]
          if (aboveItem?.data.role === AggregationRole.hierarchy) {
            this.entityService.newLevel({
              id: aboveItem.data.__id__,
              index: index - i - 1,
              name: previousItem.name,
              column: previousItem.name,
              caption: previousItem.caption
            })
            return
          }
        }
      } else {
        // Add as a dimension
        this.entityService.newDimension({
          index,
          column: previousItem
        })
        this.emitEvent({ type: 'dimension-created' })
      }
    }

    // Add shared dimension into this cube
    if (
      // event.previousContainer.id === CdkDragDropContainers.ShareDimensions &&
      previousItem.type === SemanticModelEntityType.DIMENSION &&
      event.container.id === CdkDragDropContainers.Dimensions
    ) {
      this.createDimensionUsageByDim(index, previousItem)
    }

    // Add db table as dimension
    if (event.previousContainer.id === CdkDragDropContainers.Tables) {
      this.createDimensionByTable(index, previousItem)
    }
  }

  async dropMeasure(event: CdkDragDrop<any[]>) {
    if (event.previousContainer === event.container) {
      this.entityService.moveItemInMeasures(event)
    } else if (
      event.previousContainer.id === CdkDragDropContainers.FactTableMeasures ||
      event.previousContainer.id === CdkDragDropContainers.FactTableDimensions
    ) {
      this.entityService.newMeasure({ index: event.currentIndex, column: event.item.data.name })
    }
  }

  async dropCalcMembers(event: CdkDragDrop<Partial<CalculatedMember>[]>) {
    if (event.previousContainer === event.container) {
      this.entityService.moveItemInCalculatedMember(event)
    } else if (
      event.previousContainer.id === CdkDragDropContainers.FactTableMeasures ||
      event.previousContainer.id === CdkDragDropContainers.FactTableDimensions
    ) {
      this.entityService.newCalculatedMeasure({ index: event.currentIndex, column: event.item.data.name })
    }
  }

  dropCalculation(event: CdkDragDrop<CalculationProperty[]>) {
    if (event.previousContainer === event.container) {
      this.entityService.moveItemInCalculations(event)
    }
  }

  dropParameter(event: CdkDragDrop<ParameterProperty[]>) {
    if (event.previousContainer === event.container) {
      this.entityService.moveItemInParameters(event)
    }
  }

  aiCalculated() {
    this._dialog
      .open(CommandDialogComponent, {
        backdropClass: 'bg-transparent',
        disableClose: true,
        data: {
          commands: ['calculated']
        }
      })
      .afterClosed()
      .subscribe((result) => {})
  }

  openVariableAttributes(variable: VariableProperty) {
    this.#dialog.open(CubeVariableFormComponent, {
      data: {
        variable,
        dataSettings: this.dataSettings()
      }
    }).closed.subscribe({
      next: (result) => {
        if (result) {
          this.entityService.updateCubeProperty({
            id: variable.__id__,
            type: ModelDesignerType.variable,
            model: result
          })
        }
      }
    })
  }

  onDeleteVariable(event: Event, variable: VariableProperty) {
    this.#dialog.open(CdkConfirmDeleteComponent, {
      data: {
        value: variable.name
      }
    }).closed.subscribe({
      next: (confirm) => {
        if (confirm) {
          this.entityService.deleteCubeProperty({id: variable.__id__, type: ModelDesignerType.variable})
        }
      }
    })
  }

  createDimensionByTable(index: number, table: SQLTableSchema) {
    const factFields = this.factFields()
    this.#dialog
      .open<CreateEntityDialogRetType>(
        ModelCreateEntityComponent,
        {
          viewContainerRef: this.#vcr,
          data: { 
            model: { 
              name: '',
              table: table.name,
              caption: table.label 
            }, 
            entitySets: [
              table
            ], 
            modelType: MODEL_TYPE.OLAP,
            type: SemanticModelEntityType.DIMENSION,
            types: [
              SemanticModelEntityType.DIMENSION,
            ],
            factFields
          },
          backdropClass: 'xp-overlay-share-sheet',
          panelClass: 'xp-overlay-pane-share-sheet',
        }
      )
      .closed
      .subscribe({
        next: (value) => {
          this.entityService.insertDimension({index, dimension: toDimension(value)})
          this.emitEvent({ type: 'dimension-created' })
        }
      })
  }

  createDimensionUsageByDim(index: number, dimState: ModelDimensionState) {
    const factFields = this.factFields()
    this.confirmOptions<{foreignKey: string}>({
      information: this.i18n.translate('PAC.MODEL.CREATE_ENTITY.SelectForeignKeyForDimension', {Default: 'Select the corresponding fact table foreign key for the associated dimension'}),
      formFields: [
        {
          key: 'foreignKey',
          type: 'select',
          props: {
            label: this.i18n.translate('PAC.MODEL.CREATE_ENTITY.FactForeignKey', {Default: 'Foreign key of fact'}),
            required: true,
            options: factFields,
            searchable: true
          }
        },
      ]
    }).subscribe((value) => {
      if (value) {
        this.entityService.newDimensionUsage({
          index,
          usage: {
            name: dimState.dimension.name,
            caption: dimState.dimension.caption,
            source: dimState.dimension.name,
            foreignKey: value.foreignKey
          }
        })
        this.emitEvent({ type: 'dimension-created' })
      }
    })
  }

  onEditCalculation(member?: Partial<CalculationProperty>) {
     this.#dialog.open<CalculationProperty>(
        NgmCalculationEditorComponent,
        {
          viewContainerRef: this.#vcr,
          backdropClass: 'xp-overlay-share-sheet',
          panelClass: 'xp-overlay-pane-share-sheet',
          data: {
            dataSettings: this.dataSettings(),
            entityType: this.entityType(),
            syntax: Syntax.MDX,
            value: member
          }
        }).closed.subscribe({
          next: (value) => {
            if (value) {
              this.calculations.update((state) => {
                const calculations = [...(state ?? [])]
                const index = calculations.findIndex((item) => item.__id__ === value.__id__)
                if (index > -1) {
                  calculations[index] = {...value}
                } else {
                  calculations.push({...value})
                }
                return calculations
              })
            }
          }
        })
  }

  duplicateCalculation(member: CalculationProperty) {
    const newKey = uuid()
    const newMember = {
          ...member,
          __id__: newKey,
          name: `${member.name} Copy`,
          caption: `${member.caption || member.name} Copy`
        }
    this.calculations.update((calculations) => {
      calculations = [...calculations]
      const index = calculations.findIndex((item) => item.__id__ === member.__id__)
      if (index > -1) {
        calculations.splice(index + 1, 0, newMember)
      } else {
        calculations.push(newMember)
      }
      return calculations
    })
  }

  onDeleteCalculation(member: CalculationProperty) {
    this.calculations.update((calculations) => {
      return calculations.filter((item) => item.__id__ !== member.__id__)
    })
  }

  onEditParameter(member?: Partial<ParameterProperty>) {
    this.#dialog
      .open(NgmParameterCreateComponent, {
        viewContainerRef: this.#vcr,
        data: {
          // dsCoreService: this.dsCoreService(),
          dataSettings: this.dataSettings(),
          entityType: this.entityType(),
          // coreService: this.coreService(),
          name: member?.name
        }
      })
      .closed.subscribe((result: DeepPartial<ParameterProperty>) => {
        console.log(result)
      })
  }

  duplicateParameter(member: ParameterProperty) {
    const newKey = uuid()
    const newMember = {
          ...member,
          __id__: newKey,
          name: `${member.name} Copy`,
          caption: `${member.caption || member.name} Copy`
        }
    this.parameters.update((state) => {
      const parameters = [...state]
      const index = parameters.findIndex((item) => item.__id__ === member.__id__)
      if (index > -1) {
        parameters.splice(index + 1, 0, newMember)
      } else {
        parameters.push(newMember)
      }
      return parameters
    })
  }

  onDeleteParameter(member: ParameterProperty) {
    this.parameters.update((parameters) => {
      return parameters.filter((item) => item.__id__ !== member.__id__)
    })
  }
}
