import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterModule } from '@angular/router'
import { TranslatePipe } from '@xpert-ai/headless-ui'
import { DefaultModelRole, injectCopilotServer } from '../../../@core'

@Component({
  standalone: true,
  selector: 'copilot-enable-model',
  templateUrl: './enable.component.html',
  styleUrls: ['./enable.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterModule],
  host: {
    '[class.active]': 'show()'
  }
})
export class CopilotEnableModelComponent {
  readonly #copilotServer = injectCopilotServer()

  // Inputs
  readonly enableModel = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly primaryCopilot = toSignal(this.#copilotServer.getDefaultModel(DefaultModelRole.Primary), {
    initialValue: null
  })
  readonly copilotEnabled = computed(() => !!this.primaryCopilot()?.copilotModel?.model)
  readonly primaryModelEnabled = computed(() => !!this.primaryCopilot()?.copilotModel?.model)

  readonly show = computed(() => (this.enableModel() && !this.primaryModelEnabled()) || !this.copilotEnabled())
}
