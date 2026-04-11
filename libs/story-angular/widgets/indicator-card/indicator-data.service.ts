import { Injectable, Optional } from '@angular/core'
import { NgmDSCoreService, NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import {
  compact,
  Indicator,
  IndicatorBusinessState,
  isEmpty,
  PeriodFunctions,
  SmartIndicatorDataService,
} from '@xpert-ai/ocap-core'
import { BehaviorSubject, combineLatest, of } from 'rxjs'
import { combineLatestWith, filter, map, switchMap, tap } from 'rxjs/operators'
import { IndicatorOption } from './types'
import { nonNullable } from '@xpert-ai/core'

export interface IndicatorCardDataOptions extends IndicatorBusinessState {
  indicators: Array<IndicatorOption>
  disabledTrend: boolean
}

export interface IndicatorDataResult {
  data: unknown[]
  indicator: Indicator
}

/**
 * 主指标, 明细指标和主指标趋势的数据服务
 * * 主指标以 `SmartIndicatorDataService` 中的 Indicator 为准
 * * 明细指标, 本服务中的 `indicators` 属性, 初始化到 `subIndicators$` 属性中
 * * 趋势以主指标为准
 */
@Injectable()
export class IndicatorDataService extends SmartIndicatorDataService<
  {
    main: IndicatorDataResult
    subIndicators: IndicatorDataResult[]
    trend: IndicatorDataResult
  },
  IndicatorCardDataOptions
> {
  private DEFAULT_LOOKBACK = 12

  get disabledTrend() {
    return this.get((state) => state.disabledTrend)
  }

  public readonly subIndicators$ = new BehaviorSubject([])

  constructor(dsCoreService: NgmDSCoreService, @Optional() filterBarService?: NgmSmartFilterBarService) {
    super(dsCoreService, filterBarService)
  }

  override onInit() {
    return super.onInit().pipe(
      switchMap(() => this.select((state) => state.indicatorId).pipe(filter(Boolean))),
      combineLatestWith(this.select((state) => state.indicators)),
      tap(([, indicators]) => {
        this.subIndicators$.next(
          indicators
            ?.map((indicator) => {
              const _indicator = this.getIndicator(indicator.code)
              return _indicator
                ? {
                    ..._indicator,
                    ...indicator
                  }
                : null
            })
            .filter(nonNullable)
        )
      })
    )
  }

  override selectQuery() {
    const subIndicators = this.subIndicators$.value
    const q = [
      this.queryIndicator(this.indicator, [
        PeriodFunctions.CURRENT,
        PeriodFunctions.YTD,
        PeriodFunctions.YOY,
        PeriodFunctions.MOM
      ]),
      isEmpty(subIndicators)
        ? of([])
        : combineLatest(
            subIndicators.map((indicator) => {
              return this.queryIndicator(indicator, [
                PeriodFunctions.CURRENT,
                PeriodFunctions.YTD,
                PeriodFunctions.YOY,
                PeriodFunctions.MOM
              ])
            })
          )
    ]

    if (!this.disabledTrend) {
      q.push(this.queryIndicator(this.indicator, [PeriodFunctions.CURRENT], this.lookBack || this.DEFAULT_LOOKBACK))
    }

    return combineLatest(q).pipe(
      map(([main, subIndicators, trend]: any) => {
        const errors = [main.error]

        const statements = []
        statements.push(...(main.stats?.statements ?? []))
        subIndicators.forEach((result) => {
          errors.push(result.error)
          statements.push(...(result.stats?.statements ?? []))
        })

        errors.push(trend?.error)
        statements.push(...(trend?.stats.statements ?? []))

        const error = compact(errors).join('\n')

        return {
          error,
          data: [
            {
              main: {
                ...main,
                indicator: main.stats.indicator
              },
              subIndicators: subIndicators?.map((item) => ({
                ...item,
                indicator: item.stats.indicator
              })),
              trend: trend
                ? {
                    ...trend,
                    indicator: trend.stats.indicator
                  }
                : null
            }
          ],
          stats: {
            statements
          }
        }
      })
    )
  }
}
