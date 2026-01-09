import { AfterViewInit, Component, Input, ViewContainerRef, effect, inject, input } from '@angular/core'
import { EchartsViewerComponent } from './echarts-viewer.component'

@Component({
  selector: 'chat-echarts-wrapper',
  standalone: true,
  template: '',
  styles: [`:host { display: block; min-width: 400px; width: 100%; }`]
})
export class EchartsWrapperComponent implements AfterViewInit {
  @Input() code = ''

  private viewContainerRef = inject(ViewContainerRef)

  ngAfterViewInit(): void {
    if (this.code) {
      try {
        const decoded = decodeURIComponent(this.code)
        const json = JSON.parse(decoded)
        const componentRef = this.viewContainerRef.createComponent(EchartsViewerComponent)
        componentRef.instance.options = json
      } catch (err) {
        console.error('Invalid echarts JSON', err)
      }
    }
  }
}
