import { Component, DestroyRef, Input, OnInit, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, UntypedFormArray } from '@angular/forms'
import { NgmFormlyArrayComponent } from '@xpert-ai/formly/array'
import { NgmDSCoreService, NgmFieldAppearance } from '@xpert-ai/ocap-angular/core'
import {
  AggregationRole,
  CalculationProperty,
  ChartDimensionRoleType,
  ChartMeasureRoleType,
  ChartPattern,
  ChartType,
  DataSettings,
  EntitySet,
  EntityType,
  getEntityProperty
} from '@xpert-ai/ocap-core'
import { FieldType } from '@ngx-formly/core'
import { TranslateService } from '@ngx-translate/core'
import { NgmChromaticInterpolateGroup, getScaleChromaticInterpolates } from '@xpert-ai/components/palette'
import { PropertyCapacity } from '@xpert-ai/ocap-angular/entity'
import { isEqual, startCase } from 'lodash-es'
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  from,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  Subscription
} from 'rxjs'

type DesignerPanelService = {
  openSecondDesigner: (...args: unknown[]) => Observable<any>
}

const noopDesignerPanelService: DesignerPanelService = {
  openSecondDesigner: () => of(null)
}

@Component({
  selector: 'pac-formly-property-select',
  standalone: false,
  templateUrl: './property-select.component.html',
  styleUrls: ['./property-select.component.scss']
})
export class PACFormlyPropertySelectComponent extends FieldType implements OnInit {
  public interpolateGroups: NgmChromaticInterpolateGroup[]
  readonly coreService: unknown = null
  readonly destroyRef = inject(DestroyRef)
  readonly formlyArray? = inject(NgmFormlyArrayComponent, { optional: true })
  readonly standaloneNgModelOptions = { standalone: true }

  DIMENSION_ROLES = [
    { label: 'None', value: null },
    { label: 'Category', value: ChartDimensionRoleType.Category },
    { label: 'Category2', value: ChartDimensionRoleType.Category2 },
    { label: 'Group', value: ChartDimensionRoleType.Group },
    { label: 'Stacked', value: ChartDimensionRoleType.Stacked },
    // { label: 'Color', value: ChartDimensionRoleType.Color }, 应该是还未支持
    { label: 'Trellis', value: ChartDimensionRoleType.Trellis }
  ]

  MEASURE_ROLES = [
    { label: 'None', value: null },
    { label: 'Axis1', value: ChartMeasureRoleType.Axis1 },
    { label: 'Axis2', value: ChartMeasureRoleType.Axis2 },
    { label: 'Axis3', value: ChartMeasureRoleType.Axis3 },
    { label: 'Size', value: ChartMeasureRoleType.Size },
    { label: 'Lightness', value: ChartMeasureRoleType.Lightness },
    { label: 'SizeLightness', value: ChartMeasureRoleType.SizeLightness },
    { label: 'Tooltip', value: ChartMeasureRoleType.Tooltip }
  ]

  PATTERNS = [
    { label: 'A', value: ChartPattern.a },
    { label: 'B', value: ChartPattern.b },
    { label: 'C', value: ChartPattern.c },
    { label: 'D', value: ChartPattern.d },
    { label: 'E', value: ChartPattern.e },
    { label: 'F', value: ChartPattern.f },
    { label: 'G', value: ChartPattern.g },
    { label: 'H', value: ChartPattern.h }
  ]

  SHAPE_TYPES = [
    { label: 'Bar', value: 'bar', icon: 'stacked_bar_chart' },
    { label: 'Line', value: 'line', icon: 'show_chart' },
    { label: 'Scatter', value: 'scatter', icon: 'scatter_plot' }
  ]

  /**
   * 对接 ngm-property-select 的 FormControl, 与当前组件的 formControl 连接
   */
  _formControl = new FormControl()

