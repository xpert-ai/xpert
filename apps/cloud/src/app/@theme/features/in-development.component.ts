import { Component, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSpinComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [TranslateModule, NgmSpinComponent],
  selector: 'pac-in-development',
  template: `<div class="w-full max-w-sm mx-auto shadow-2xl rounded-2xl overflow-hidden mb-10 bg-components-card-bg">
    <div class="flex items-center justify-start p-4 bg-background-default-subtle border-b border-text-warning">
      <i class="ri-lightbulb-flash-line text-lg text-text-warning"></i>
      <span class="ml-2 text-text-warning font-semibold">{{ feature() }}</span>
    </div>
    <div class="p-4 flex justify-start items-center gap-2">
      <ngm-spin small></ngm-spin>
      <p class="text-text-secondary text-sm">
        {{ 'PAC.Xpert.InDevelopment' | translate: { Default: 'This feature is in development' } }}...
      </p>
    </div>
  </div>`,
  styles: [``]
})
export class InDevelopmentComponent {
  readonly feature = input<string>()
}
