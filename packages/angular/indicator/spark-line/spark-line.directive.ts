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
import { TinyArea } from '@antv/g2plot/esm/plots/tiny-area'
import { NgmLanguageEnum } from '@metad/ocap-angular/core'
import { Indicator } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { StatisticalType, Trend, TrendColor, TrendReverseColor } from '../types'

@Directive({
  standalone: true,
  selector: '[ngmSparkLine]'
})
export class NgmSparkLineDirective {
  readonly #elementRef = inject(ElementRef)
  readonly destroyRef = inject(DestroyRef)
  readonly #injector = inject(Injector)
  readonly #translate = inject(TranslateService)

  readonly indicator = input.required<Indicator>()
  readonly trend = input<any>()
  readonly trends = input<any>()
  readonly statisticalType = input<StatisticalType>(StatisticalType.CurrentPeriod)
  readonly primaryTheme = input<string>()

  readonly config$ = computed(() => {
    const trends = this.trends()
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
        ? TrendReverseColor[Trend[this.trend()]]
        : TrendColor[Trend[this.trend()]]
    return {
      data,
      color
    }
  })

  constructor() {
    afterNextRender(() => {
      const tinyArea = new TinyArea(this.#elementRef.nativeElement, {
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
              fill: `l(270) 0:${color}00 1:${color}${this.primaryTheme() === 'dark' ? '' : '70'}`
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
