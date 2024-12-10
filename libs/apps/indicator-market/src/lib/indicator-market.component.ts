import { CdkDragDrop } from '@angular/cdk/drag-drop'
import { BreakpointObserver, Breakpoints, BreakpointState } from '@angular/cdk/layout'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostBinding,
  inject,
  Inject,
  LOCALE_ID,
  viewChild,
  ViewChild,
  ViewContainerRef
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet'
import { MatDatepicker } from '@angular/material/datepicker'
import { Router } from '@angular/router'
import { Store } from '@metad/cloud/state'
import { NgmDSCoreService, NgmLanguageEnum } from '@metad/ocap-angular/core'
import { TimeGranularity } from '@metad/ocap-core'
import { ComponentStore } from '@metad/store'
import { includes, some } from 'lodash-es'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { combineLatest, Observable } from 'rxjs'
import { distinctUntilChanged, map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { IndicatorDetailComponent } from './indicator-detail/indicator-detail.component'
import { IndicatorsStore } from './services/store'
import { IndicatorState, IndicatorTagEnum, LookbackLimit } from './types'
import { injectCopilotCommand } from '@metad/copilot-angular'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-indicator-market',
  templateUrl: 'indicator-market.component.html',
  styleUrls: [`indicator-market.component.scss`],
  providers: [IndicatorsStore],
})
export class IndicatoryMarketComponent extends ComponentStore<{ id?: string }> {
  TIME_GRANULARITY = TimeGranularity
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  eNgxFloatUiPlacements = NgxFloatUiPlacements
  IndicatorTagEnum = IndicatorTagEnum

  readonly router = inject(Router)

  @HostBinding('class.indicator-market-app') isIndicatoryMarketComponent = true
  @HostBinding('class.searching') searching = false

  @ViewChild('searchInput') searchInputRef: ElementRef
  readonly indicatorDetailComponent = viewChild(IndicatorDetailComponent)

  readonly tagType = this.indicatorsStore.tagType

  readonly indicators$ = this.indicatorsStore.indicators$
  readonly mediaMatcher$ = combineLatest(
    Object.keys(Breakpoints).map((name) => {
      return this.breakpointObserver
        .observe([Breakpoints[name]])
        .pipe(map((state: BreakpointState) => [name, state.matches]))
    })
  ).pipe(map((breakpoints) => breakpoints.filter((item) => item[1]).map((item) => item[0])))
  public readonly isMobile$ = this.mediaMatcher$.pipe(
    map((values) => some(['XSmall', 'Small', 'HandsetPortrait'], (el) => includes(values, el))),
    distinctUntilChanged(),
    shareReplay(1)
  )

  public readonly notMobile$ = this.isMobile$.pipe(map((result) => !result))
  readonly selected$ = this.indicatorsStore.currentIndicator
  readonly currentIndicatorIds$ = computed(() => [this.indicatorsStore.currentIndicator()])

  isShowModal = false
  private _bottomSheetRef: MatBottomSheetRef

  _currentDate = new Date()
  dateControl = new FormControl<Date>(this._currentDate)

  readonly queryParams = injectQueryParams()

  readonly timeGranularity = this.indicatorsStore.timeGranularity
  readonly lookBack = this.indicatorsStore.lookback
  readonly lookbackLimit = computed(() => {
    return LookbackLimit[this.timeGranularity()] ?? 100
  })
  readonly isEmpty = this.indicatorsStore.isEmpty

