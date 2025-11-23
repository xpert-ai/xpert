import { formatNumber } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  HostBinding,
  inject,
  Input,
  signal,
  ViewChild
} from '@angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet'
import { CommentsService, Store, ToastrService } from '@metad/cloud/state'
import { BusinessAreaRole, IBusinessAreaUser, IComment } from '@metad/contracts'
import { NgmCopilotService } from '@metad/copilot-angular'
import { convertTableToCSV, nonNullable } from '@metad/core'
import { DisplayDensity, NgmDSCoreService, NgmLanguageEnum, PERIODS } from '@metad/ocap-angular/core'
import {
  C_MEASURES,
  calcOffsetRange,
  ChartAnnotation,
  ChartDimensionRoleType,
  ChartOptions,
  ChartOrient,
  ChartSettings,
  DataSettings,
  Drill,
  EntityType,
  FilterOperator,
  getDimensionMemberCaption,
  getEntityCalendar,
  getEntityDimensions,
  getEntityHierarchy,
  getEntityLevel,
  getEntityProperty,
  getEntityProperty2,
  getIndicatorMeasureName,
  IFilter,
  Indicator,
  isAdvancedFilter,
  isEntityType,
  isEqual,
  ISlicer,
  isNil,
  isSlicer,
  OrderDirection,
  ReferenceLineAggregation,
  ReferenceLineType,
  ReferenceLineValueType,
  slicerAsString,
  TimeRangeType
} from '@metad/ocap-core'
import { ExplainComponent } from '@metad/story/story'
import { TranslateService } from '@ngx-translate/core'
import { graphic } from 'echarts/core'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import {
  BehaviorSubject,
  combineLatest,
  delay,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  Observable,
  shareReplay,
  startWith,
  switchMap,
  withLatestFrom
} from 'rxjs'
import { IndicatoryMarketComponent } from '../indicator-market.component'
import { IndicatorsStore } from '../services/store'
import { IndicatorState, Trend, TrendColor, TrendReverseColor } from '../types'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-indicator-detail',
  templateUrl: 'indicator-detail.component.html',
  styleUrls: ['indicator-detail.component.scss']
})
export class IndicatorDetailComponent {
  @HostBinding('class.pac-indicator-detail')
  public readonly isIndicatorDetailComponent = true
  TREND = Trend
  DisplayDensity = DisplayDensity
  PERIODS = PERIODS

  private store = inject(IndicatorsStore)
  private indicatoryMarketComponent = inject(IndicatoryMarketComponent)
  readonly #logger = inject(NGXLogger)
  private data? = inject<{ id: string }>(MAT_BOTTOM_SHEET_DATA, { optional: true })
  private _bottomSheetRef? = inject<MatBottomSheetRef<IndicatorDetailComponent>>(MatBottomSheetRef, { optional: true })
  private _cdr = inject(ChangeDetectorRef)
  private toastrService = inject(ToastrService)
  private copilotService = inject(NgmCopilotService)
  private dsCoreService = inject(NgmDSCoreService)
  private commentsService = inject(CommentsService)
  readonly #translate = inject(TranslateService)
  readonly #store = inject(Store)
  readonly #dialog = inject(Dialog)

  private _id$ = new BehaviorSubject<string>(null)
  @Input()
  public get id() {
    return this._id$.value
  }
  public set id(value) {
    this._id$.next(value)
  }

  @Input() desktop = false

  @ViewChild('commentsContent') commentsContent: ElementRef<any>

  /**
  |--------------------------------------------------------------------------
  | Properties
  |--------------------------------------------------------------------------
  */
  readonly businessAreaUser = signal<IBusinessAreaUser>(null)
  readonly isModeler = computed(() => {
    return (
      isNil(this.businessAreaUser()) ||
      this.businessAreaUser()?.role === BusinessAreaRole.Modeler ||
      this.businessAreaUser()?.role === BusinessAreaRole.Adminer
    )
  })
  readonly explainDataSignal = signal<any>(null)

  prompt = ''
  answering = false
  // explainData
  drillExplainData = []
  messages = []
  relative = true

