import { CommonModule } from '@angular/common'
import { Component, computed, forwardRef, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { NgmColorsComponent } from '@metad/components/form-field'
import {
  NgmChromaticInterpolateGroup,
  NxChromaticPreviewComponent,
  getScaleChromaticInterpolates
} from '@metad/components/palette'
import { ColorPalettes, NxCoreService } from '@metad/core'
import { AppearanceDirective, DensityDirective, NgmDSCoreService, NgmOcapCoreService } from '@metad/ocap-angular/core'
import { NgmEntityModule, PropertyCapacity } from '@metad/ocap-angular/entity'
import {
  AggregationRole,
  CalculationProperty,
  ChartDimensionRoleType,
  ChartMeasureRoleType,
  ChartPattern,
  ChartType,
  DataSettings,
  EntityType,
  getEntityProperty,
  isEqual,
  pick
} from '@metad/ocap-core'
import { NxDesignerModule, NxSettingsPanelService } from '@metad/story/designer'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { upperFirst } from 'lodash-es'
import { BehaviorSubject, distinctUntilChanged, from, map } from 'rxjs'
import { NgmChartDimensionComponent } from './chart-dimension.component'
import { NgmChartMeasureComponent } from './chart-measure.component'
import { NgmReferenceLineComponent } from './reference-line.component'
import { ZardButtonComponent, ZardCheckboxComponent, ZardFormImports, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardFormImports,
    ...ZardMenuImports,
    ZardCheckboxComponent,
    TranslateModule,

    NxDesignerModule,
    NxChromaticPreviewComponent,
    DensityDirective,
    AppearanceDirective,
    NgmColorsComponent,
    NgmChartDimensionComponent,
    NgmReferenceLineComponent,
    NgmChartMeasureComponent,
    NgmEntityModule
  ],
  selector: 'ngm-chart-property',
  templateUrl: 'chart-property.component.html',
  styleUrls: ['chart-property.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmChartPropertyComponent)
    }
  ]
})
export class NgmChartPropertyComponent implements ControlValueAccessor {
  public coreService = inject(NxCoreService)
  public dsCoreService = inject(NgmDSCoreService)
  readonly ocapService = inject(NgmOcapCoreService)
  public settingsService? = inject(NxSettingsPanelService, { optional: true })
  public translateService = inject(TranslateService)

  readonly label = input<string>(null)
  readonly capacities = input<PropertyCapacity[]>(null)
  readonly chartType = input<ChartType>(null)
  readonly dataSettings = input<DataSettings>(null)
  readonly entityType = input<EntityType>(null)

  public interpolateGroups: NgmChromaticInterpolateGroup[]
  public colorPalettes = ColorPalettes

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

  private readonly model = signal(null)

  /**
   * 对接 ngm-property-select 的 FormControl, 与当前组件的 formControl 连接
   */
  formControl = new FormControl()

  // get showMeasureStyle() {
  //   return this.capacities()?.includes(PropertyCapacity.MeasureStyle)
  // }
  readonly showColorPalette = computed(() => this.capacities()?.includes(PropertyCapacity.MeasureStylePalette))
  readonly showMeasurePalettePattern = computed(() =>
    this.capacities()?.includes(PropertyCapacity.MeasureStylePalettePattern)
  )
  readonly showChartAttributes = computed(() => this.capacities()?.includes(PropertyCapacity.DimensionChart))
  readonly showMeasureRole = computed(() => this.capacities()?.includes(PropertyCapacity.MeasureStyleRole))
  readonly showMeasureShape = computed(() => this.capacities()?.includes(PropertyCapacity.MeasureStyleShape))
  readonly showMeasureGridBar = computed(() => this.capacities()?.includes(PropertyCapacity.MeasureStyleGridBar))
  readonly showMeasureReferenceLine = computed(() =>
    this.capacities()?.includes(PropertyCapacity.MeasureStyleReferenceLine)
  )
  readonly showMeasureChartOptions = computed(() =>
    this.capacities()?.includes(PropertyCapacity.MeasureStyleChartOptions)
  )