  /**
  |--------------------------------------------------------------------------
  | Copilot Commands
  |--------------------------------------------------------------------------
  */
  #analysis = injectCopilotCommand({
    name: 'analysis',
    description: 'Analysis the indicator data',
    systemPrompt: async () => {
      return `你是一名 BI 指标数据分析专家，请根据给出的指标数据进行分析，得出结论。
${this.indicatorDetailComponent()?.makeIndicatorDataPrompt()}
`
    },
    actions: [
    //   injectMakeCopilotActionable({
    //     name: 'report',
    //     description: 'Give user the analysis report',
    //     argumentAnnotations: [
    //       {
    //         name: 'result',
    //         type: 'string',
    //         description: 'The analysis result',
    //         required: true
    //       }
    //     ],
    //     implementation: async (result: string) => {

    //       return result
    //     }
    //   })
    ]
  })

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effects)
  |--------------------------------------------------------------------------
  */
  private _orgSub = this.store
    .selectOrganizationId()
    .pipe(takeUntilDestroyed())
    .subscribe((id) => {
      this.indicatorsStore.init()
      this.indicatorsStore.fetchAll()
      this.onLookback(this.lookBack())
    })

  constructor(
    private store: Store,
    private indicatorsStore: IndicatorsStore,
    private dsCoreService: NgmDSCoreService,
    private breakpointObserver: BreakpointObserver,
    @Inject(LOCALE_ID)
    private locale: string,
    private _bottomSheet: MatBottomSheet,
    private _viewContainerRef: ViewContainerRef
  ) {
    super({})
    // TODO 演示时间
    this.dsCoreService.setToday(this._currentDate)
    this.onLookback(this.lookBack())

    this.dateControl.valueChanges.subscribe((value) => {
      this.dsCoreService.setToday(value)
      this.indicatorsStore.resetData()
    })

    this.indicatorsStore.locale = this.locale

    effect(() => {
      if (!this.indicatorsStore.currentIndicator()) {
        if (this.queryParams()?.id) {
          this.indicatorsStore.currentIndicator.set(this.queryParams().id)
        } else if (this.indicatorsStore.firstIndicator()) {
          this.indicatorsStore.currentIndicator.set(this.indicatorsStore.firstIndicator().id)
        }
      }
    }, { allowSignalWrites: true })

    effect(() => {
      this.dsCoreService.setTimeGranularity(this.timeGranularity())
    }, { allowSignalWrites: true })
  }

  readonly openModal = this.effect((origin$: Observable<string>) => {
    return origin$.pipe(
      switchMap((id) => {
        return this.isMobile$.pipe(
          tap((isMobile) => {
            if (isMobile && id) {
              this._bottomSheetRef = this._bottomSheet.open(IndicatorDetailComponent, {
                panelClass: ['pac-indicator-market__detail-container'],
                viewContainerRef: this._viewContainerRef,
                data: { id }
              })
            } else {
              this._bottomSheetRef?.dismiss()
            }
          })
        )
      })
    )
  })

  trackBy(index: number, el) {
    return el
  }

  onSearch(event) {
    this.indicatorsStore.updateSearch(<string>event.target.value)
  }

  trackById(index, el) {
    return el.id
  }

  prevDatesFilter = (d: Date | null): boolean => {
    return d <= new Date()
  }

  chosenYearHandler(event: Date | null, datepicker: MatDatepicker<any>) {
    if (this.timeGranularity() === TimeGranularity.Year) {
      this.dateControl.setValue(event)
      datepicker.close()
    }
  }

  chosenMonthHandler(event, datepicker: MatDatepicker<any>) {
    if (this.timeGranularity() === TimeGranularity.Month || this.timeGranularity() === TimeGranularity.Quarter) {
      this.dateControl.setValue(event)
      datepicker.close()
    }
  }

  click(item: IndicatorState) {
    this.indicatorsStore.currentIndicator.set(item.id)
    this.openModal(item.id)
    this.router.navigate([], {
      queryParams: { id: item.id },
      queryParamsHandling: 'merge'
    })
  }

  onTimeGranularity(event: TimeGranularity) {
    this.indicatorsStore.resetData()
    this.indicatorsStore.updateTimeGranularity(event)
  }

  onLookback(event: number) {
    this.indicatorsStore.updateLookback(event)
  }

  toggleTag(event?: Event) {
    this.indicatorsStore.toggleTag()
  }

  refresh() {
    // 强制刷新指标数据
    this.indicatorsStore.refresh(true)
  }

  onSearchFocus(event) {
    this.searching = true
  }
  onSearchDone() {
    this.searching = false
    this.indicatorsStore.updateSearch('')
    this.searchInputRef.nativeElement.value = ''
  }

  dropOrder(event: CdkDragDrop<IndicatorState[]>) {
    this.indicatorsStore.order(event)
  }

  @HostBinding('class.reverse-semantic-color')
  public get reverse() {
    return this.indicatorsStore.currentLang() === NgmLanguageEnum.SimplifiedChinese
  }
}
