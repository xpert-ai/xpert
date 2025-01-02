import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { NgmDSCoreService, NgmLanguageEnum, PERIODS } from '@metad/ocap-angular/core'
import {
  C_MEASURES,
  calcRange,
  ChartAnnotation,
  ChartDimensionRoleType,
  DataSettings,
  FilterOperator,
  getEntityCalendar,
  getIndicatorMeasureName,
  IFilter,
  ISlicer,
  ReferenceLineAggregation,
  ReferenceLineType,
  ReferenceLineValueType,
  TimeRangeType
} from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { map, startWith } from 'rxjs/operators'
import { NgmIndicatorService } from '../indicator.service'
import { Trend, TrendColor, TrendReverseColor } from '../types'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, CdkListboxModule, AnalyticalCardModule],
  selector: 'ngm-indicator-explorer',
  templateUrl: 'explorer.component.html',
  styleUrls: ['explorer.component.scss'],
  providers: [NgmIndicatorService]
})
export class NgmIndicatorExplorerComponent {
  PERIODS = PERIODS

  readonly dataService = inject(NgmIndicatorService)
  readonly dsCoreService = inject(NgmDSCoreService)
  readonly #translate = inject(TranslateService)

  // Inputs
  readonly dataSettings = input.required<DataSettings>()
  readonly indicatorCode = input.required<string>()
  readonly lookBack = input.required<number>()
  readonly primaryTheme = input<string>()
  readonly periodName = model<string>()

  // States
  readonly initied = toSignal(
    this.dataService.onAfterServiceInit().pipe(
      map(() => true),
      startWith(false)
    )
  )
  readonly indicator = computed(() => {
    const code = this.indicatorCode()
    if (code && this.initied()) {
      return this.dataService.getIndicator(code)
    }
    return null
  })

