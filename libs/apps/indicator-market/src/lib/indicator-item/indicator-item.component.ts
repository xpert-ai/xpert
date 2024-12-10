import { Component, inject, input } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { EMPTY, distinctUntilChanged, filter, switchMap, tap } from 'rxjs'
import { IndicatorsStore } from '../services/store'
import { IndicatorState, IndicatorTagEnum, StatisticalType, Trend } from '../types'
import { IndicatorItemDataService } from './indicator-item.service'


/**
 * @deprecated use the individual `NgmIndicatorComponent` for indicator
 */
@Component({
  selector: 'pac-indicator-item',
  templateUrl: 'indicator-item.component.html',
  styleUrls: ['indicator-item.component.scss'],
  providers: [ IndicatorItemDataService ]
})
export class IndicatorItemComponent {
  statisticalType: StatisticalType = StatisticalType.CurrentPeriod
  TagEnum = IndicatorTagEnum
  TREND = Trend

  private readonly dataService = inject(IndicatorItemDataService)
  private readonly store = inject(IndicatorsStore)

  readonly indicator = input.required<IndicatorState>()
  readonly tag = input<IndicatorTagEnum>()

  readonly loading$ = this.dataService.loading$
  readonly indicator$ = toObservable(this.indicator)

  /**
   * Subscriptions
   */
  readonly #lookBackSub = toObservable(this.store.lookback)
    .pipe(
      switchMap((lookBack) => {
        let initialized = false
        return this.indicator$.pipe(
          distinctUntilChanged(),
          switchMap((indicator) => {
            if (indicator?.dataSettings && (!indicator.initialized || !initialized)) {
              this.dataService.patchState({
                indicatorId: indicator.id,
                lookBack
              })

              this.dataService.dataSettings = indicator.dataSettings
              initialized = true

              return this.dataService.onAfterServiceInit().pipe(tap(() => this.dataService.refresh()))
            }

            return EMPTY
          })
        )
      }),
      takeUntilDestroyed()
    )
    .subscribe(() => {
      //
    })

  readonly #indicatorResultSub = this.dataService
    .selectResult()
    .pipe(
      filter((result: any) => result.indicator?.id && result.indicator?.id === this.indicator()?.id),
      takeUntilDestroyed()
    )
    .subscribe((result: any) => {
      if (result?.error) {
        this.store.updateIndicator({
          id: result.indicator.id,
          changes: {
            initialized: true,
            loaded: true,
            error: result.error
          }
        })
      } else {
        this.store.updateIndicator({
          id: result.indicator.id,
          changes: {
            initialized: true,
            loaded: true,
            trends: result.trends,
            data: result.data,
            trend: result.trend,
            error: null
          }
        })
      }
    })

  // Response to global refresh event
  private refreshSub = this.store
    .onRefresh()
    .pipe(takeUntilDestroyed())
    .subscribe((force) => {
      this.dataService.refresh(force)
    })

  toggleTag(event) {
    event.stopPropagation()
    event.preventDefault()

    this.store.toggleTag()
  }
}
