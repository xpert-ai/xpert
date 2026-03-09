import { Component, input } from '@angular/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [TranslateModule, NgmSpinComponent],
  selector: 'pac-in-development',
  template: `<div class="w-full max-w-sm mx-auto shadow-2xl rounded-2xl overflow-hidden mb-10 bg-components-card-bg">
  <div class="flex items-center justify-start p-4 bg-yellow-100 border-b border-yellow-400 dark:bg-yellow-800">
    <i class="ri-lightbulb-flash-line text-lg text-yellow-500"></i>
    <span class="ml-2 text-yellow-700 font-semibold dark:text-yellow-300">{{feature()}}</span>
  </div>
  <div class="p-4 flex justify-start items-center gap-2">
    <ngm-spin small></ngm-spin>
    <p class="text-gray-700 text-sm dark:text-zinc-300">
      {{ 'PAC.Xpert.InDevelopment' | translate: { Default: 'This feature is in development' } }}...
    </p>
  </div>
</div>`,
  styles: [``]
})
export class InDevelopmentComponent {
  readonly feature = input<string>()
}
