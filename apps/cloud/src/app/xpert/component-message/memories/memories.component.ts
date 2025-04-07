import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MatTooltipModule],
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