  @Input() appearance: NgmFieldAppearance = 'fill'
  get capacities() {
    return this.props.capacities
  }
  get showMeasureStyle() {
    return this.capacities?.includes(PropertyCapacity.MeasureStyle)
  }
  get showColorPalette() {
    return this.capacities?.includes(PropertyCapacity.MeasureStylePalette)
  }
  get showMeasurePalettePattern() {
    return this.capacities?.includes(PropertyCapacity.MeasureStylePalettePattern)
  }
  get showChartAttributes() {
    return this.capacities?.includes(PropertyCapacity.DimensionChart)
  }
  get showMeasureRole() {
    return this.capacities?.includes(PropertyCapacity.MeasureStyleRole)
  }
  get showMeasureShape() {
    return this.capacities?.includes(PropertyCapacity.MeasureStyleShape)
  }
  get showMeasureGridBar() {
    return this.capacities?.includes(PropertyCapacity.MeasureStyleGridBar)
  }
  get showMeasureReferenceLine() {
    return this.capacities?.includes(PropertyCapacity.MeasureStyleReferenceLine)
  }
  get showMeasureChartOptions() {
    return this.capacities?.includes(PropertyCapacity.MeasureStyleChartOptions)
  }

  public readonly dataSettings$ = new BehaviorSubject<DataSettings>(null)
  public readonly entitySet$ = new BehaviorSubject<EntitySet>(null)
  public readonly entityType$ = new BehaviorSubject<EntityType>(null)
  public readonly syntax$ = this.entityType$.pipe(map((entityType) => entityType?.syntax))
  public readonly restrictedDimensions$ = new BehaviorSubject<string[]>(null)

  get removable() {
    return this.field.props?.removable
  }

  get role() {
    return this.formControl.value?.role
  }
  set role(value) {
    this.patchValue({ role: value })
  }

  get palette() {
    return this.formControl.value?.palette?.name
  }
  set palette(value) {
    let interpolate = null
    this.interpolateGroups.find((group) => group.values.find((item) => {
      if (item.name === value) {
        interpolate = item
      }
      return item.name === value
    }))

    this.patchValue({
      palette: {
        ...(this.formControl.value?.palette || {}),
        name: value,
        colors: interpolate?.colors?.map(({fill}) => fill)
      }
    })
  }

  get colors() {
    return this.formControl.value?.palette?.colors
  }
  set colors(value) {
    this.patchValue({
      palette: {
        ...(this.formControl.value?.palette || {}),
        colors: value
      }
    })
  }

  get reverse() {
    return this.formControl.value?.palette?.reverse
  }
  set reverse(value) {
    this.patchValue({
      palette: {
        ...(this.formControl.value?.palette || {}),
        reverse: value
      }
    })
  }

  get pattern() {
    return this.formControl.value?.palette?.pattern
  }
  set pattern(value) {
    this.patchValue({
      palette: {
        ...(this.formControl.value?.palette || {}),
        pattern: value
      }
    })
  }

  get shapeType() {
    return this.formControl.value?.shapeType
  }
  set shapeType(value) {
    this.patchValue({ shapeType: value })
  }
  get bar() {
    return this.formControl.value?.bar
  }
  set bar(value) {
    this.patchValue({ bar: value })
  }

  public readonly property$ = combineLatest([
    this.entityType$.pipe(filter((entityType) => !!entityType?.properties)),
    this._formControl.valueChanges
  ]).pipe(
    map(([entityType, value]) => getEntityProperty(entityType, value)),
    distinctUntilChanged(),
    shareReplay(1)
  )
  public readonly isDimension$ = this.property$.pipe(map((property) => property?.role === AggregationRole.dimension))
  public readonly isMeasure$ = this.property$.pipe(map((property) => property?.role === AggregationRole.measure))

  private chartOptionsSubscription: Subscription
  private referenceLineSubscription: Subscription
  private editAttributesSubscription: Subscription
  private readonly settingsService: DesignerPanelService = noopDesignerPanelService

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private colorsSub = from(getScaleChromaticInterpolates()).subscribe((interpolateGroups) => {
    this.interpolateGroups = interpolateGroups
  })
  constructor(
    public dsCoreService: NgmDSCoreService,
    public translateService: TranslateService
  ) {
    super()

    /**
     * 其他订阅链发生在 template 初始化时, template 初始化又在 input 赋值之后, 所以订阅没有得到 input 值
     * 所以需要在在这里先进行订阅
     * 这也是不如 React useEffect 简单的地方
     */
    this.property$.subscribe()
  }

