import { AfterViewInit, Component, Input, ViewContainerRef, inject } from '@angular/core'
import { MermaidViewerComponent } from './mermaid-viewer.component'

@Component({
  selector: 'chat-mermaid-wrapper',
  standalone: true,
  template: '',
  styles: [`:host { display: block; width: 100%; }`]
})
export class MermaidWrapperComponent implements AfterViewInit {
  @Input() code = ''

  private viewContainerRef = inject(ViewContainerRef)

  ngAfterViewInit(): void {
    if (this.code) {
      try {
        const decoded = decodeURIComponent(this.code)
        const componentRef = this.viewContainerRef.createComponent(MermaidViewerComponent)
        componentRef.instance.code = decoded
      } catch (err) {
        console.error('Invalid mermaid code', err)
      }
    }
  }
}
