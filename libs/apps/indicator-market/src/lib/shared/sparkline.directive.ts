import {
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  runInInjectionContext
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TinyArea } from '@antv/g2plot/esm/plots/tiny-area'
import { Store } from '@metad/cloud/state'
import { TranslateService } from '@ngx-translate/core'
import { NgmLanguageEnum } from '@metad/ocap-angular/core'
import { IndicatorState, StatisticalType, Trend, TrendColor, TrendReverseColor } from '../types'


/**
 * @deprecated use the individual `NgmIndicatorComponent` for indicator
 */
@Directive({
  selector: '[pacSparkLine]'
})
export class AppSparkLineDirective {
  private elRef = inject(ElementRef)
  readonly destroyRef = inject(DestroyRef)
  readonly #injector = inject(Injector)
  readonly #store = inject(Store)
  readonly #translate = inject(TranslateService)

  readonly indicator = input.required<IndicatorState>()
  readonly statisticalType = input<StatisticalType>(StatisticalType.CurrentPeriod)

  readonly indicatorTrends = computed(() => this.indicator()?.trends)
  readonly primaryTheme$ = toSignal(this.#store.primaryTheme$)

  readonly config$ = computed(() => {
    const trends = this.indicatorTrends()
    const measureFilter = this.statisticalType()
    let data = []
    switch (measureFilter) {
      case StatisticalType.CurrentPeriod:
        data = trends?.map((y) => y['CURRENT']) || []
        break
      case StatisticalType.Accumulative:
        data = trends?.map((y) => y['YTD']) || []
        break
    }

    const color =
      this.#translate.currentLang === NgmLanguageEnum.SimplifiedChinese
        ? TrendReverseColor[Trend[this.indicator().trend]]
        : TrendColor[Trend[this.indicator().trend]]
    return {
      data,
      color
    }
  })

  constructor() {
    afterNextRender(() => {
      const tinyArea = new TinyArea(this.elRef.nativeElement, {
        animation: false,
        autoFit: true,
        data: [],
        smooth: false,
        line: {
          size: 2
        },
        tooltip: false
      })

      tinyArea.render()

      runInInjectionContext(this.#injector, () => {
        effect(() => {
          const { data, color } = this.config$()
          tinyArea.changeData(data)
          tinyArea.update({
            line: {
              color: color
            },
            areaStyle: {
              fill: `l(270) 0:${color}00 1:${color}${this.primaryTheme$() === 'dark' ? '' : '70'}`
            },
            annotations: [
              {
                type: 'line',
                start: ['min', 'mean'],
                end: ['max', 'mean'],
                // text: {
                //   content: '平均值',
                //   offsetY: -2,
                //   style: {
                //     textAlign: 'left',
                //     fontSize: 10,
                //     fill: 'rgba(44, 53, 66, 0.45)',
                //     textBaseline: 'bottom',
                //   },
                // },
                style: {
                  lineWidth: 2,
                  lineDash: [2, 2],
                  stroke: color
                }
              }
            ]
          })
        })
      })
    })
  }
}
