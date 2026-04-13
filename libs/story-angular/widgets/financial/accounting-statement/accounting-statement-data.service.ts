import { Injectable, Optional } from '@angular/core'
import { NgmDSCoreService, NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { Indicator, IndicatorBusinessState, QueryReturn, SmartIndicatorDataService } from '@xpert-ai/ocap-core'
import { combineLatest } from 'rxjs'
import { distinctUntilChanged, map, pluck, tap } from 'rxjs/operators'
import { AccountingStatementOptions } from './types'

export interface AccountingStatementDataState extends IndicatorBusinessState {
  options: AccountingStatementOptions
  indicators: Array<Indicator>
}

@Injectable()
export class AccountingStatementDataService<T> extends SmartIndicatorDataService<T, AccountingStatementDataState> {

  get options() {
    return this.get((state) => state.options) as any
  }
  set options(options) {
    this.patchState({ options })
  }
  readonly _options$ = this.select((state) => state.options)

  get indicators() {
    return this.get((state) => state.indicators)
  }

  
  constructor(dsCoreService: NgmDSCoreService, @Optional() filterBarService?: NgmSmartFilterBarService) {
    super(dsCoreService, filterBarService)
  }
  
  onInit() {
    return combineLatest([
      super.onInit(),
      this._options$.pipe(
        pluck('indicators'),
        distinctUntilChanged(),
      ),
    ]).pipe(
      tap(([,indicatorList]) => {
        const indicators = indicatorList
          ?.filter((indicator) => !!indicator.id)
          .map((indicator) => {
            return this.getIndicator(indicator.id)
          })
        this.patchState({ indicators })
      })
    )
  }

  override selectQuery() {
    return combineLatest(
      this.indicators.map((indicator) => {
        return this.queryIndicator(
          indicator,
          this.options.measures.map((item) => item.name).filter(Boolean)
        )
      })
    ).pipe(map((data) => ({ data } as QueryReturn<T>)))
  }
}
