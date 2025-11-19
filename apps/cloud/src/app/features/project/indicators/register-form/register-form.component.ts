import { CommonModule } from '@angular/common'
import { Component, Input, computed, effect, forwardRef, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import {
  ControlValueAccessor,
  FormControl,
  FormGroup,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  Validators
} from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatFormFieldAppearance, MatFormFieldModule } from '@angular/material/form-field'
import { BusinessAreasService, NgmSemanticModel } from '@metad/cloud/state'
import { CommandDialogComponent } from '@metad/copilot-angular'
import { nonBlank, nonNullable } from '@metad/core'
import { NgmHierarchySelectComponent, NgmMatSelectComponent, NgmTreeSelectComponent } from '@metad/ocap-angular/common'
import { DensityDirective, ISelectOption, NgmDSCoreService } from '@metad/ocap-angular/core'
import { NgmCalculatedMeasureComponent } from '@metad/ocap-angular/entity'
import { NgmSelectionModule, SlicersCapacity } from '@metad/ocap-angular/selection'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import {
  ISlicer,
  Indicator,
  IndicatorType,
  Syntax,
  getEntityDimensions,
  getEntityMeasures,
  isEntityType,
  isSemanticCalendar
} from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ISemanticModel, ITag, registerModel, TagCategoryEnum } from 'apps/cloud/src/app/@core'
import { isEqual } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import {
  BehaviorSubject,
  EMPTY,
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
  tap
} from 'rxjs'
import { ProjectService } from '../../project.service'
import { injectIndicatorFormulaCommand } from '../../copilot'
import { TagEditorComponent } from 'apps/cloud/src/app/@shared/tag'
import { MatIconModule } from '@angular/material/icon'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatRadioModule } from '@angular/material/radio'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { INDICATOR_AGGREGATORS, injectFetchModelDetails } from '@cloud/app/@shared/indicator/'

/**
 * @deprecated use {@link XpIndicatorRegisterFormComponent} instead
 */
@Component({
  standalone: true,
  selector: 'pac-indicator-register-form',
  templateUrl: 'register-form.component.html',
  styleUrls: ['register-form.component.scss'],
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatRadioModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    DensityDirective,
    NgmMatSelectComponent,
    NgmTreeSelectComponent,
    TagEditorComponent,
    NgmHierarchySelectComponent,
    NgmCalculatedMeasureComponent,
    NgmSelectionModule
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => IndicatorRegisterFormComponent)
    }
  ]
})
export class IndicatorRegisterFormComponent implements ControlValueAccessor {
  IndicatorType = IndicatorType
  Syntax = Syntax
  SlicersCapacity = SlicersCapacity
  eTagCategoryEnum = TagCategoryEnum
  AGGREGATORS = INDICATOR_AGGREGATORS
  appearance: MatFormFieldAppearance = 'fill'

  readonly projectService = inject(ProjectService)
  readonly dsCoreService = inject(NgmDSCoreService)
  readonly wasmAgent = inject(WasmAgentService)
  readonly fetchModelDetails = injectFetchModelDetails()
  /**
   * @default use Dialog in cdk
   */
  readonly _dialog = inject(MatDialog)

  @Input() certifications: ISelectOption[]
  readonly models = input<ISemanticModel[]>()

  readonly modelsOptions = computed<ISelectOption[]>(() => {
    return this.models()?.map((item) => ({ key: item.id, caption: item.name, value: item }))
  })

  formGroup = new FormGroup({
    id: new FormControl<string>(null),
    name: new FormControl<string>(null, [Validators.required]),
    code: new FormControl<string>(null, [Validators.required]),
    isActive: new FormControl<boolean>(true),
    isApplication: new FormControl<boolean>(false),
    visible: new FormControl<boolean>(true),
    businessAreaId: new FormControl<string>(null),
    certificationId: new FormControl<string>(null),
    createdByName: new FormControl<string>('Me'),
    principal: new FormControl<string>(null),
    unit: new FormControl<string>(null),
    validity: new FormControl<string>(null),
    business: new FormControl<string>(null),
    modelId: new FormControl<string>(null),
    entity: new FormControl<string>(null),
    type: new FormControl<IndicatorType>(IndicatorType.BASIC),
    measure: new FormControl<string>(null),
    formula: new FormControl<string>(null),
    aggregator: new FormControl<string>(null),
    calendar: new FormControl<string>(null),
    dimensions: new FormControl<string[]>(null),
    filters: new FormControl<ISlicer[]>(null),

    tags: new FormControl<ITag[]>([])
  })

  get id() {
    return this.formGroup.get('id').value
  }
  get code() {
    return this.formGroup.get('code').value
  }
  get name() {
    return this.formGroup.get('name').value
  }
  get group() {
    return this.formGroup.get('group').value
  }
  get entity() {
    return this.formGroup.get('entity') as FormControl
  }
  get typeControl() {
    return this.formGroup.get('type')
  }
  get formula() {
    return this.formGroup.get('formula').value
  }
  set formula(value: string) {
    this.formGroup.patchValue({
      formula: value
    })
  }

  get isDirty() {
    return this.formGroup.dirty
  }

  // states
  private readonly dataSourceName$ = new BehaviorSubject<string>(null)

