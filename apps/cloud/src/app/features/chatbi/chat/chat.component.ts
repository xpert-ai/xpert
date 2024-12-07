import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  model,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { CopilotChatMessage } from '@metad/copilot'
import { NgmDisplayBehaviourComponent } from '@metad/ocap-angular/common'
import { DensityDirective } from '@metad/ocap-angular/core'
import { nonBlank, nonNullable } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { debounceTime, distinctUntilChanged, filter } from 'rxjs'
import { ChatbiAnswerComponent } from '../answer/answer.component'
import { ChatbiService } from '../chatbi.service'
import { injectExamplesAgent } from '../copilot'
import { ChatbiInputComponent } from '../input/input.component'
import { ChatLoadingComponent } from '../../../@shared/copilot'
import { AppService } from '../../../app.service'
import { UserAvatarComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    MarkdownModule,
    MatIconModule,
    MatTooltipModule,
    MatButtonModule,
    MatDividerModule,
    DensityDirective,
    NgmDisplayBehaviourComponent,
    UserAvatarComponent,

    ChatbiInputComponent,
    ChatbiAnswerComponent,
    ChatLoadingComponent
  ],
  selector: 'pac-chatbi-chat',
  templateUrl: 'chat.component.html',
  styleUrl: 'chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatbiChatComponent {
  readonly appService = inject(AppService)
  readonly translate = inject(TranslateService)
  readonly chatbiService = inject(ChatbiService)
  readonly examplesAgent = injectExamplesAgent()

  readonly chatContent = viewChild('chatContent', { read: ElementRef<HTMLDivElement> })

  readonly lang = this.appService.lang
  readonly examples = this.chatbiService.examples

  readonly cube = this.chatbiService.entity
  readonly entityType = this.chatbiService.entityType

  readonly prompt = model<string>(null)
  readonly conversation = this.chatbiService.conversation
  readonly createdBy = computed(() => this.conversation()?.createdBy)

  readonly examplesEmpty = computed(() => !this.examples()?.length)
  readonly examplesLoading = signal<boolean>(false)

  private scrollSub = toObservable(this.conversation)
    .pipe(filter(nonNullable), debounceTime(1000), takeUntilDestroyed())
    .subscribe(() => this.scrollBottom())

  private examplesSub = toObservable(this.chatbiService.context)
    .pipe(distinctUntilChanged(), filter(nonBlank), debounceTime(100), takeUntilDestroyed())
    .subscribe(() => {
      if (this.examplesEmpty()) {
        this.refresh()
      }
    })

  editQuestion(message: CopilotChatMessage) {
    this.prompt.set(message.content)
  }

  setExample(example: string) {
    this.prompt.set(example)
  }

  scrollBottom() {
    this.chatContent()?.nativeElement.scrollTo({
      top: this.chatContent().nativeElement.scrollHeight,
      left: 0,
      behavior: 'smooth'
    })
  }

  async refresh(prompt?: string) {
    this.examplesLoading.set(true)
    try {
      const results = await this.examplesAgent()?.invoke(
        {
          input: prompt ?? `give me 5 examples`,
          context: this.chatbiService.context()
        },
        this.chatbiService.conversationKey()
      )

      this.chatbiService.updateConversation((state) => ({
        ...state,
        examples: results?.examples || []
      }))

      this.examplesLoading.set(false)
    } catch (err) {
      console.error(err)
      this.examplesLoading.set(false)
    }
  }

  async changeBatch() {
    await this.refresh(`Change to another batch`)
  }
}