  public readonly syntax = computed(() => this.entityType()?.syntax)
  public readonly restrictedDimensions$ = new BehaviorSubject<string[]>(null)

  get role() {
    return this.model()?.role
  }
  set role(value) {
    this.patchValue({ role: value })
  }

  get palette() {
    return this.model()?.palette?.name
  }
  set palette(value) {
    let interpolate = null
    this.interpolateGroups.find((group) =>
      group.values.find((item) => {
        if (item.name === value) {
          interpolate = item
        }
        return item.name === value
      })
    )

    this.patchValue({
      palette: {
        ...(this.model()?.palette || {}),
        name: value,
        colors: interpolate?.colors?.map(({ fill }) => fill)
      }
    })
  }

  get colors() {
    return this.model()?.palette?.colors
  }
  set colors(value) {
    this.patchValue({
      palette: {
        ...(this.model()?.palette || {}),
        colors: value
      }
    })
  }

  get reverse() {
    return this.model()?.palette?.reverse
  }
  set reverse(value) {
    this.patchValue({
      palette: {
        ...(this.model()?.palette || {}),
        reverse: value
      }
    })
  }

  get pattern() {
    return this.model()?.palette?.pattern
  }
  set pattern(value) {
    this.patchValue({
      palette: {
        ...(this.model()?.palette || {}),
        pattern: value
      }
    })
  }

  get shapeType() {
    return this.model()?.shapeType
  }
  set shapeType(value) {
    this.patchValue({ shapeType: value })
  }
  get bar() {
    return this.model()?.bar
  }
  set bar(value) {
    this.patchValue({ bar: value })
  }

  get referenceLines() {
    return this.model()?.referenceLines
  }
  set referenceLines(value) {
    this.patchValue({ referenceLines: value })
  }

  get chartOptions() {
    return this.model()?.chartOptions
  }
  set chartOptions(value) {
    this.patchValue({ chartOptions: value })
  }

  public readonly dimension = toSignal(
    this.formControl.valueChanges.pipe(
      map((value) => pick(value, 'dimension', 'hierarchy', 'level', 'measure')),
      distinctUntilChanged(isEqual)
    )
  )

  public readonly property = computed(() => getEntityProperty(this.entityType(), this.dimension()))

  public readonly isDimension = computed(() => {
    return this.property()?.role === AggregationRole.dimension
  })
  public readonly isMeasure = computed(() => {
    return this.property()?.role === AggregationRole.measure
  })

  readonly _chartType = computed(() => ({
    ...(this.chartType() ?? {}),
    type: upperFirst(this.model()?.shapeType ?? this.chartType()?.type)
  }))

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private colorsSub = from(getScaleChromaticInterpolates())
    .pipe(takeUntilDestroyed())
    .subscribe((interpolateGroups) => {
      this.interpolateGroups = interpolateGroups
    })

  private valueSub = toObservable(this.model)
    .pipe(takeUntilDestroyed())
    .subscribe((value) => {
      this.onChange?.(value)
    })
  private formControSub = this.formControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
    this.model.set({
      ...this.model(),
      ...(value ?? {})
    })
  })

  onChange: (input: any) => void
  onTouched: () => void

  writeValue(obj: any): void {
    if (obj) {
      this.formControl.patchValue(obj)
      this.model.set(obj)
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.formControl.disable() : this.formControl.enable()
  }

  patchValue(value) {
    this.model.set({
      ...this.model(),
      ...(this.formControl.value ?? {}),
      ...value
    })
  }

  onCalculationChange(property: CalculationProperty) {
    this.ocapService.updateEntity({
      type: 'Calculation',
      dataSettings: this.dataSettings(),
      property
    })
  }

  onColorsChange(colors: string[]) {
    this.patchValue({
      palette: {
        ...(this.model()?.palette ?? {}),
        name: null
      }
    })
  }
}
