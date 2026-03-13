// echarts-viewer.component.ts
import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, Input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { init } from 'echarts'
import { CopyComponent } from '../../common'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [CommonModule, ...ZardTooltipImports, TranslateModule, CopyComponent],
  selector: 'chat-echarts-viewer',
  template: `<div class="group/echarts relative my-4">
    <copy
      #copy
      class="absolute -top-2 right-2 opacity-30 group-hover/echarts:opacity-100"
      [content]="options"
      [zTooltip]="
        copy.copied()
          ? ('PAC.Xpert.Copied' | translate: { Default: 'Copied' })
          : ('PAC.Xpert.Copy' | translate: { Default: 'Copy' })
      "
      zPosition="top"
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
