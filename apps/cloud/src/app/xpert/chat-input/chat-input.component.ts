import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ZardInputDirective, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { Router, RouterModule } from '@angular/router'
import {
  Attachment_Type_Options,
  AudioRecorderService,
  DateRelativePipe,
  injectToastr,
  IStorageFile,
  Store,
  uuid
} from '@cloud/app/@core'
import { CopilotEnableModelComponent } from '@cloud/app/@shared/copilot'
import { AppService } from '@cloud/app/app.service'
import { FileTypePipe, OverlayAnimations } from '@xpert-ai/core'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { startWith } from 'rxjs'
import { ChatAttachmentsComponent } from '@cloud/app/@shared/chat'
import { ChatService, PendingFollowUp } from '../chat.service'
import { XpertHomeService } from '../home.service'
import { FileIconComponent } from '@cloud/app/@shared/files'
import {
  buildContextUsageTooltip,
  getHistoricalContextTokens,
  resolveContextUsage,
  toPositiveNumber
} from '../../@shared/chat/context/context-usage'

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
    ZardInputDirective,
    ...ZardTooltipImports,
    NgmCommonModule,
    DateRelativePipe,
    CopilotEnableModelComponent,
    ChatAttachmentsComponent,
    FileIconComponent,
    FileTypePipe
  ],
  selector: 'chat-input',
  templateUrl: './chat-input.component.html',
  styleUrl: 'chat-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [...OverlayAnimations],
  providers: [AudioRecorderService]
})
export class ChatInputComponent {
  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly appService = inject(AppService)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()
  readonly #audioRecorder = inject(AudioRecorderService)
  readonly #store = inject(Store)

  // Inputs
  readonly disabled = input<boolean>()

  // Outputs
  readonly asked = output<string>()

  // Chirldren
  readonly attachTrigger = viewChild('attachTrigger', { read: CdkMenuTrigger })
  readonly canvasRef = viewChild('waveCanvas', { read: ElementRef })
  readonly userInputRef = viewChild('userInput', { read: ElementRef })

  // States
  readonly promptControl = new FormControl<string>(null)
  readonly prompt = toSignal(this.promptControl.valueChanges.pipe(startWith(this.promptControl.value ?? '')), {
    initialValue: this.promptControl.value ?? ''
  })
  readonly draftPrompt = computed(() => this.prompt()?.trim() ?? '')
  readonly answering = this.chatService.answering
  readonly pendingFollowUps = this.chatService.pendingFollowUps
  readonly followUpBehavior = signal<'queue' | 'steer'>(this.readPersistedFollowUpBehavior())
  readonly showFollowUpTray = computed(() => this.pendingFollowUps().length > 0)
  readonly xpert = this.chatService.xpert
  readonly conversation = this.chatService.conversation
  readonly canvasOpened = computed(() => this.homeService.canvasOpened()?.opened)
  readonly hasConversation = computed(() => !!this.chatService.conversation()?.id)
  readonly primaryAgent = computed(() => this.xpert()?.agent ?? this.conversation()?.xpert?.agent)
  readonly contextUsage = computed(() => {
    const agentKey = this.primaryAgent()?.key
    return agentKey ? this.chatService.contextUsageByAgentKey()[agentKey] : null
  })
  readonly contextWindowSize = computed(() => {
    const value =
      this.conversation()?.xpert?.copilotModel?.options?.context_size ??
      this.xpert()?.copilotModel?.options?.context_size
    const size = toPositiveNumber(value)
    return size > 0 ? size : null
  })
  readonly historicalContextTokens = computed(() => getHistoricalContextTokens(this.chatService.messages()))
  readonly resolvedContextUsage = computed(() =>
    resolveContextUsage({
      answering: this.answering(),
      realtimeUsage: this.contextUsage(),
      historicalTokens: this.historicalContextTokens()
    })
  )
  readonly contextTokensUsed = computed(() => this.resolvedContextUsage().usedTokens)
  readonly showContextUsage = computed(() => !!this.contextWindowSize() && this.contextTokensUsed() > 0)
  readonly contextUsageRatio = computed(() => {
    const totalTokens = this.contextTokensUsed()
    const contextWindowSize = this.contextWindowSize() ?? 0
    if (!contextWindowSize) {
      return 0
    }
    return Math.min(Math.max(totalTokens / contextWindowSize, 0), 1)
  })
  readonly contextUsagePercent = computed(() => Math.round(this.contextUsageRatio() * 100))
  readonly contextUsageRingStyle = computed(() => ({
    background: `conic-gradient(currentColor ${this.contextUsageRatio() * 360}deg, color-mix(in oklab, var(--ring) 24%, transparent) 0deg)`
  }))
  readonly contextUsageTooltip = computed(() =>
    buildContextUsageTooltip({
      usedTokens: this.contextTokensUsed(),
      contextWindowSize: this.contextWindowSize(),
      usage: this.resolvedContextUsage().source === 'realtime' ? this.contextUsage() : null
    })
  )

  readonly isComposing = signal(false)

  // Attachments
  readonly features = computed(() => this.xpert()?.features)
  readonly attachment = computed(() => this.features()?.attachment)
  readonly attachment_enabled = computed(() => {
    return !!this.chatService.project() || this.attachment()?.enabled
  })
  readonly attachment_maxNum = computed(() => this.attachment()?.maxNum ?? 10)
  readonly attachment_accept = computed(() => {
    if (this.chatService.project()) {
      return '*/*'
    }
    const fileTypes = this.attachment()?.fileTypes
    if (fileTypes) {
      return fileTypes
        .map((type) =>
          Attachment_Type_Options.find((_) => _.key === type)
            ?.value?.split(',')
            .map((t) => `.${t.trim()}`)
        )
        .flat()
        .join(',')
    }
    return '*/*'
  })

