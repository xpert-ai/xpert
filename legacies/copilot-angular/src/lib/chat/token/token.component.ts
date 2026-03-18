
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-copilot-token',
  template: `<span
      class="bg-neutral-100 text-neutral-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-neutral-700 dark:text-neutral-300"
      zTooltip="{{ 'PAC.Copilot.CharacterLength' | translate: { Default: 'Character length' } }}"
      >
      @if (characterLength() >= 4000) {
        <span class="inline-block w-2 h-2 bg-yellow-400 rounded-full"></span>
      }
      @if (characterLength() < 4000) {
        <span class="inline-block w-2 h-2 bg-components-card-bg rounded-full"></span>
      }
      {{ characterLength() }}
    </span>`,
  styles: [
    `
      :host {
        display: inline-block;
      }
    `
  ],
  imports: [...ZardTooltipImports, TranslateModule],
  host: {
    class: 'ngm-copilot-token'
  }
})
export class CopilotChatTokenComponent {
  readonly content = input<string | any>()

  readonly characterLength = computed(() => {
    return this.content()?.length ?? 0
  })
}