  readonly currentLang$ = toSignal(
    this.#translate.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.#translate.currentLang)
    )
  )

  readonly entityType = derivedAsync(() => {
    const { dataSource, entitySet } = this.dataSettings() ?? {}
    return dataSource && entitySet
      ? this.dsCoreService.selectEntitySet(dataSource, entitySet).pipe(map((entitySet) => entitySet?.entityType))
      : of(null)
  })

  readonly indicatorCalendar = computed(() => this.indicator()?.calendar)
  readonly calendar = computed(() => {
    const entityType = this.entityType()
    const calendar = this.indicatorCalendar()
    const timeGranularity = this.timeGranularity()
    const period = this.period()
    return getEntityCalendar(entityType, calendar, period?.granularity ?? timeGranularity)
  })

  // readonly detailPeriods = model<string>()
  readonly period = computed(() => PERIODS.find((item) => item.name === this.periodName()))
  readonly timeGranularity = computed(() => this.period()?.granularity)

  readonly today = toSignal(this.dsCoreService.currentTime$.pipe(map(({ today }) => today)))
  readonly timeSlicer = computed(() => {
    const { dimension, hierarchy, level } = this.calendar() ?? {}
    const today = this.today() ?? new Date()
    const timeGranularity = this.timeGranularity()
    const period = this.period()
    const lookBack = this.lookBack()

    const timeRange = calcRange(today, {
      type: TimeRangeType.Standard,
      granularity: period?.granularity ?? timeGranularity,
      formatter: level?.semantics?.formatter,
      lookBack: period?.lookBack ?? lookBack,
      lookAhead: 0
    })

    return {
      dimension: {
        dimension: dimension.name,
        hierarchy: hierarchy.name
      },
      members: timeRange.map((value) => ({ key: value })),
      operator: FilterOperator.BT
    } as IFilter
  })

  readonly freeSlicers = signal<ISlicer[]>([])

  readonly analyticalCards = computed(() => {
    const indicator = this.indicator()
    const { dimension, hierarchy, level } = this.calendar() ?? {}
    const timeSlicer = this.timeSlicer()
    let freeSlicers = this.freeSlicers()
    const dataSettings = this.dataSettings()

    // Remove free slicers that already in indicator restrictive filters
    freeSlicers = freeSlicers.filter(
      (slicer) => !indicator.filters?.find((filter) => filter.dimension?.dimension === slicer.dimension?.dimension)
    )

    return [
      {
        ...dataSettings,
        id: indicator.id,
        chartAnnotation: <ChartAnnotation>{
          chartType: {
            type: 'Line'
          },
          dimensions: [
            {
              dimension: dimension.name,
              hierarchy: hierarchy.name,
              level: level.name,
              role: ChartDimensionRoleType.Time,
              zeroSuppression: true,
              chartOptions: {
                dataZoom: {
                  type: 'inside'
                }
              }
            }
          ],
          measures: [
            {
              dimension: C_MEASURES,
              measure: getIndicatorMeasureName(indicator),
              formatting: {
                shortNumber: true,
                unit: indicator.unit
              },
              referenceLines: [
                {
                  label: 'Max',
                  type: ReferenceLineType.markPoint,
                  valueType: ReferenceLineValueType.dynamic,
                  aggregation: ReferenceLineAggregation.max
                },
                {
                  label: 'Min',
                  type: ReferenceLineType.markPoint,
                  valueType: ReferenceLineValueType.dynamic,
                  aggregation: ReferenceLineAggregation.min
                }
              ]
            }
          ]
        },
        selectionVariant: {
          selectOptions: [timeSlicer, ...(indicator.filters ?? []), ...freeSlicers]
        },
        presentationVariant: {
          groupBy: indicator.dimensions?.map((dimension) => ({ dimension, hierarchy: null, level: null }))
        }
      } as DataSettings & { id: string }
    ]
  })

  readonly chartOptions = computed(() => {
    const indicatorTrend = Trend.Up
    const currentLang = this.currentLang$()

    const color =
      currentLang === NgmLanguageEnum.SimplifiedChinese
        ? TrendReverseColor[Trend[indicatorTrend] ?? Trend[Trend.None]]
        : TrendColor[Trend[indicatorTrend] ?? Trend[Trend.None]]
    return {
      options: {
        animation: false
      },
      grid: {
        top: 50,
        right: 10
      },
      seriesStyle: {
        symbol: 'emptyCircle',
        symbolSize: 20,
        lineStyle: {
          color
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: color + '80'
              },
              {
                offset: 1,
                color: color + '00'
              }
            ]
          }
        },
        itemStyle: {
          color: '#ffab00',
          borderColor: color,
          borderWidth: 3,
          opacity: 0
        },
        emphasis: {
          itemStyle: {
            opacity: 1
          }
        },
        selectedMode: 'single',
        select: {
          itemStyle: {
            opacity: 1
          }
        },
        markPoint: {
          label: {
            color: 'white'
          }
        }
      },
      valueAxis: {
        splitNumber: 3,
        position: 'right',
        minorTick: {
          show: true,
          splitNumber: 5
        }
      },
      categoryAxis: {
        splitLine: {
          show: true
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross'
        },
        position: (pos, params, el, elRect, size) => {
          const obj = {}
          obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 60
          obj[['top', 'bottom'][+(pos[1] < size.viewSize[1] / 2)]] = 20
          return obj
        }
      }
    }
  })

  constructor() {
    effect(() => {
      if (this.dataSettings()) {
        this.dataService.dataSettings = this.dataSettings()
      }
    }, { allowSignalWrites: true })

    effect(() => {
      if (this.timeGranularity()) {
        this.dataService.timeGranularity = this.timeGranularity()
      }
    }, { allowSignalWrites: true })

    effect(
      () => {
        this.dataService.patchState({
          indicatorId: this.indicatorCode(),
          lookBack: this.lookBack()
        })

        if (this.initied()) {
          this.dataService.refresh()
        }
      },
      { allowSignalWrites: true }
    )
  }

  onPeriodSlicerChange(slicers: ISlicer[]) {
    //
  }

  onExplain(event?: any[]) {
    //
  }

  togglePeriod(name: string) {
    this.periodName.update((state) => (state === name ? null : name))
  }
}