  readonly speechToText_enabled = computed(() => this.features()?.speechToText?.enabled)
  readonly attachments = this.chatService.attachments // model<{file?: File; url?: string; storageFile?: IStorageFile}[]>([])
  readonly recentAttachments = this.chatService.getRecentAttachmentsSignal()
  readonly url = model<string>(null)
  readonly files = computed(() => this.attachments()?.map(({ storageFile }) => storageFile))

  constructor() {
    effect(() => {
      if (this.disabled()) {
        this.promptControl.disable()
      } else {
        this.promptControl.enable()
      }
    })

    effect(() => this.#audioRecorder.canvasRef.set(this.canvasRef()))
    effect(() => this.#audioRecorder.xpert.set(this.xpert()))
    effect(() => this.promptControl.setValue(this.#audioRecorder.text()))
    effect(() => this.persistFollowUpBehavior(this.followUpBehavior()))
  }

  send() {
    const content = this.draftPrompt()
    if (!content) {
      return
    }

    this.ask(content)
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
    this.chatService.sendMessage({
      id,
      content,
      followUpMode: this.followUpBehavior(),
      files: this.files()?.map((file) => ({
        id: file.id,
        originalName: file.originalName,
        name: file.originalName,
        filePath: file.file,
        fileUrl: file.url,
        mimeType: file.mimetype,
        size: file.size,
        extension: file.originalName.split('.').pop()
      }))
    })

    this.promptControl.setValue('')

    // Clear
    this.attachments.set([])

    this.asked.emit(content)
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
      const text = this.draftPrompt()
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
    void event
    // Update current value
  }

  // Input method composition ended
  onCompositionEnd(event: CompositionEvent) {
    void event
    this.isComposing.set(false)
  }

  toggleCanvas() {
    this.homeService.canvasOpened.update((state) =>
      state ? { ...state, opened: !state.opened } : { opened: true, type: 'Computer' }
    )
  }

  setFollowUpBehavior(behavior: 'queue' | 'steer') {
    this.followUpBehavior.set(behavior)
  }

  closeQueue() {
    this.followUpBehavior.set('steer')
    this.chatService.closeQueue()
  }

  removePendingFollowUp(id?: string) {
    if (!id) {
      return
    }

    this.chatService.removePendingFollowUp(id)
  }

  steerPendingFollowUp(id?: string) {
    if (!id) {
      return
    }

    this.chatService.steerPendingFollowUp(id)
  }

  updatePendingFollowUp(item: PendingFollowUp) {
    this.chatService.updatePendingFollowUp(item)
  }

  editPendingFollowUp(item?: { id?: string; content: string; mode: 'queue' | 'steer' }) {
    if (!item?.content) {
      return
    }

    this.followUpBehavior.set(item.mode)
    this.promptControl.setValue(item.content)
    this.removePendingFollowUp(item.id)

    queueMicrotask(() => {
      const textarea = this.userInputRef()?.nativeElement as HTMLTextAreaElement | undefined
      textarea?.focus()
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
    })
  }

  clearPendingFollowUps() {
    this.chatService.clearPendingFollowUps()
  }

  // Attachments
  fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    this.onFileDropped(event.files)
  }
  onFileDropped(event: FileList) {
    const filesArray = Array.from(event)
    this.attachments.update((state) => {
      while (state.length <= this.attachment_maxNum() && filesArray.length > 0) {
        if (state.length >= this.attachment_maxNum()) {
          this.#toastr.error('PAC.Chat.AttachmentsMaxNumExceeded', '', {
            Default: 'Attachments exceed the maximum number allowed.'
          })
          return [...state]
        }
        const file = filesArray.shift()
        if (state.some((_) => _.file.name === file.name)) {
          this.#toastr.error('PAC.Chat.AttachmentsAlreadyExists', '', { Default: 'Attachment already exists.' })
          continue
        }
        state.push({ file })
      }
      return [...state]
    })
  }
  onAttachCreated(file: IStorageFile) {
    this.chatService.onAttachCreated(file)
  }
  onAttachDeleted(fileId: string) {
    this.chatService.onAttachDeleted(fileId)
  }
  addAttachment(file: IStorageFile) {
    this.attachments.update((state) => {
      if (!state?.some((attachment) => attachment.storageFile?.id === file.id)) {
        if (state.length >= this.attachment_maxNum()) {
          this.#toastr.error('PAC.Chat.AttachmentsMaxNumExceeded', '', {
            Default: 'Attachments exceed the maximum number allowed.'
          })
          return state
        }
        return [...state, { storageFile: file }]
      }
      return state
    })
  }

  // Speech to Text
  readonly speeching = this.#audioRecorder.speeching
  readonly isRecording = this.#audioRecorder.isRecording
  readonly isConverting = this.#audioRecorder.isConverting
  readonly recordTimes = this.#audioRecorder.recordTimes
  async startRecording() {
    await this.#audioRecorder.startRecording()
  }
  stopRecording() {
    this.#audioRecorder.stopRecording()
  }

  private getFollowUpStorageKey() {
    return `xpert:agent-chat:follow-up-behavior:${this.#store.organizationId ?? 'tenant'}:${this.#store.userId ?? 'anonymous'}`
  }

  private readPersistedFollowUpBehavior(): 'queue' | 'steer' {
    if (typeof localStorage === 'undefined') {
      return 'steer'
    }

    return localStorage.getItem(this.getFollowUpStorageKey()) === 'queue' ? 'queue' : 'steer'
  }

  private persistFollowUpBehavior(behavior: 'queue' | 'steer') {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(this.getFollowUpStorageKey(), behavior)
  }
}
