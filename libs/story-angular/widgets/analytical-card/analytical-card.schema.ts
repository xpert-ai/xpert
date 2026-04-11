import { inject, Injectable } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ColorPalettes } from '@xpert-ai/core'
import { PropertyCapacity } from '@xpert-ai/ocap-angular/entity'
import {
  ChartAnnotation,
  ChartOptions,
  ChartSettings,
  ChartType,
  getEntityProperty,
  isIndicatorMeasureProperty,
  isMeasure,
  omit,
  SelectionPresentationVariant
} from '@xpert-ai/ocap-core'
import {
  AccordionWrappers,
  DataSettingsSchemaService,
  DesignerSchema,
  FORMLY_GAP_2,
  FORMLY_MY_2,
  FORMLY_ROW,
  FORMLY_W_1_2,
  PresentationVariantExpansion,
  SchemaState,
  SelectionVariantExpansion
} from '@xpert-ai/story/designer'
import { TranslateService } from '@ngx-translate/core'
import { isEmpty, isEqual } from 'lodash-es'
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs'
import { distinctUntilChanged, map, withLatestFrom } from 'rxjs/operators'
import {
  AllCapacity,
  AxisCapacity,
  CapacityMatrix,
  CategoryAxis,
  DataZoomAttributes,
  DataZoomCapacity,
  GlobalCapacity,
  SeriesCapacityMatrix,
  TooltipCapacity,
  VisualMapCapacity
} from './schemas'

export interface AnalyticalCardSchemaState extends SchemaState {
  model: {
    dataSettings: {
      dataSource: string
      entitySet: string
      chartAnnotation: ChartAnnotation
    }
    selectionPresentationVariants: SelectionPresentationVariant[]
    chartSettings: ChartSettings
    chartOptions: ChartOptions
  }
}

@Injectable()
export class AnalyticalCardSchemaService extends DataSettingsSchemaService<AnalyticalCardSchemaState> {
  readonly chartAnnotation$ = this.select((state) => state.model?.dataSettings?.chartAnnotation)
  readonly _chartType$ = this.chartAnnotation$.pipe(
    map((chartAnnotation) => chartAnnotation?.chartType),
    distinctUntilChanged(isEqual)
  )
  readonly chartType$ = this._chartType$.pipe(
    map((chartType) => chartType?.type),
    distinctUntilChanged()
  )

  readonly restrictedDimensions$ = this.chartAnnotation$.pipe(
    withLatestFrom(this.entitySet$),
    map(([chartAnnotation, entitySet]) => {
      const freeDimensions: string[] = []
      chartAnnotation?.measures?.forEach((measure) => {
        if (isMeasure(measure) && measure?.measure) {
          const property = getEntityProperty(entitySet.entityType, measure.measure)
          if (isIndicatorMeasureProperty(property)) {
            const indicator = entitySet.indicators?.find(
              (indicator) => indicator.code === property.name || indicator.name === property.name
            )
            if (!isEmpty(indicator?.dimensions)) {
              freeDimensions.push(...indicator.dimensions)
            }
          }
        }
      })

      return freeDimensions
    })
  )

  getSchema() {
    return this.chartType$.pipe(
      withLatestFrom(this.translate.stream('Story')),
      map(([type, i18nStory]) => {
        this.STORY_DESIGNER = i18nStory
        const chartType = this.get((state) => state.model?.dataSettings?.chartAnnotation?.chartType)
        return this.getBuilderSchema(chartType, i18nStory)
      })
    )
  }

