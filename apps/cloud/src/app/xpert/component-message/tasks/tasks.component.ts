import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { IXpertProjectTask, TMessageComponent } from '@cloud/app/@core'
import { XpertProjectTasksComponent } from '@cloud/app/@shared/xpert'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, MatTooltipModule, XpertProjectTasksComponent],
  selector: 'chat-component-message-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageTasksComponent {
  // Inputs
  readonly data = input<TMessageComponent<{ tasks: IXpertProjectTask[] }>>()

  // States
  readonly tasks = computed(() => this.data()?.tasks)
}
