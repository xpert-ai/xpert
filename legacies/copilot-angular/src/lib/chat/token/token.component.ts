import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'

/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-copilot-token',
  template: `<span
    class="bg-neutral-100 text-neutral-800 text-xs font-medium px-2.5 py-0.5 rounded dark:bg-neutral-700 dark:text-neutral-300"
    matTooltip="{{ 'PAC.Copilot.CharacterLength' | translate: { Default: 'Character length' } }}"
  >
    <span *ngIf="characterLength() >= 4000" class="inline-block w-2 h-2 bg-yellow-400 rounded-full"></span>
    <span *ngIf="characterLength() < 4000" class="inline-block w-2 h-2 bg-gray-300 rounded-full"></span>
    {{ characterLength() }}
  </span>`,
  styles: [
    `
      :host {
        display: inline-block;
      }
    `
  ],
  imports: [CommonModule, MatTooltipModule, TranslateModule],
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