  getBuilderSchema(chartType: ChartType, i18nStory?) {
    const BUILDER = i18nStory?.Widgets?.Common

    const dataSettings = this.makeDataSettingsContent(
      BUILDER,
      {
        key: 'chartAnnotation',
        props: {
          label: 'Chart Annotation',
          required: true,
          icon: 'analytics'
        },
        fieldGroupClassName: FORMLY_GAP_2 + ' ' + FORMLY_MY_2,
        fieldGroup: this.getChartAnnotationFieldGroup(i18nStory?.Widgets?.CHART)
      } as unknown,
      ...SelectionVariantExpansion(BUILDER, this.dataSettings$),
      ...PresentationVariantExpansion(BUILDER, this.dataSettings$, this.entityType$, this.properties$)
    )
    return [
      {
        wrappers: ['panel'],
        props: {
          padding: true
        },
        fieldGroup: [
          {
            key: 'title',
            type: 'input',
            props: {
              label: BUILDER?.Title ?? 'Title'
              // required: true
            }
          }
        ]
      },
      ...AccordionWrappers([
        {
          key: 'dataSettings',
          label: i18nStory?.Widgets?.Common?.DATA_SETTINGS ?? 'Data Settings',
          toggleable: false,
          expanded: true,
          fieldGroup: dataSettings
        },
        {
          key: 'options',
          label: i18nStory?.Widgets?.CHART?.Options ?? 'Options',
          toggleable: false,
          fieldGroup: [
            {
              fieldGroupClassName: FORMLY_ROW,
              fieldGroup: [
                {
                  className: FORMLY_W_1_2,
                  key: 'hideHeader',
                  type: 'checkbox',
                  props: {
                    label: i18nStory?.Widgets?.CHART?.HideHeader ?? 'Hide Header'
                  }
                },
                {
                  className: FORMLY_W_1_2,
                  key: 'hideDataDownload',
                  type: 'checkbox',
                  props: {
                    label: i18nStory?.Widgets?.CHART?.HideDataDownload ?? 'Hide Data Download'
                  }
                },
                {
                  className: FORMLY_W_1_2,
                  key: 'hideScreenshot',
                  type: 'checkbox',
                  props: {
                    label: i18nStory?.Widgets?.CHART?.HideScreenshot ?? 'Hide Screenshot'
                  }
                },
                {
                  className: FORMLY_W_1_2,
                  key: 'realtimeLinked',
                  type: 'checkbox',
                  props: {
                    label: i18nStory?.Widgets?.CHART?.RealTimeLinkedAnalysis ?? 'Real Time Linked Analysis'
                  }
                },
                {
                  className: FORMLY_W_1_2,
                  key: 'disableContextMenu',
                  type: 'checkbox',
                  props: {
                    label: i18nStory?.Widgets?.CHART?.DisableContextMenu ?? 'Disable Context Menu'
                  }
                }
              ]
            }
          ]
        },
        {
          key: 'chartSettings',
          label: i18nStory?.Widgets?.CHART?.ChartSettings ?? 'Chart Settings',
          toggleable: false,
          fieldGroup: chartSettingsFieldGroup(i18nStory?.Widgets)
        }
      ])

      // getChartOptionsSchema(chartType, i18nStory?.STYLING?.ECHARTS)
    ]
  }

  getChartAnnotationFieldGroup(CHART?) {
    return [
      {
        key: 'chartType',
        type: 'chart-type'
      },
      {
        key: 'measures',
        type: 'array',
        props: {
          label: CHART?.MEASURES ?? 'Measures',
          hideDelete: true,
          sortable: true
        },
        fieldArray: {
          type: 'chart-property',
          props: {
            required: true,
            removable: true,
            sortable: true,
            dataSettings: this.dataSettings$,
            entitySet: this.entitySet$,
            entityType: this.entityType$,
            chartType$: this._chartType$,
            capacities: [
              PropertyCapacity.Measure,
              PropertyCapacity.MeasureAttributes,
              PropertyCapacity.Order,
              PropertyCapacity.MeasureStyle,
              PropertyCapacity.MeasureStyleRole,
              PropertyCapacity.MeasureStyleShape,
              PropertyCapacity.MeasureStylePalette,
              PropertyCapacity.MeasureStylePalettePattern,
              PropertyCapacity.MeasureStyleReferenceLine,
              PropertyCapacity.MeasureStyleChartOptions
            ],
            colors: [...ColorPalettes]
          }
        }
      },
      {
        key: 'dimensions',
        type: 'array',
        props: {
          label: CHART?.DIMENSIONS ?? 'Dimensions',
          hideDelete: true
        },
        fieldArray: {
          type: 'chart-property',
          props: {
            required: true,
            removable: true,
            sortable: true,
            dataSettings: this.dataSettings$,
            entityType: this.entityType$,
            restrictedDimensions: this.restrictedDimensions$,
            capacities: [PropertyCapacity.Dimension, PropertyCapacity.Order, PropertyCapacity.DimensionChart]
          }
        }
      }
    ]
  }
}