  private readonly dataSource$ = this.dataSourceName$.pipe(
    distinctUntilChanged(),
    filter(nonNullable),
    switchMap((modelName) => this.dsCoreService.getDataSource(modelName))
  )
  public readonly entitiesLoading$ = new BehaviorSubject<boolean>(false)
  public readonly entities$ = this.dataSource$.pipe(
    switchMap((dataSource) => {
      this.entitiesLoading$.next(true)
      return dataSource.discoverMDCubes().pipe(
        map((entities) => entities.map((item) => ({ key: item.name, caption: item.caption }))),
        catchError((error) => {
          console.error(error)
          this.entitiesLoading$.next(false)
          return EMPTY
        }),
        tap(() => this.entitiesLoading$.next(false))
      )
    })
  )

  readonly businessAreasTree = this.projectService.businessAreasTree

  private readonly entitySet$ = this.entity.valueChanges.pipe(distinctUntilChanged(), filter(nonBlank))
  public readonly dataSettings$ = combineLatest([this.dataSourceName$, this.entitySet$]).pipe(
    map(([dataSource, entitySet]) => ({
      dataSource,
      entitySet
    })),
    distinctUntilChanged(isEqual),
    takeUntilDestroyed(),
    shareReplay(1)
  )
  public readonly entityTypeLoading$ = new BehaviorSubject<boolean>(false)
  public readonly entityType$ = this.dataSettings$.pipe(
    tap(() => this.entityTypeLoading$.next(true)),
    switchMap(({ dataSource, entitySet }) =>
      this.dsCoreService
        .getDataSource(dataSource)
        .pipe(switchMap((dataSource) => dataSource.selectEntityType(entitySet)))
    ),
    tap(() => this.entityTypeLoading$.next(false)),
    filter(isEntityType),
    takeUntilDestroyed(),
    shareReplay(1)
  )
  public readonly measures$ = this.entityType$.pipe(
    map(getEntityMeasures),
    // filter myself
    map((measures) => measures.filter((item) => item.name !== this.indicator().code && item.name !== this.indicator().name)),
    map((items) => items.map((item) => ({ key: item.name, caption: item.caption })))
  )
  public readonly dimensions$ = this.entityType$.pipe(
    map(getEntityDimensions),
    map((items) => items.map((item) => ({ key: item.name, caption: item.caption })))
  )
  public readonly calendars$ = this.entityType$.pipe(
    map(getEntityDimensions),
    map((items) => items.filter((property) => isSemanticCalendar(property)))
  )
  public readonly syntax$ = this.entityType$.pipe(map((entityType) => entityType?.syntax))

  _onChange: any
  _onTouched: any

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly dataSettings = toSignal(this.dataSettings$)
  readonly entityType = toSignal(this.entityType$)
  readonly showFormula = signal(false)
  readonly semanticModel = toSignal(
    this.formGroup.get('modelId').valueChanges.pipe(
      startWith(this.formGroup.get('modelId').value),
      distinctUntilChanged(),
      filter(nonBlank),
      switchMap((id) => this.fetchModelDetails(id))
    )
  )
  readonly indicator = toSignal(this.formGroup.valueChanges.pipe(startWith(this.formGroup.value)))

  /**
  |--------------------------------------------------------------------------
  | Copilot Commands
  |--------------------------------------------------------------------------
  */
  #formulaCommand = injectIndicatorFormulaCommand()

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  #valueSub = this.formGroup.valueChanges
    .pipe(debounceTime(500), takeUntilDestroyed())
    .subscribe((value) => this._onChange?.(value))

  constructor() {
    effect(
      () => {
        const indicator = this.indicator()
        const semanticModel = this.semanticModel()
        if (semanticModel && indicator) {
          const _indicator = {...indicator, visible: false, name: indicator.name?.trim() || '', code: indicator.code?.trim() || ''}
          const indicators = [...semanticModel.indicators]
          const index = indicators.findIndex((item) => item.id === _indicator.id)
          if (index >= 0) {
            indicators.splice(index, 1, _indicator as Indicator)
          } else {
            indicators.push(_indicator as Indicator)
          }
          const dataSource = registerModel(
            {
              ...semanticModel,
              indicators
              // name: semanticModel.key || semanticModel.name, // xmla 中的 CATALOG_NAME 仍然在使用 model name 属性值， 所示改成 data source name 改成 key 之前需要先修改 CATALOG_NAME 的取值逻辑
            } as NgmSemanticModel,
            false,
            this.dsCoreService,
            this.wasmAgent
          )
          this.dataSourceName$.next(dataSource.key)
        }
      },
      { allowSignalWrites: true }
    )      
  }

  writeValue(obj: any): void {
    if (obj) {
      this.formGroup.patchValue(obj)
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.formGroup.disable() : this.formGroup.enable()
    // Disable createdby user as readonly whatever
    this.formGroup.get('createdByName').disable()
  }

  toggleFormula() {
    this.showFormula.update((state) => !state)
  }

  aiFormula() {
    this._dialog
      .open(CommandDialogComponent, {
        backdropClass: 'bg-transparent',
        data: {
          commands: ['iformula']
        }
      })
      .afterClosed()
      .subscribe((result) => {})
  }
}
