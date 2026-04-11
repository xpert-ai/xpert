import { SmartBusinessState, PeriodFunctions, SmartBusinessService, Indicator, Property, PropertyHierarchy, TimeGranularity, getDefaultHierarchy, QueryReturn, mapTimeGranularitySemantic, calcRange, TimeRangeType, FilterOperator, C_MEASURES, getIndicatorMeasureName, QueryOptions, getCalendarDimension, isEmpty } from '@xpert-ai/ocap-core'
import { isString } from 'lodash-es'
import { BehaviorSubject, EMPTY, filter, map, Observable, switchMap, tap, withLatestFrom } from 'rxjs'

export interface IndicatorBusinessState extends SmartBusinessState {
  indicatorId: string
  /**
   * time period functions for indicator measure
   */
  measures: Array<PeriodFunctions>
  lookBack?: number
}

/**
 * 
 */
export class SmartIndicatorDataService<T, S extends IndicatorBusinessState = IndicatorBusinessState>
  extends SmartBusinessService<T, S> {

  get indicator() {
    return this._indicator$.value
  }
  set indicator(value: Indicator) {
    this._indicator$.next(value)
  }

  get lookBack() {
    return this.get((state) => state.lookBack)
  }

  private _indicator$ = new BehaviorSubject<Indicator>(null)
  public readonly indicator$ = this._indicator$.pipe(filter((value) => !!value))

  public readonly indicatorId$ = this.select((state) => state.indicatorId)
  public readonly measures$ = this.select((state) => state.measures)

  calendar: Property
  calendarHierarchy: PropertyHierarchy
  // measures = {}
  indicatorMeasures = {}

  currentTime: { today: Date; timeGranularity: TimeGranularity }

  override onInit(): Observable<any> {
    return this.indicatorId$.pipe(
      withLatestFrom(this.measures$),
      map(([id, measures]) => {
        this.calendar = this.getCalendar()
        this.calendarHierarchy = getDefaultHierarchy(this.calendar)

        if (id) {
          this.indicator = this.getIndicator(id as string)
          if (this.indicator) {
            if (!isEmpty(measures)) {
              this.registerMembers(this.indicator, measures)
            }
          } else {
            console.log(
              `没有找到相应指标, 一般为 Entity 与 Indicator 没有同时更新而没有对应上导致. Entity is`,
              this.dataSettings.entitySet,
              `Schema is`,
              this.entityService.dataSource.options.schema,
              `Indicator is`,
              id
              // this.entityService.dataSource.options.schema?.entitySets[this.dataSettings.entitySet].indicators
            )
          }
        }

        return this.indicator
      }),
      switchMap(() => this.dsCoreService.currentTime$.pipe(tap((currentTime) => (this.currentTime = currentTime))))
    )
  }

  registerMembers(indicator: Indicator, members: Array<PeriodFunctions>) {
    return members.map((type) => {
      const name = this.getOrRegisterMember(indicator, type)
      return [type, name]
    })
  }

  queryIndicator(
    indicator: Indicator | string,
    measures: Array<PeriodFunctions>,
    lookBack?: number
  ): Observable<QueryReturn<T>> {
    indicator = isString(indicator) ? this.getIndicator(indicator as string) : indicator as Indicator

    if (!indicator) {
      console.warn(
        `没有找到相应指标, 一般为 Entity 与 Indicator 没有同时更新而没有对应上导致. Entity is`,
        this.dataSettings.entitySet,
        `Schema is`,
        this.entityService.dataSource.options.schema,
        `Indicator is`,
        indicator
      )

      return EMPTY
    }

    const measureNames = this.registerMembers(indicator, measures)

    let timeRange = []
    if (this.currentTime) {
      if (!this.currentTime.timeGranularity) {
        throw new Error(`Not set current time granularity`)
      }

      const calendarSemantic = mapTimeGranularitySemantic(this.currentTime.timeGranularity)
      const calendarLevel = this.calendarHierarchy.levels?.find(
        (level) => level.semantics?.semantic === calendarSemantic
      )
      if (calendarLevel) {
        timeRange = calcRange(this.currentTime?.today || new Date(), {
          type: TimeRangeType.Standard,
          granularity: this.currentTime?.timeGranularity,
          formatter: calendarLevel.semantics.formatter,
          lookBack
        })
      } else {
        throw new Error(`Can't found calendar level in ${this.calendarHierarchy.name}`)
      }
    } else {
      throw new Error(`Not set current period`)
    }

    const tFilter =
      timeRange[0] === timeRange[1]
        ? {
            dimension: {
              dimension: this.calendar.name,
              hierarchy: this.calendarHierarchy.name
            },
            members: [{ value: timeRange[0] }]
          }
        : {
            dimension: {
              dimension: this.calendar.name,
              hierarchy: this.calendarHierarchy.name
            },
            members: timeRange.map((value) => ({ value })),
            operator: FilterOperator.BT
          }

    return super
      .selectQuery({
        rows: [
          {
            dimension: this.calendar.name,
            hierarchy: this.calendarHierarchy.name,
            zeroSuppression: true
          }
        ],
        columns: [
          {
            dimension: C_MEASURES,
            members: measureNames.map((item) => item[1])
          }
        ],
        filters: [...(indicator.filters ?? []), tFilter]
      })
      .pipe(
        map((result) => {
          return {
            ...result,
            data: result.data?.map((item) => {
              measureNames.forEach(([measure, name]) => {
                item[measure] = item[name]
              })
              return item
            }),
            stats: {
              ...(result.stats ?? {}),
              indicator
            }
          }
        })
      )
  }

  getOrRegisterMember(indicator: Indicator, type: PeriodFunctions) {
    if (!this.indicatorMeasures[indicator.id]) {
      const measureName = getIndicatorMeasureName(indicator)
      if (!measureName) {
        throw new Error(`Can't found measure name for indicator '${indicator.code}'`)
      }
      this.indicatorMeasures[indicator.id] = {
        CurrentPeriod: measureName
      }
    }
    const measureNames = this.indicatorMeasures[indicator.id]
    if (!measureNames[type]) {
      measureNames[type] = this.getCalculatedMember(measureNames['CurrentPeriod'], type).name
    }
    return measureNames[type]
  }

  override query(options: QueryOptions, indicator?: Indicator, measures?: Array<PeriodFunctions>, lookBack?: number) {
    return this.selectQuery(options, indicator, measures, lookBack)
  }

  override selectQuery(options: QueryOptions, indicator?: Indicator, measures?: Array<PeriodFunctions>, lookBack?: number) {
    return this.queryIndicator(
      indicator ?? this.indicator,
      measures ?? this.get((state) => state.measures),
      lookBack ?? this.lookBack
    )
  }

  getCalendar() {
    const calendar = getCalendarDimension(this.entityType)
    return calendar
  }
}