@Injectable()
export class MeasureChartOptionsSchemaService implements DesignerSchema<ChartOptions> {
  protected translate = inject(TranslateService)
  get model() {
    return this.model$.value
  }
  set model(value) {
    this.model$.next(value)
  }
  private readonly model$ = new BehaviorSubject<ChartOptions>(null)

  readonly title$ = of(`Chart measure options`)
  readonly title = toSignal(this.title$)

  get chartType() {
    return this.chartType$.value
  }
  set chartType(value) {
    this.chartType$.next(value)
  }
  private readonly chartType$ = new BehaviorSubject<ChartType>(null)

  public readonly storyDesigner$ = this.translate.stream('Story')

  getTitle(): Observable<string> {
    return this.title$
  }

  getSchema() {
    return combineLatest([this.storyDesigner$.pipe(map((i18n) => i18n?.STYLING?.ECHARTS)), this.chartType$.pipe(distinctUntilChanged(isEqual))]).pipe(
      map(([ECHARTS, chartType]) => this.getChartOptions(chartType, ECHARTS).fieldGroup)
    )
  }

  getChartOptions(chartType: ChartType, ECHARTS) {
    const className = FORMLY_W_1_2
    const chartOptions: any = {
      key: 'chartOptions',
      props: {},
      fieldGroup: []
    }

    if (!chartType) {
      return chartOptions
    }

    let capacityMatrix
    const capacityName = chartType.type + (chartType.variant ?? '')
    if (SeriesCapacityMatrix[capacityName]) {
      capacityMatrix = SeriesCapacityMatrix[capacityName]
    } else if (CapacityMatrix[chartType.type]) {
      capacityMatrix = SeriesCapacityMatrix[chartType.type]
    }

    capacityMatrix?.forEach((capacity) => {
      const fieldGroup = capacity(className, ECHARTS)
      if (Array.isArray(fieldGroup)) {
        chartOptions.fieldGroup.push(...fieldGroup)
      } else {
        chartOptions.fieldGroup.push(fieldGroup)
      }
    })

    chartOptions.fieldGroup.push(...AxisCapacity(className, ECHARTS))
    chartOptions.fieldGroup.push(...TooltipCapacity(className, ECHARTS))
    chartOptions.fieldGroup.push(...VisualMapCapacity(className, ECHARTS))
    chartOptions.fieldGroup.push(...DataZoomCapacity(className, ECHARTS))

    return chartOptions
  }
}

@Injectable()
export class DimensionChartOptionsSchemaService implements DesignerSchema<ChartOptions> {
  protected translate = inject(TranslateService)
  get model() {
    return this.model$.value
  }
  set model(value) {
    this.model$.next(value)
  }
  private readonly model$ = new BehaviorSubject<ChartOptions>(null)

  readonly title$ = of(`Chart dimension options`)
  readonly title = toSignal(this.title$)

  getTitle(): Observable<string> {
    return this.title$
  }

  public readonly role$ = this.model$.pipe(map((model) => model.role))
  public readonly storyDesigner$ = this.translate.stream('Story')

  getSchema() {
    return this.storyDesigner$.pipe(
      map((STORY_DESIGNER) => STORY_DESIGNER?.STYLING?.ECHARTS),
      map((I18N) => {
        const className = FORMLY_W_1_2
        const role = this.model?.role
        return [
          ...AccordionWrappers([
            {
              key: 'axis',
              label: I18N?.CATEGORY_AXIS?.TITLE ?? 'Axis',
              fieldGroup: CategoryAxis(className, I18N)
            },
            {
              key: 'dataZoom',
              label: I18N?.DATAZOOM_STYLE?.DATAZOOM ?? 'Data Zoom',
              fieldGroup: [
                {
                  fieldGroupClassName: FORMLY_ROW,
                  fieldGroup: DataZoomAttributes(className, I18N)
                }
              ]
            }
          ])
        ]
      })
    )
  }
}

@Injectable()
export class ChartOptionsSchemaService implements DesignerSchema<ChartOptions> {
  protected translate = inject(TranslateService)

  get model() {
    return this.model$.value
  }
  set model(value) {
    this.model$.next(value)
  }
  private readonly model$ = new BehaviorSubject<ChartOptions>(null)

