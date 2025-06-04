import { BehaviorSubject, combineLatest, EMPTY, filter, map, Observable, withLatestFrom } from 'rxjs'
import { PeriodFunctions, Semantics } from '../annotations'
import {
  calcOffsetRange,
  EntityType,
  getEntityCalendar,
  getEntityDimensions,
  getEntityProperty,
  getIndicatorMeasureName,
  Indicator,
  mapTimeGranularitySemantic,
  Property,
  PropertyHierarchy,
  PropertyLevel,
  QueryReturn,
  TimeGranularity,
  TimeRangeType
} from '../models/index'
import { C_MEASURES, FilterOperator, QueryOptions } from '../types'
import { isEmpty, isString, nonNullable } from '../utils'
import { SmartBusinessService, SmartBusinessState } from './smart-business.service'

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
export class SmartIndicatorDataService<
  T,
  S extends IndicatorBusinessState = IndicatorBusinessState
> extends SmartBusinessService<T, S> {
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
  calendarLevel: PropertyLevel
  /**
   * Cache of time calculation members of indicators
   */
  indicatorMeasures: Record<string, Record<string, string>> = {}

  readonly #timeGranularity$ = new BehaviorSubject<TimeGranularity>(null)

  // currentTime: { today: Date; timeGranularity?: TimeGranularity }

  /**
   * Default time granularity for indicator trend
   */
  get timeGranularity() {
    return this.#timeGranularity$.value
  }
  set timeGranularity(value) {
    this.#timeGranularity$.next(value)
  }

  override onInit(): Observable<any> {
    return combineLatest([this.indicatorId$, this.#timeGranularity$]).pipe(
      filter(([idOrCode, ]) => !!idOrCode),
      withLatestFrom(this.measures$),
      map(([[id, timeGranularity], measures]) => {
        if (id) {
          this.indicator = this.getIndicator(id as string)
          if (this.indicator) {
            // this.currentTime = currentTime
            const { dimension, hierarchy, level } = getIndicatorEntityCalendar(
              this.indicator,
              this.entityType,
              timeGranularity
            )
            this.calendar = dimension
            this.calendarHierarchy = hierarchy
            this.calendarLevel = level

            if (!isEmpty(measures)) {
              this.registerMembers(this.indicator, measures)
            }
          } else {
            /**
             * This should be avoided
             */
            console.error(
              `没有找到相应指标, 一般为 Entity 与 Indicator 没有同时更新而没有对应上导致. Entity is ‘${this.dataSettings.entitySet}’`,
              `Schema is`,
              this.entityService.dataSource.options.schema,
              `Indicator is ‘${id}’`,
            )
          }
        }

        return this.indicator
      })
    )
  }

  /**
   * Register a derivative indicator of an indicator such as year-on-year, month-on-month
   * 
   * @param indicator 
   * @param members 
   * @returns 
   */
  registerMembers(indicator: Indicator, members: Array<PeriodFunctions>) {
    return members.map((type) => {
      const name = this.getOrRegisterMember(indicator, type)
      return [type, name]
    })
  }

  queryIndicator(
    indicator: Indicator | string,
    measures: Array<PeriodFunctions>,
    lookBack?: number,
    force?: boolean | void
  ): Observable<QueryReturn<T>> {
    indicator = isString(indicator) ? this.getIndicator(indicator as string) : (indicator as Indicator)

    if (!indicator) {
      /**
       * This should be avoided
       */
      console.error(
        `没有找到相应指标, 一般为 Entity 与 Indicator 没有同时更新而没有对应上导致. Entity is ‘${this.dataSettings.entitySet}’`,
        `Schema is`,
        this.entityService.dataSource.options.schema,
        `Indicator is ‘${indicator}’`,
      )

      return EMPTY
    }

    const measureNames = this.registerMembers(indicator, measures)

    let timeRange = []
    const currentTime = this.dsCoreService.getToday()
    if (currentTime) {
      if (this.calendarLevel) {
        timeRange = calcOffsetRange(currentTime?.today || new Date(), {
          type: TimeRangeType.Standard,
          granularity: this.timeGranularity,
          formatter: this.calendarLevel.semantics?.formatter,
          lookBack,
          lookAhead: 0
        })
      } else {
        throw new Error(`Can't found calendar level in ${this.calendarHierarchy.name}`)
      }
    } else {
      throw new Error(`Not set current period`)
    }

    const tFilter = this.timeRange2Slicer(timeRange)

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
            members: measureNames.map((item) => item[1]).filter(nonNullable)
          }
        ],
        filters: [...(indicator.filters ?? []), tFilter],
        force
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

  /**
   * Get or register the time calculation member of the indicator,
   *  such as the year-on-year and month-on-month changes of a certain indicator
   *
   * @param indicator
   * @param type
   * @returns
   */
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
    // 缓存中并且 EntityType Measures 中已存在相应时间计算成员才可以
    if (!(measureNames[type] && getEntityProperty(this.entityType, measureNames[type][1]))) {
      try {
        measureNames[type] = this.getCalculatedMember(
          measureNames['CurrentPeriod'],
          type,
          this.calendarHierarchy.name
        )?.name
      } catch (err) {
        return null
      }
    }
    return measureNames[type]
  }

  override selectQuery(
    options: QueryOptions,
    indicator?: Indicator,
    measures?: Array<PeriodFunctions>,
    lookBack?: number
  ) {
    return this.queryIndicator(
      indicator ?? this.indicator,
      measures ?? this.get((state) => state.measures),
      lookBack ?? this.lookBack,
      options?.force
    )
  }

  timeRange2Slicer(timeRange: string[]) {
    return timeRange[0] === timeRange[1]
      ? {
          dimension: {
            dimension: this.calendar.name,
            hierarchy: this.calendarHierarchy.name
          },
          members: [{ key: timeRange[0] }]
        }
      : {
          dimension: {
            dimension: this.calendar.name,
            hierarchy: this.calendarHierarchy.name
          },
          members: timeRange.map((key) => ({ key })),
          operator: FilterOperator.BT
        }
  }
}

/**
 * Get calendar dimension by calendar field, or get the calednar level by timeGranularity
 * 
 * @param indicator 
 * @param entityType 
 * @param timeGranularity 
 * @returns 
 */
export function getIndicatorEntityCalendar(
  indicator: Indicator,
  entityType: EntityType,
  timeGranularity: TimeGranularity
) {
  if (indicator.calendar) {
    return getEntityCalendar(entityType, indicator.calendar, timeGranularity)
  }

  let dimension = null
  let hierarchy = null
  let level = null
  const calendarSemantic = mapTimeGranularitySemantic(timeGranularity)
  getEntityDimensions(entityType)
    .filter((property) => property.semantics?.semantic.startsWith(Semantics.Calendar))
    .reduce((acc, curr) => {
      if (acc) {
        return acc
      }

      const _hierarchy = curr.hierarchies?.find((_hierarchy) => {
        const _level = _hierarchy.levels.find((level) => level.semantics?.semantic === calendarSemantic)
        if (_level) {
          level = _level
          hierarchy = _hierarchy
          dimension = curr
          return true
        }

        return false
      })

      if (_hierarchy) {
        return curr
      }

      return null
    }, null)

  return {
    dimension,
    hierarchy,
    level
  }
}
