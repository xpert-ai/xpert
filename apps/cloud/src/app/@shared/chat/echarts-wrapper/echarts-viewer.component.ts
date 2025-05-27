// echarts-viewer.component.ts
import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, Input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { init } from 'echarts'
import { CopyComponent } from '../../common'

@Component({
  standalone: true,
  imports: [CommonModule, MatTooltipModule, TranslateModule, CopyComponent],
  selector: 'chat-echarts-viewer',
  template: `<div class="group/echarts relative my-4">
    <copy
      #copy
      class="absolute -top-2 right-2 opacity-30 group-hover/echarts:opacity-100"
      [content]="options"
      [matTooltip]="
        copy.copied()
          ? ('PAC.Xpert.Copied' | translate: { Default: 'Copied' })
          : ('PAC.Xpert.Copy' | translate: { Default: 'Copy' })
      "
      matTooltipPosition="above"
    />
    <div class="echarts-container" style="width: 100%; height: 400px;"></div>
  </div>`
})
export class EchartsViewerComponent implements AfterViewInit {
  @Input() options!: any

  constructor(private el: ElementRef) {}

  ngAfterViewInit() {
    const chart = init(this.el.nativeElement.querySelector('.echarts-container'))
    chart.setOption(this.options)
  }
}
