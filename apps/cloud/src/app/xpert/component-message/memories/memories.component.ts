import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TMessageComponent, TMessageContentMemory } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, ...ZardTooltipImports],
  selector: 'chat-component-memories',
  templateUrl: './memories.component.html',
  styleUrl: 'memories.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMemoriesComponent {
  // Inputs
  readonly message = input<TMessageComponent>()

  // States
  readonly expand = signal(false)

  readonly memories = computed(() => (<TMessageComponent<TMessageContentMemory>>this.message())?.data)

  toggleExand() {
    this.expand.update((state) => !state)
  }
}