  readonly title$ = of(`Chart options`)
  readonly title = toSignal(this.title$)

  get chartType() {
    return this.chartType$.value
  }
  set chartType(value) {
    this.chartType$.next(value)
  }
  private readonly chartType$ = new BehaviorSubject<ChartType>(null)

  public readonly storyDesigner$ = this.translate.stream('Story')

  getTitle(): Observable<string> {
    return this.title$
  }

  getSchema() {
    return combineLatest([
      this.storyDesigner$.pipe(map((i18n) => i18n?.STYLING?.ECHARTS)),
      this.chartType$.pipe(
        map((chartType) => omit(chartType, 'chartOptions')),
        distinctUntilChanged(isEqual)
      )
    ]).pipe(map(([ECHARTS, chartType]) => getChartOptionsSchema(chartType, ECHARTS).fieldGroup))
  }
}

export function getChartOptionsSchema(chartType: ChartType, I18N) {
  const className = FORMLY_W_1_2
  const chartOptions: any = {
    key: 'chartOptions',
    fieldGroup: [...GlobalCapacity(className, I18N)]
  }

  if (!chartType) {
    return chartOptions
  }

  let capacityMatrix
  const capacityName = chartType.type + (chartType.variant ?? '')
  if (CapacityMatrix[capacityName]) {
    capacityMatrix = CapacityMatrix[capacityName]
  } else if (CapacityMatrix[chartType.type]) {
    capacityMatrix = CapacityMatrix[chartType.type]
  }

  capacityMatrix?.forEach((capacity) => {
    const fieldGroup = capacity(FORMLY_W_1_2, I18N)
    if (Array.isArray(fieldGroup)) {
      chartOptions.fieldGroup.push(...fieldGroup)
    } else {
      chartOptions.fieldGroup.push(fieldGroup)
    }
  })

  AllCapacity.forEach((capacity) => {
    const fieldGroup = capacity(FORMLY_W_1_2, I18N)
    if (Array.isArray(fieldGroup)) {
      chartOptions.fieldGroup.push(...fieldGroup)
    } else {
      chartOptions.fieldGroup.push(fieldGroup)
    }
  })

  return chartOptions
}

export function chartSettingsFieldGroup(i18n) {
  return [
    {
      fieldGroupClassName: FORMLY_ROW,
      fieldGroup: [
        {
          className: FORMLY_W_1_2,
          key: 'maximumLimit',
          type: 'input',
          props: {
            label: i18n?.CHART?.MaximumLimit ?? 'Maximum Limit',
            type: 'number'
          }
        },
        {
          className: FORMLY_W_1_2,
          key: 'digitInfo',
          type: 'input',
          props: {
            label: i18n?.CHART?.DigitInfo ?? 'Digit Info'
          }
        },
        {
          className: FORMLY_W_1_2,
          key: 'trellisHorizontal',
          type: 'slider',
          props: {
            label: i18n?.CHART?.TrellisHorizontal ?? 'Trellis Horizontal',
            type: 'number',
            thumbLabel: true,
            autoScale: true,
            min: 1,
            max: 10
          }
        },
        {
          className: FORMLY_W_1_2,
          key: 'universalTransition',
          type: 'checkbox',
          props: {
            label: i18n?.CHART?.UniversalTransition ?? 'Universal Transition'
          }
        }
      ]
    },
    {
      key: 'chartTypes',
      type: 'array',
      props: {
        label: i18n?.CHART?.ChartVariants ?? 'Chart Variants',
        hideDelete: true,
        sortable: true
      },
      fieldArray: {
        type: 'chart-type',
        props: {
          removable: true
        }
      }
    }

    // {
    //   key: 'customLogic',
    //   type: 'code-editor',
    //   props: {
    //     label: i18nStory?.Widgets?.CHART?.CustomLogic ?? 'Custom Logic',
    //     language: 'javascript'
    //   },
    //   expressions: {
    //     hide: (field: FormlyFieldConfig) => {
    //       return (
    //         field.parent.parent.model?.dataSettings?.chartAnnotation?.chartType?.type !== NxChartType.Custom
    //       )
    //     }
    //   }
    // }
  ]
}
