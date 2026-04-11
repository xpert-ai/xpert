import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
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
  readonly memories = input<any[]>()

  // States
  readonly expand = signal(false)

  toggleExand() {
    this.expand.update((state) => !state)
  }
}
