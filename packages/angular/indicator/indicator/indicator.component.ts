import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NgmIsNilPipe, NgmLanguageEnum } from '@metad/ocap-angular/core'
import { DataSettings, IndicatorTagEnum, QueryReturn, TimeGranularity } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { map, startWith } from 'rxjs'
import { NgmIndicatorService } from '../indicator.service'
import { NgmSparkLineDirective } from '../spark-line/spark-line.directive'
import { StatisticalType, Trend } from '../types'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-indicator',
  templateUrl: 'indicator.component.html',
  styleUrls: ['indicator.component.scss'],
  providers: [NgmIndicatorService],
  imports: [CommonModule, NgmSparkLineDirective, NgmIsNilPipe],
  host: {
    '[class.reverse-semantic-color]': 'reverseSemanticColor()'
  }
})
export class NgmIndicatorComponent {
  statisticalType: StatisticalType = StatisticalType.CurrentPeriod
  TREND = Trend
  TagEnum = IndicatorTagEnum

  readonly dataService = inject(NgmIndicatorService)
  readonly #translate = inject(TranslateService)

  // Inputs
  readonly dataSettings = input.required<DataSettings>()
  readonly indicatorCode = input.required<string>()
  readonly lookBack = input.required<number>()
  readonly primaryTheme = input<string>()
  readonly tagType = input<IndicatorTagEnum>(IndicatorTagEnum.MOM)
  readonly timeGranularity = input<TimeGranularity>(TimeGranularity.Day)

  // Outputs
  readonly toggleTag = output<void>()

  // States
  readonly initied = toSignal(
    this.dataService.onAfterServiceInit().pipe(
      map(() => true),
      startWith(false)
    )
  )
  readonly loading = toSignal(this.dataService.loading$)

  readonly indicator = computed(() => {
    const code = this.indicatorCode()
    if (code && this.initied()) {
      return this.dataService.getIndicator(code)
    }
    return null
  })

  readonly data = toSignal<
    QueryReturn<unknown> & {
      trend?: Trend
      trends?: Array<unknown>
      data: {
        CURRENT: number
        MOM: number
        YOY: number
      }
    }
  >(this.dataService.selectResult() as any)

  readonly main = computed(() => this.data()?.data)
  readonly trend = computed(() => this.data()?.trend)
  readonly trends = computed(() => this.data()?.trends)

  readonly currentLang = toSignal(
    this.#translate.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.#translate.currentLang)
    )
  )
  readonly reverseSemanticColor = computed(() => this.currentLang() === NgmLanguageEnum.SimplifiedChinese)

  constructor() {
    effect(() => {
      // console.log(this.indicator(), this.data())
    })

    effect(() => {
      if (this.dataSettings()) {
        this.dataService.dataSettings = this.dataSettings()
      }
    })

    effect(() => {
      if (this.timeGranularity()) {
        this.dataService.timeGranularity = this.timeGranularity()
      }
    })

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

  _toggleTag(event: Event) {
    event.stopPropagation()
    event.preventDefault()

    this.toggleTag.emit()
  }
}
