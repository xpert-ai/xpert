import { inject, Injectable, Injector } from '@angular/core'
import { createCustomElement } from '@angular/elements'
import { EchartsWrapperComponent } from '../echarts-wrapper/echarts-wrapper.component'
import { MermaidWrapperComponent } from '../mermaid-wrapper/mermaid-wrapper.component'

/**
 * Init custom elements in markdown
 */
@Injectable({ providedIn: 'root' })
export class CustomElementsService {
  private _injector = inject(Injector)

  setupCustomElements() {
    const echartsElement = createCustomElement(EchartsWrapperComponent, {
      injector: this._injector
    })
    customElements.define('echarts-wrapper', echartsElement)

    const mermaidElement = createCustomElement(MermaidWrapperComponent, {
      injector: this._injector
    })
    customElements.define('mermaid-wrapper', mermaidElement)
  }
}
