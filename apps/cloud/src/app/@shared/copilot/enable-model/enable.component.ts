import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterModule } from '@angular/router'
import { NgmCopilotService } from '@metad/copilot-angular'
import { TranslatePipe } from '@metad/core'

/**
 */
@Component({
  standalone: true,
  selector: 'copilot-enable-model',
  templateUrl: './enable.component.html',
  styleUrls: ['./enable.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, RouterModule],
  host: {
    '[class.active]': 'show()'
  }
})
export class CopilotEnableModelComponent {
  readonly copilotService = inject(NgmCopilotService, {optional: true})

  // Inputs
  readonly enableModel = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly copilotEnabled = this.copilotService ? toSignal(this.copilotService.enabled$) : signal(true)
  readonly primaryModelEnabled = this.copilotService ? computed(() => this.copilotService.copilot()?.copilotModel?.model) : signal(true)

  readonly show = computed(() => (this.enableModel() && !this.primaryModelEnabled()) || !this.copilotEnabled())
}
