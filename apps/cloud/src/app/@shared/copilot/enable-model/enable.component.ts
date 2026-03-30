
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslatePipe } from '@metad/core'

/**
 * @deprecated use chatkit
 */
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

  // Inputs
  readonly enableModel = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly copilotEnabled = signal(false)
  readonly primaryModelEnabled = signal(false)

  readonly show = computed(() => (this.enableModel() && !this.primaryModelEnabled()) || !this.copilotEnabled())
}
