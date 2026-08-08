import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges
} from '@angular/core'
import { ECharts, EChartsOption, init } from 'echarts'

type EChartsTheme = string | Record<string, unknown>

/**
 * Small Cloud-owned ECharts adapter for the AI usage and knowledge graph views.
 *
 * This intentionally covers only the behavior used by Xpert, without bringing
 * the former BI chart framework back into the application.
 */
@Directive({
  selector: '[echarts]',
  standalone: true
})
export class EchartsDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() options?: EChartsOption | null
  @Input() theme?: EChartsTheme
  @Output() readonly chartClick = new EventEmitter<unknown>()

  private chart?: ECharts
  private resizeObserver?: ResizeObserver

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly zone: NgZone
  ) {}

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      this.chart = init(this.elementRef.nativeElement, this.theme)
      this.chart.on('click', (event) => {
        this.zone.run(() => this.chartClick.emit(event))
      })
      this.applyOptions()

      this.resizeObserver = new ResizeObserver(() => {
        this.chart?.resize()
      })
      this.resizeObserver.observe(this.elementRef.nativeElement)
    })
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.options && !changes.options.firstChange) {
      this.applyOptions()
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect()
    if (this.chart && !this.chart.isDisposed()) {
      this.chart.dispose()
    }
    this.chart = undefined
  }

  private applyOptions() {
    if (this.chart && this.options) {
      this.chart.setOption(this.options, { notMerge: true })
    }
  }
}