  readonly currentLang$ = toSignal(
    this.#translate.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.#translate.currentLang)
    )
  )
  readonly primaryTheme$ = toSignal(this.#store.primaryTheme$)
  readonly detailPeriods = this.store.detailPeriods
  readonly period = computed(() => this.PERIODS.find((item) => item.name === this.detailPeriods()))

  readonly globalTimeGranularity = toSignal(
    this.dsCoreService.currentTime$.pipe(map(({ timeGranularity }) => timeGranularity))
  )
  readonly timeGranularity = computed(() => {
    const period = this.period()
    const globalTimeGranularity = this.globalTimeGranularity()
    return period?.granularity ?? globalTimeGranularity
  })

  /**
  |--------------------------------------------------------------------------
  | Observables
  |--------------------------------------------------------------------------
  */
  readonly freeSlicers = signal<ISlicer[]>([])
  readonly freeSlicers$ = toObservable(this.freeSlicers)
  // public readonly freeSlicers$ = new BehaviorSubject<ISlicer[]>([])
  public readonly indicator$: Observable<IndicatorState> = this._id$.pipe(
    filter(Boolean),
    switchMap((id) => this.store.selectIndicator(id)),
    distinctUntilChanged(isEqual),
    filter(nonNullable),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly isMobile$ = this.indicatoryMarketComponent.isMobile$
  public readonly notMobile$ = this.indicatoryMarketComponent.notMobile$

  public readonly _dataSettings$ = this.indicator$.pipe(
    map((indicator) => indicator?.dataSettings),
    filter(Boolean),
    distinctUntilChanged()
  )

  public readonly title$ = this.indicator$.pipe(map((indicator) => indicator?.name))

  public readonly entityType$ = this._dataSettings$.pipe(
    switchMap(({ dataSource, entitySet }) => this.dsCoreService.selectEntitySet(dataSource, entitySet)),
    map((entitySet) => entitySet?.entityType)
  )

  private readonly today$ = this.dsCoreService.currentTime$.pipe(map(({ today }) => today))
  private readonly calendar$ = combineLatest([
    this.indicator$.pipe(distinctUntilChanged((prev, curr) => prev?.calendar === curr?.calendar)),
    this.entityType$,
    toObservable(this.timeGranularity)
  ]).pipe(
    map(([indicator, entityType, timeGranularity]) =>
      getEntityCalendar(entityType, indicator.calendar, timeGranularity)
    ),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  private readonly timeSlicer$ = combineLatest([
    this.calendar$,
    toObservable(this.timeGranularity),
    this.today$,
    toObservable(this.store.lookback),
    toObservable(this.period)
  ]).pipe(
    map(([{ dimension, hierarchy, level }, timeGranularity, today, lookBack, period]) => {
      const timeRange = calcOffsetRange(today, {
        type: TimeRangeType.Standard,
        granularity: timeGranularity,
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
    }),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly dataSettings$ = combineLatest([
    this.indicator$,
    this.calendar$,
    this.timeSlicer$,
    this.freeSlicers$
  ]).pipe(
    map(([indicator, { dimension, hierarchy, level }, timeSlicer, freeSlicers]) => {
      // Remove free slicers that already in indicator restrictive filters
      freeSlicers = freeSlicers.filter(
        (slicer) => !indicator.filters?.find((filter) => filter.dimension?.dimension === slicer.dimension?.dimension)
      )

      return [
        {
          id: indicator.id,
          dataSource: indicator.dataSettings.dataSource,
          entitySet: indicator.dataSettings.entitySet,
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
                // zeroSuppression: true,
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
                measure: getIndicatorMeasureName(indicator as Indicator),
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
            groupBy: indicator.dimensions.map((dimension) => ({ dimension, hierarchy: null, level: null }))
          }
        } as DataSettings & {id: string}
      ]
    }),
    distinctUntilChanged(isEqual)
  )

  readonly chartOptions = computed(() => {
    const indicatorTrend = this.trend()
    const currentLang = this.currentLang$()
    const color = currentLang === NgmLanguageEnum.SimplifiedChinese
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
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: color + '80'
            },
            {
              offset: 1,
              color: color + '00'
            }
          ])
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

  readonly mom$ = toSignal(this.indicator$.pipe(map((indicator) => (indicator.data?.MOM > 0 ? Trend.Up : Trend.Down))))
  readonly yoy$ = toSignal(this.indicator$.pipe(map((indicator) => (indicator.data?.YOY > 0 ? Trend.Up : Trend.Down))))

  // Free dimensions as slicers bar
  public readonly freeDimensions$ = this.indicator$.pipe(
    delay(300),
    withLatestFrom(this.timeSlicer$),
    map(([indicator, timeSlicer]) => {
      const dimensions = indicator.dimensions
        ?.filter(
          (dimension) =>
            dimension !== timeSlicer.dimension.dimension &&
            !indicator.filters?.find((filter) => filter.dimension?.dimension === dimension)
        )
        .map((dimension) => {
          return {
            dataSettings: indicator.dataSettings,
            dimension: {
              dimension
            },
            slicer: {}
          }
        })
      return dimensions?.length ? dimensions : null
    }),
    distinctUntilChanged(isEqual)
  )

  private readonly currentPeriodSlicer$ = new BehaviorSubject<ISlicer>(null)
  private readonly periodSlicer$ = combineLatest([
    this.timeSlicer$.pipe(
      map((timeSlicer) => ({
        ...timeSlicer,
        operator: FilterOperator.EQ,
        members: [timeSlicer.members[1]]
      }))
    ),
    this.currentPeriodSlicer$
  ]).pipe(map(([latest, current]) => current ?? latest))

  public readonly drillDimensions$ = combineLatest([
    this.indicator$,
    this.periodSlicer$,
    this.freeSlicers$,
    this.entityType$,
    this.#store.primaryTheme$
  ]).pipe(
    map(([indicator, timeSlicer, freeSlicers, entityType, primaryTheme]) => {
      const locale = this.store.locale
      const pieName = this.#translate.instant('IndicatorApp.Pie', { Default: 'Pie' })
      const barName = this.#translate.instant('IndicatorApp.Bar', { Default: 'Bar' })

      return indicator.filters
        ?.filter((filter) => !filter.dimension?.parameter)
        .map((filter, index) => {
          const slicers = [...indicator.filters]
          slicers.splice(index, 1)

          const property = getEntityProperty(entityType, filter.dimension)
          const hierarchy = getEntityHierarchy(entityType, filter.dimension)
          const measure = getIndicatorMeasureName(indicator as Indicator)
          return {
            id: `${indicator.code}/${filter.dimension?.dimension}`,
            title: hierarchy?.caption ?? property?.caption,
            dataSettings: {
              ...indicator.dataSettings,
              chartAnnotation: <ChartAnnotation>{
                chartType: {
                  name: barName,
                  type: 'Bar',
                  orient: ChartOrient.horizontal,
                  chartOptions: {
                    seriesStyle: {
                      barMinHeight: 10,
                      label: {
                        align: 'left'
                      }
                    }
                  }
                },
                dimensions: [
                  {
                    ...filter.dimension,
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
                    measure: getIndicatorMeasureName(indicator as Indicator),
                    formatting: {
                      shortNumber: true,
                      unit: indicator.unit
                    },
                    order: OrderDirection.DESC,
                    palette: {
                      name: 'Greens'
                    }
                  }
                ]
              },
              selectionVariant: {
                selectOptions: [
                  ...slicers,
                  {
                    ...filter,
                    drill: Drill.Children
                  },
                  timeSlicer,
                  ...freeSlicers
                ]
              }
            },
            chartSettings: <ChartSettings>{
              theme: primaryTheme,
              universalTransition: true,
              chartTypes: [
                {
                  name: pieName,
                  type: 'Pie',
                  variant: 'Doughnut',
                  chartOptions: {
                    seriesStyle: {
                      radius: ['30%', '70%'],
                      minShowLabelAngle: 2,
                      label: {
                        show: true,
                        position: this.desktop ? 'outside' : 'inside',
                        formatter: `{b}\n({d}%)`
                      }
                    },
                    tooltip: {
                      trigger: 'item'
                    }
                  }
                }
              ]
            },
            chartOptions: <ChartOptions>{
              aria: {
                enabled: true,
                decal: {
                  show: true
                }
              },
              grid: {
                right: 20
              },
              categoryAxis: {
                inverse: true
              },
              valueAxis: {
                splitNumber: 3,
                position: 'right',
                minorTick: {
                  show: true,
                  splitNumber: 5
                }
              },
              seriesStyle: {
                colorBy: 'data',
                label: {
                  show: true,
                  position: 'insideRight',
                  formatter: (params) => {
                    return indicator.unit === '%'
                      ? formatNumber(params.data[measure] * 100, locale, '0.1-1') + '%'
                      : formatNumber(params.data[measure], locale, '0.1-1')
                  }
                }
              },
              tooltip: {
                trigger: 'axis',
                axisPointer: {
                  type: 'shadow'
                },
                position: (pos, params, el, elRect, size) => {
                  const obj = {}
                  obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 20
                  obj[['top', 'bottom'][+(pos[1] < size.viewSize[1] / 2)]] = 20
                  return obj
                }
              }
            },
            period: slicerAsString(timeSlicer)
          }
        })
    }),
    shareReplay(1)
  )

  public readonly comments$ = combineLatest([
    this.indicator$.pipe(map((indicator) => indicator?.comments)),
    this.periodSlicer$
  ]).pipe(
    map(([comments, periodSlicer]) =>
      comments.filter(
        (comment) => !comment.options?.period || comment.options?.period === periodSlicer?.members[0].value
      )
    )
  )

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly indicator = toSignal(this.indicator$)
  readonly indicatorMeasureName = computed(() => getIndicatorMeasureName(this.indicator() as Indicator))
  readonly favour = computed(() => this.store.favorites()?.includes(this.indicator()?.id))
  readonly copilotEnabled = toSignal(this.copilotService.enabled$)

  readonly entityType = toSignal(this.entityType$)

  readonly drillLevels = signal<Record<string, string>>({})

  readonly drillDimensions = derivedAsync(() => {
    const drillLevels = this.drillLevels()
    return this.drillDimensions$.pipe(
      // Update title from drillLevels (level from explain data)
      map((drills) =>
        drills?.map((drill) => {
          const level = drillLevels[drill.id]
          if (level) {
            const property = getEntityProperty2(this.entityType(), level)
            return { ...drill, title: property?.caption ?? drill.title }
          }
          return drill
        })
      )
    )
  })

  readonly trend = computed(() => {
    const data = this.explainDataSignal()?.[1]?.data as any[]
    if (data) {
      const values = data.map((_) => _[this.indicatorMeasureName()])
      const start = values[0]
      const end = values[values.length - 1]
      return start > end ? Trend.Down : start < end ? Trend.Up : Trend.None
    }

    return Trend.None
  })

  /**
  |--------------------------------------------------------------------------
  | Subscriptions
  |--------------------------------------------------------------------------
  */
  // New indicator
  private _indicatorSub = this.indicator$.pipe(takeUntilDestroyed()).subscribe(async (indicator) => {
    // Clear free slicers when new indicator
    this.freeSlicers.set([])
    this.messages = []
    this.prompt = ''

    if (indicator?.businessAreaId) {
      this.businessAreaUser.set(await this.store.getBusinessAreaUser(indicator.businessAreaId))
    } else {
      this.businessAreaUser.set(null)
    }

    // remove when signals are ready
    setTimeout(() => {
      this._cdr.detectChanges()
    })
  })

  constructor() {
    if (this.data?.id) {
      this.id = this.data.id
    }

    // effect(() => {
    //   console.log(this.indicator())
    // })
  }

  onClose(event) {
    this._bottomSheetRef.dismiss()
    event.preventDefault()
  }

  toggleFavorite(indicator: IndicatorState) {
    if (this.favour()) {
      this.store.deleteFavorite(indicator)
    } else {
      this.store.createFavorite(indicator)
    }
  }

  togglePeriod(name: string) {
    this.store.toggleDetailPeriods(name)
  }

  async saveAsComment(id: string, comment: string, relative: boolean) {
    comment = comment?.trim()
    if (!comment) {
      return
    }
    try {
      this.answering = true
      const periodSlicer = await firstValueFrom(this.periodSlicer$)
      const result = await firstValueFrom(
        this.commentsService.createForIndicator(
          id,
          comment,
          relative
            ? {
                period: periodSlicer.members[0].value,
                periodCaption: periodSlicer.members[0].label
              }
            : {}
        )
      )
      this.prompt = ''
      this.answering = false
      this.store.addComment(result)
    } catch (err) {
      this.answering = false
      this.toastrService.error(err)
    }
  }

  async deleteComment(comment: IComment) {
    try {
      await firstValueFrom(this.commentsService.delete(comment.id))
      this.store.removeComment(comment)
    } catch (err) {
      this.toastrService.error(err)
    }
  }

  onPeriodSlicerChange(slicers: ISlicer[]) {
    this.#logger.debug(`indicator app detail slicer change:`, slicers)
    if (isAdvancedFilter(slicers[0])) {
      this.currentPeriodSlicer$.next(slicers[0].children[0])
    } else if (isSlicer(slicers[0])) {
      this.currentPeriodSlicer$.next(slicers[0])
    }
  }

  onSlicerChange(event: ISlicer) {
    this.freeSlicers.update((slicers) => {
      slicers = [...slicers]
      const index = slicers.findIndex((item) => item.dimension.dimension === event.dimension.dimension)
      if (event.members?.length) {
        if (index > -1) {
          slicers.splice(index, 1, event)
        } else {
          slicers.splice(0, 0, event)
        }
      } else if (index > -1) {
        slicers.splice(index, 1)
      }
      return slicers
    })
  }

  onExplain(event?: any[]) {
    this.#logger.trace(`[Indicator App] detail explain:`, event)
    // this.explainData = event
    this.explainDataSignal.set(event)
  }

  onDrillExplain(index, drill, event) {
    this.#logger.trace(`indicator app, detail drilldown explain:`, event)
    this.drillExplainData[index] = {
      drill,
      event
    }
    // Get drilldown level
    const item = event.filter(nonNullable)?.find((item) => item.data?.length)?.data[0]
    if (item?.hierarchy && item?.[`[${item.hierarchy}].[LEVEL_UNIQUE_NAME]`]) {
      this.drillLevels.update((levels) => {
        return {
          ...levels,
          [drill.id]: item?.[`[${item.hierarchy}].[LEVEL_UNIQUE_NAME]`]
        }
      })
    }
  }

  openExplain() {
     this.#dialog.open(ExplainComponent, {
          data: this.explainDataSignal()
        })
  }

  makeIndicatorDataPrompt() {
    const queryResult = this.explainDataSignal()?.[1]
    if (queryResult) {
      const lang = this.#translate.currentLang
      const entityType = this.entityType()

      if (isEntityType(entityType)) {
        let dataPrompt =
          this.getPromptForCube(entityType) +
          '\n' +
          'The main data trend on time series is:\n' +
          this.getPromptForChartData(entityType, this.explainDataSignal())

        this.drillExplainData.forEach((drillItem) => {
          if (drillItem) {
            dataPrompt +=
              `\nThe drilldown data on dimension ${drillItem.drill.title} at ${drillItem.drill.period} is:\n` +
              this.getPromptForChartData(entityType, drillItem.event)
          }
        })

        return dataPrompt
      }
    }

    return ``
  }

  getPromptForCube(entityType: EntityType) {
    return `The model ${entityType.caption} contain dimensions: ${getEntityDimensions(entityType)
      .map((dimension) => dimension.caption)
      .join(', ')}`
  }

  getPromptForChartData(entityType: EntityType, explainData) {
    const queryResult = explainData?.[1]
    const chartAnnotation = explainData?.[0].chartAnnotation

    const dimension = chartAnnotation.dimensions[0]
    const dimensionProperty = getEntityHierarchy(entityType, dimension)
    const dimensionLevel = getEntityLevel(entityType, dimension)
    const dimensionCaption = getDimensionMemberCaption(dimension, entityType)
    const measure = chartAnnotation.measures[0]
    const measureProperty = getEntityProperty(entityType, measure)

    const dataPrompt = convertTableToCSV(
      [
        {
          name: dimensionProperty.name,
          caption: dimensionLevel?.caption ?? dimensionProperty.caption + ' Key'
        },
        {
          name: dimensionCaption,
          caption: dimensionLevel?.caption ?? dimensionProperty.caption
        },
        {
          name: measureProperty.name,
          caption: measureProperty.caption
        }
      ],
      queryResult.data
    )

    return dataPrompt
  }

  scrollBottom() {
    setTimeout(() => {
      this.commentsContent.nativeElement.scrollTo({
        top: this.commentsContent.nativeElement.scrollHeight,
        left: 0,
        behavior: 'smooth'
      })
    }, 300)
  }

  @HostBinding('class.reverse-semantic-color')
  public get reverse() {
    return this.currentLang$() === NgmLanguageEnum.SimplifiedChinese
  }
}