  ngOnInit(): void {
    // 初始化完成后再发送数据
    if (this.field?.props?.entitySet instanceof Observable) {
      this.field.props.entitySet
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event: EntitySet) => this.entitySet$.next(event))
    } else if (this.field.props.entitySet) {
      this.entitySet$.next(this.field.props.entitySet)
    }

    if (this.field?.props?.entityType instanceof Observable) {
      this.field.props.entityType
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event: EntityType) => this.entityType$.next(event))
    } else if (this.field.props.entityType) {
      this.entityType$.next(this.field.props.entityType)
      // 注意: 这样的 of(event) 异步事件会紧跟着一个 complete 事件导致 this.entityType$ 被 Complete
      // of(this.field.props.entityType).subscribe(this.entityType$)
    }

    if (this.field?.props?.dataSettings instanceof Observable) {
      this.field.props.dataSettings
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event: DataSettings) => this.dataSettings$.next(event))
    } else if (this.field?.props?.dataSettings) {
      this.dataSettings$.next(this.field.props.dataSettings)
    }

    if (this.field?.props?.restrictedDimensions instanceof Observable) {
      this.field.props.restrictedDimensions
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event: string[]) => this.restrictedDimensions$.next(event))
    } else if (this.field?.props?.restrictedDimensions) {
      this.restrictedDimensions$.next(this.field.props.restrictedDimensions)
    }

    this.formControl.valueChanges
      .pipe(startWith(this.formControl.value), distinctUntilChanged(isEqual), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this._formControl.setValue(value)
      })

    this._formControl.valueChanges.pipe(distinctUntilChanged(isEqual), takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.patchValue(value || {})
    })
  }

  patchValue(value) {
    this.formControl.setValue({
      ...(this.formControl.value || {}),
      ...value
    })
  }

  killMyself() {
    if (this.field.form instanceof UntypedFormArray) {
      const index = this.field.parent.fieldGroup.indexOf(this.field)
      this.formlyArray?.remove(index)
    } else {
      const index = this.field.parent.fieldGroup.findIndex((field) => field.key === this.field.key)
      if (index > -1) {
        this.field.parent.fieldGroup.splice(index, 1)
        this.field.parent.model[this.field.key as string] = null
      }
      this.field.parent.formControl.setValue(this.field.parent.model)
    }
  }

  onCalculationChange(property: CalculationProperty) {
    // Legacy event bridge removed with Angular 21 upgrade path.
    // Keep this hook to preserve template behavior without cross-package dependency.
  }

  async openReferenceLine() {
    const title = await firstValueFrom(
      this.translateService.get('FORMLY.PROPERTY_SELECT.REFERENCE_LINE', { Default: 'Reference Lines' })
    )
    this.referenceLineSubscription?.unsubscribe()
    this.referenceLineSubscription = this.settingsService
      .openSecondDesigner(
        'MeasureReferenceLine',
        { referenceLines: this.formControl.value?.referenceLines ?? [] },
        title,
        true
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          this.patchValue({
            referenceLines: result.referenceLines
          })
        }
      })
  }

  async openChartOptions() {
    const title = await firstValueFrom(
      this.translateService.get('FORMLY.PROPERTY_SELECT.ChartOptions', { Default: 'Chart Options' })
    )
    // 优先使用本度量的形状属性作为图形类型
    let chartType: ChartType = await firstValueFrom(this.field?.props?.chartType$ ?? of({}))
    if (this.shapeType) {
      chartType = { ...chartType, type: startCase(this.shapeType) }
    }

    this.chartOptionsSubscription?.unsubscribe()
    this.chartOptionsSubscription = this.settingsService
      .openSecondDesigner(
        'MeasureChartOptions',
        {
          chartType,
          chartOptions: this.formControl.value?.chartOptions ?? {}
        },
        title,
        true
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          this.patchValue({
            chartOptions: result.chartOptions
          })
        }
      })
  }

  async editAttributes() {

    const title = await firstValueFrom(
      this.translateService.get('FORMLY.PROPERTY_SELECT.ChartAttributes', { Default: 'Chart Attributes' })
    )

    this.editAttributesSubscription?.unsubscribe()
    this.editAttributesSubscription = this.settingsService.openSecondDesigner(
      'DimensionChartOptions',
      this.formControl.value?.chartOptions ?? {},
      title,
      true
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result) {
          this.patchValue({
            chartOptions: result
          })
        }
      })
    
  }

  onColorsChange(colors: string[]) {
    this.patchValue({
      palette: {
        ...(this.formControl.value?.palette ?? {}),
        name: null,
      }
    })
  }
}
