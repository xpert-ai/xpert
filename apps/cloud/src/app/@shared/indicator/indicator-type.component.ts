
import { Component, Input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IIndicator, IndicatorType } from '../../@core'

@Component({
  standalone: true,
  imports: [TranslateModule],
  selector: 'pac-indicator-type',
  template: `@if (indicator.type === IndicatorType.BASIC) {
  <div
    class="text-xs inline-flex items-center font-bold leading-sm uppercase px-3 py-1 bg-blue-100 text-blue-500 rounded-full"
    >
    {{ 'PAC.INDICATOR.Basic' | translate: { Default: 'Basic' } }}
  </div>
}
@if (indicator.type === IndicatorType.DERIVE) {
  <div
    class="text-xs inline-flex items-center font-bold leading-sm uppercase px-3 py-1 bg-green-200 text-green-700 rounded-full"
    >
    {{ 'PAC.INDICATOR.Derivative' | translate: { Default: 'Derivative' } }}
  </div>
}`,
  styles: [``]
})
export class IndicatorTypeComponent {
  IndicatorType = IndicatorType
  
  @Input() indicator: IIndicator
}
