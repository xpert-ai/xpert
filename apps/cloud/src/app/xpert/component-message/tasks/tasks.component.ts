import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { IXpertProjectTask, TMessageComponent } from '@cloud/app/@core'
import { XpertProjectTasksComponent } from '@cloud/app/@shared/xpert'
import { TranslateModule } from '@ngx-translate/core'
import { ChatService } from '../../chat.service'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, ...ZardTooltipImports, XpertProjectTasksComponent],
  selector: 'chat-component-message-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageTasksComponent {
  readonly chatService = inject(ChatService)

  // Inputs
  readonly data = input<TMessageComponent<{ tasks?: IXpertProjectTask[] }>>()

  // States
  readonly tasks = computed(() => this.data()?.tasks)
  readonly projectId = computed(() => this.chatService.project()?.id)
  readonly threadId = computed(() => this.chatService.conversation()?.threadId)
}
