import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { IStorageFile, uuid } from '@cloud/app/@core'
import { CopilotEnableModelComponent } from '@cloud/app/@shared/copilot'
import { AppService } from '@cloud/app/app.service'
import { OverlayAnimations } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ChatAttachmentsComponent } from '@cloud/app/@shared/chat'
import { ChatService } from '../chat.service'
import { XpertHomeService } from '../home.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TextFieldModule,
    CdkMenuModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    MatInputModule,
    MatTooltipModule,
    NgmCommonModule,
    CopilotEnableModelComponent,
    ChatAttachmentsComponent
  ],
  selector: 'chat-input',
  templateUrl: './chat-input.component.html',
  styleUrl: 'chat-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [...OverlayAnimations]
})
export class ChatInputComponent {
  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly appService = inject(AppService)
  readonly #router = inject(Router)

  // Inputs
  readonly disabled = input<boolean>()

  // Chirldren
  readonly attachTrigger = viewChild('attachTrigger', {read: CdkMenuTrigger})

  // States
  readonly promptControl = new FormControl<string>(null)
  readonly prompt = toSignal(this.promptControl.valueChanges)
  readonly answering = this.chatService.answering
  readonly xpert = this.chatService.xpert
  readonly canvasOpened = computed(() => this.homeService.canvasOpened()?.opened)

  readonly isComposing = signal(false)

  // Attachments
  readonly attachment = computed(() => this.xpert()?.features?.attachment)
  readonly attachments = model<{file?: File; url?: string; storageFile?: IStorageFile}[]>([])
  readonly url = model<string>(null)
  readonly files = computed(() => this.attachments()?.map(({storageFile}) => storageFile))

  constructor() {
    effect(() => {
      if (this.answering() || this.disabled()) {
        this.promptControl.disable()
      } else {
        this.promptControl.enable()
      }
    })
  }

  send() {
    this.ask(this.prompt().trim())
  }

  // askWebsocket() {
  //   const content = this.prompt().trim()
  //   const id = uuid()
  //   this.chatWebsocketService.appendMessage({
  //     id,
  //     role: 'user',
  //     content
  //   })
  //   this.chatWebsocketService.message(id, content)
  //   this.promptControl.setValue('')
  // }

  ask(content: string) {
    const id = uuid()
    // const content = this.prompt().trim()
    // this.answering.set(true)
    this.chatService.appendMessage({
      id,
      role: 'user',
      content,
      attachments: this.files()
    })
    this.promptControl.setValue('')

    // Send message
    this.chatService.chat({ id, content, files: this.files() })

    // Clear
    this.attachments.set([])
  }

  stopGenerating() {
    this.chatService.cancelMessage()
  }

  triggerFun(event: KeyboardEvent) {
    if ((event.isComposing || event.shiftKey) && event.key === 'Enter') {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const text = this.prompt()?.trim()
      if (text) {
        setTimeout(() => {
          this.ask(text)
        })
      }
      return
    }
  }

  navigateCopilot() {
    this.#router.navigate(['/settings/copilot'])
  }

  // Input method composition started
  onCompositionStart() {
    this.isComposing.set(true)
  }

  // Input method composition updated
  onCompositionUpdate(event: CompositionEvent) {
    // Update current value
  }

  // Input method composition ended
  onCompositionEnd(event: CompositionEvent) {
    this.isComposing.set(false)
  }

  toggleCanvas() {
    this.homeService.canvasOpened.update((state) =>
      state ? { ...state, opened: !state.opened } : { opened: true, type: 'Computer' }
    )
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files: File[] = Array.from(input.files);

    this.attachments.update((state) => [...state, ...files.map((file) => ({file}))])

    this.closeAttach()
  }

  createUrlFile() {
    this.attachments.update((state) => [...state, {url: this.url()}])
    this.url.set(null)
    this.closeAttach()
  }

  closeAttach() {
    this.attachTrigger().close()
  }
}
