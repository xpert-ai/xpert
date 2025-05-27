import { inject, Injectable, Injector } from '@angular/core'
import { createCustomElement } from '@angular/elements'
import { EchartsWrapperComponent } from '../echarts-wrapper/echarts-wrapper.component'

/**
 * Init custom echarts elements in markdown
 */
@Injectable({ providedIn: 'root' })
export class CustomElementsService {
  private _injector = inject(Injector)

  setupCustomElements() {
    const subscribeElement = createCustomElement(EchartsWrapperComponent, {
      injector: this._injector
    })
    customElements.define('echarts-wrapper', subscribeElement)
  }
}
