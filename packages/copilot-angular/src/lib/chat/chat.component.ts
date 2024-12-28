import { A11yModule } from '@angular/cdk/a11y'
import { CdkDragDrop } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { OverlayModule } from '@angular/cdk/overlay'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatSnackBar } from '@angular/material/snack-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import {
  AI_PROVIDERS,
  AiModelType,
  CopilotChatConversation,
  CopilotChatMessage,
  CopilotChatMessageRoleEnum,
  CopilotCommand,
  CopilotContextItem,
  SuggestionOutput,
  nonBlank
} from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  delay,
  distinctUntilChanged,
  filter,
  of,
  startWith,
  switchMap,
  tap,
  throttleTime
} from 'rxjs'
import { UserAvatarComponent } from '../common/avatar/avatar.component'
import { CopilotScrollBackComponent } from '../common/scroll'
import { NgmSearchComponent } from '../common/search/search.component'
import { provideFadeAnimation } from '../core/animations'
import { NgmHighlightDirective } from '../core/directives'
import { NgmCopilotEnableComponent } from '../enable/enable.component'
import { injectCommonCommands } from '../hooks/common'
import { AgentRecursionLimit, NgmCopilotEngineService, NgmCopilotService } from '../services/'
import { IUser, NgmCopilotChatMessage } from '../types'
import { CopilotAgentConfigComponent } from './agent-config/config.component'
import { CopilotAIMessageComponent } from './ai-message/ai-message.component'
import { CopilotChatTokenComponent } from './token/token.component'
import { PlaceholderMessages } from './types'

export const AUTO_SUGGESTION_DEBOUNCE_TIME = 1000
export const AUTO_SUGGESTION_STOP = ['\n', '.', ',', '@', '#']

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-copilot-chat',
  templateUrl: 'chat.component.html',
  styleUrls: ['chat.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TextFieldModule,
    OverlayModule,
    CdkListboxModule,
    CdkMenuModule,
    A11yModule,
    MatInputModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatListModule,
    TranslateModule,
    ScrollingModule,

    NgmSearchComponent,
    NgmHighlightDirective,

    CopilotChatTokenComponent,
    NgmCopilotEnableComponent,
    UserAvatarComponent,
    CopilotScrollBackComponent,
    CopilotAIMessageComponent,
    CopilotAgentConfigComponent
  ],
  host: {
    class: 'ngm-copilot-chat'
  },
  animations: [provideFadeAnimation('100ms')]
})
export class NgmCopilotChatComponent {
  CopilotChatMessageRoleEnum = CopilotChatMessageRoleEnum
  AgentRecursionLimit = AgentRecursionLimit

  readonly _snackBar = inject(MatSnackBar)
  private copilotService = inject(NgmCopilotService)
  readonly #copilotEngine?: NgmCopilotEngineService = inject(NgmCopilotEngineService, { optional: true })

  readonly copilotEngine$ = signal<NgmCopilotEngineService>(this.#copilotEngine)

  // Inputs
  readonly opened = model<boolean>()
  @Input() welcomeTitle: string
  @Input() welcomeSubTitle: string
  @Input() placeholder: string
  /**
   * @deprecated use aiAvatarTemplate
   */
  @Input() thinkingAvatar: string
  /**
   * @deprecated use aiAvatarTemplate
   */
  @Input() assistantAvatar: string

  /**
   * @deprecated use CopilotRole and Agent instead
   */
  @Input() get copilotEngine(): NgmCopilotEngineService {
    return this.copilotEngine$()
  }
  set copilotEngine(value) {
    this.copilotEngine$.set(value ?? this.#copilotEngine)
  }

  @Input() user: IUser

  readonly aiAvatarTemplate = input<TemplateRef<unknown>>()

  // Outputs
  @Output() conversationsChange = new EventEmitter()
  @Output() enableCopilot = new EventEmitter()

  // Children
  @ViewChild('chatsContent') chatsContent: ElementRef<HTMLDivElement>
  @ViewChild('scrollBack') scrollBack!: CopilotScrollBackComponent
  readonly commandsPanel = viewChild('commandsPanel', { read: ElementRef })
  // readonly routeTemplate = viewChild('routeTemplate', { read: TemplateRef })
  readonly userInput = viewChild('userInput', { read: ElementRef })

  // States
  get _placeholder() {
    return this.copilotEngine?.placeholder ?? this.placeholder
  }

  readonly _mockConversations: Array<CopilotChatConversation<NgmCopilotChatMessage>> = [
    {
      id: '',
      messages: PlaceholderMessages,
      type: 'free',
      command: null,
      status: 'completed'
    }
  ]

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly copilot = toSignal(this.copilotService.copilot$)
  readonly copilotEnabled = toSignal(this.copilotService.enabled$)
  readonly showTokenizer$ = computed(() => this.copilot()?.showTokenizer)
  // readonly #defaultModel = computed(() => this.copilot()?.defaultModel)
  readonly interactive = this.copilotEngine$().agentConfig.interactive
  readonly #predefinedModels = computed(() => AI_PROVIDERS[this.copilot()?.provider]?.models)
  readonly canListModels = computed(() => !!AI_PROVIDERS[this.copilot()?.provider]?.modelsUrl)
  readonly latestModels = signal<AiModelType[]>([])
  readonly conversations = computed<Array<CopilotChatConversation<NgmCopilotChatMessage>>>(() =>
    this.copilotEngine?.conversations()
  )
  readonly conversation = computed(() => this.copilotEngine?.conversation())
  readonly answering = computed(() => this.conversation()?.status === 'answering')
  readonly abortController = computed(() => this.conversation()?.abortController)
  // readonly isTools = toSignal(this.copilotService.isTools$)
  readonly roles = this.copilotService.allRoles
  readonly role = this.copilotService.role
  readonly roleDetail = this.copilotService.roleDetail

  // readonly #activatedPrompt = signal<CopilotContextItem | string>('')
  readonly refreshingModels = signal(false)

  /**
   * 当前 Asking prompt
   */
  public promptControl = new FormControl<string>('')
  readonly prompt = toSignal(this.promptControl.valueChanges.pipe(filter((value) => typeof value === 'string')), {
    initialValue: ''
  })

  readonly #promptWords = computed(() => this.prompt()?.split(' ') ?? [])
  readonly lastWord = computed(() => this.#promptWords()[this.#promptWords().length - 1])
  readonly #contextWord = computed(() =>
    this.#promptWords()
      .find((word) => word.startsWith('@'))
      ?.slice(1)
  )
  readonly contextSearch = computed(() => {
    const lastWord = this.lastWord()
    if (lastWord && lastWord.startsWith('@')) {
      return lastWord.slice(1)
    }
    return null
  })
  readonly isContextTrigger = computed(() => this.lastWord()?.startsWith('@'))
  readonly hasContextTrigger = computed(() => this.prompt()?.includes('@'))
  readonly beforeLastWord = computed(() => {
    const words = this.prompt()?.split(' ')
    return words.splice(0, words.length - 1).join(' ')
  })

  /**
   * The first word is a command
   */
  readonly commandWord = computed(() => {
    const firstWord = this.#promptWords().filter(nonBlank)[0]
    return firstWord?.startsWith('/') ? firstWord : null
  })

  readonly commandWithContext = computed(() => {
    const prompt = this.prompt()
    if (prompt && prompt.startsWith('/')) {
      const name = prompt.split(' ')[0]
      return this.copilotEngine.getCommandWithContext(name.slice(1))
    }
    return null
  })

  readonly command = computed(() => this.commandWithContext()?.command)
  readonly commandTitle = computed(() => this.command().description)
  readonly commandContext = computed(() => this.commandWithContext()?.context ?? this.copilotEngine.copilotContext)
  readonly context = signal<CopilotContextItem>(null)

  // Only command in prompt
  readonly onlyCommand = computed(() => {
    const prompt = this.prompt()
    if (prompt && prompt.startsWith('/')) {
      const command = prompt.split(' ')[0]
      if (command === prompt.trim()) {
        return command
      }
    }
    return null
  })

  readonly loadingContext$ = new BehaviorSubject(false)
  readonly contextItems = derivedAsync(() => {
    const context = this.commandContext()
    const hasContextTrigger = this.hasContextTrigger()
    const contextObservable = context?.getContextObservable()
    if (hasContextTrigger && contextObservable) {
      this.loadingContext$.next(true)
      return contextObservable.pipe(tap(() => this.loadingContext$.next(false)))
    }
    return null
  })

  readonly contextSearchWords = computed(() => this.contextSearch()?.toLowerCase().split('_'))

  readonly filteredContextItems = computed(() => {
    const isContextTrigger = this.isContextTrigger()
    const text = this.contextSearch()
    const items = this.contextItems()
    if (isContextTrigger) {
      if (text) {
        const words = text.toLowerCase().split('_')
        return items?.filter((item) =>
          words.length
            ? words.every((word) => item.key.toLowerCase().includes(word) || item.caption?.toLowerCase().includes(word))
            : true
        )
      }
      return items
    }
    return null
  })

  readonly contextMenuSearch = model<string>('')
  readonly filteredContextMenuItems = computed(() => {
    const text = this.contextMenuSearch()
    const items = this.contextItems()
    if (text) {
      const words = text.toLowerCase().split(' ')
      return items?.filter((item) =>
        words.length
          ? words.every((word) => item.key.toLowerCase().includes(word) || item.caption?.toLowerCase().includes(word))
          : true
      )
    }
    return items
  })

  readonly promptCompletion = signal<string>(null)

  readonly historyQuestions = signal<string[]>([])
  private readonly historyIndex = signal(-1)

  // Available models
  searchModel = new FormControl<string>('')
  readonly searchText = toSignal(this.searchModel.valueChanges.pipe(startWith('')), { initialValue: '' })
  readonly models = computed(() => {
    const text = this.searchText()?.toLowerCase()
    const models = this.latestModels()?.length ? this.latestModels() : this.#predefinedModels()
    return text ? models?.filter((item) => item.name.toLowerCase().includes(text)) : models
  })

  readonly commands = computed<Array<CopilotCommand & { example: string }>>(() => {
    if (this.copilotEngine?.commands) {
      const commands = []
      this.copilotEngine
        .commands()
        .filter((c) => !c.hidden)
        .sort((a, b) => (a.name > b.name ? 1 : a.name === b.name ? 0 : -1))
        .forEach((command) => {
          commands.push({
            ...command,
            prompt: `/${command.name} ${command.description}`
          })
        })
      return commands
    }
    return []
  })

  readonly filteredCommands = computed<Array<CopilotCommand & { example: string }>>(() => {
    const prompt = this.prompt()?.toLowerCase()

    if (prompt?.startsWith('/')) {
      const text = prompt.slice(1)
      return (
        this.commands()?.filter(
          (item) => item.name?.toLowerCase().includes(text) || item.alias?.toLowerCase()?.includes(text)
        ) ?? []
      )
    }

    return []
  })

  readonly suggestionsOpened$ = new BehaviorSubject(false)
  readonly #suggestionsOpened = toSignal(this.suggestionsOpened$.pipe(delay(100)), { initialValue: false })
  readonly messageCopied = signal<string[]>([])
  readonly editingMessageId = signal<string>(null)

  // readonly input = toSignal(
  //   this.promptControl.valueChanges.pipe(
  //     debounceTime(AUTO_SUGGESTION_DEBOUNCE_TIME),
  //     filter((text) => !AUTO_SUGGESTION_STOP.includes(text?.slice(-1))),
  //     map((text) => text.trim())
  //   )
  // )
  // readonly examplesRetriever = computed(() => this.command()?.examplesRetriever)
  // readonly examples = derivedAsync(() => {
  //   const examplesRetriever = this.examplesRetriever()
  //   const input = this.input()
  //   if (!examplesRetriever) {
  //     return null
  //   }
  //   return examplesRetriever.invoke(input).then((docs) =>
  //     docs.map((doc) => ({
  //       text: doc.metadata['input']
  //     }))
  //   )
  // })

  readonly commandsPanelOpen = signal(false)
  readonly focusCommand = signal('')
  readonly selectedRoles = computed(() => [this.copilotService.role()])

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  #clearCommands = injectCommonCommands(this.copilotEngine$)

  /**
  |--------------------------------------------------------------------------
  | Subscribers
  |--------------------------------------------------------------------------
  */
  private scrollSub = toObservable(this.conversations)
    .pipe(throttleTime(300))
    .subscribe((conversations) => {
      if (conversations.length && !this.scrollBack.visible()) {
        this.scrollBottom()
      }
    })

  private autocompleteSub = this.promptControl.valueChanges
    .pipe(
      debounceTime(AUTO_SUGGESTION_DEBOUNCE_TIME),
      filter((text) => !AUTO_SUGGESTION_STOP.includes(text.slice(-1))),
      switchMap((prompt) => {
        const onlyCommand = this.onlyCommand()
        const command = this.command()
        const commandWithContext = this.commandWithContext()
        return onlyCommand
          ? of(command?.description)
          : command?.suggestion
            ? this.copilotEngine.executeCommandSuggestion(prompt, { ...commandWithContext })
            : of(null)
      }),
      catchError(() => of(null))
    )
    .subscribe((output: SuggestionOutput) => {
      if (typeof output === 'string') {
        this.promptCompletion.set(output)
      } else if (output) {
        this.promptCompletion.set(output.input)
      } else {
        this.promptCompletion.set('')
      }
    })

  private roleSub = toObservable(this.copilotService.role)
    .pipe(distinctUntilChanged())
    .subscribe(() => {
      this.clear()
    })

  constructor() {
    effect(() => {
      if (this.opened()) {
        this.focus()
      }
    })
    
    effect(
      () => {
        this.answering() ? this.promptControl.disable() : this.promptControl.enable()
      },
      { allowSignalWrites: true }
    )

    // effect(
    //   () => {
    //     // this.selectedModel.set([this.#defaultModel()])
    //     // this.model = this.#defaultModel()
    //   },
    //   { allowSignalWrites: true }
    // )

    effect(
      async () => {
        const contextWord = this.#contextWord()
        const commandContext = this.commandContext()
        if (contextWord && commandContext) {
          const item = await commandContext.getContextItem(contextWord)
          // console.log(item)
          this.context.set(item)
        } else {
          this.context.set(null)
        }
      },
      { allowSignalWrites: true }
    )

    // effect(() => {
    //   console.log(`isContextTrigger:`, this.isContextTrigger(), this.filteredContextItems())
    // })
  }

  trackByKey(index: number, item) {
    return item?.key
  }

  // refreshModels() {
  //   if (this.refreshingModels()) {
  //     return
  //   }
  //   this.refreshingModels.set(true)
  //   this.copilotService.getModels().subscribe({
  //     next: (res) => {
  //       this.refreshingModels.set(false)
  //       this.latestModels.set(res.data.map((model) => ({ id: model.id, name: model.id })))
  //     },
  //     error: (error) => {
  //       this.refreshingModels.set(false)
  //       this._snackBar.open(error.message, 'Close', {
  //         duration: 5000
  //       })
  //     }
  //   })
  // }

  changeSelectedModel(values) {
    // this.model = values[0]
  }

  newChat() {
    this.clear()
  }

  async askCopilotStream(
    prompt: string,
    options: { command?: string; newConversation?: boolean; conversationId?: string } = {}
  ) {
    const { command, newConversation, conversationId } = options ?? {}
    // Reset history index
    this.historyIndex.set(-1)
    // Add to history
    if (prompt) {
      this.historyQuestions.set([prompt, ...this.historyQuestions()])
    }
    // Clear prompt in input
    this.promptControl.setValue('')

    // 由其他引擎接手处理
    if (this.copilotEngine) {
      try {
        const message = await this.copilotEngine$().chat(prompt, {
          command,
          newConversation,
          conversationId
        })

        // if (typeof message === 'string') {
        //   this.copilotEngine.upsertMessage({
        //     id: nanoid(),
        //     role: 'info',
        //     content: message
        //   })
        // } else if (message) {
        //   this.copilotEngine.upsertMessage(message)
        // }

        this.scrollBottom()
      } catch (err) {
        this.conversationsChange.emit(this.conversations)
      } finally {
        // this.answering.set(false)
      }
    }
  }

  stopGenerating() {
    this.abortController()?.abort()
    this.conversationsChange.emit(this.conversations)

    this.scrollBottom()
  }

  scrollBottom() {
    this.chatsContent.nativeElement.scrollTo({
      top: this.chatsContent.nativeElement.scrollHeight,
      left: 0,
      behavior: 'smooth'
    })
  }

  async send(text: string) {
    this.promptControl.setValue(text)
    // await this.askCopilot(this.prompt)
  }

  async run() {
    await navigator.clipboard.readText()
  }

  clear() {
    this.copilotEngine.clear()
    this.conversationsChange.emit(this.conversations)
  }

  onEnableCopilot() {
    this.enableCopilot.emit()
  }

  async addMessage(message: CopilotChatMessage) {
    this.copilotEngine.upsertMessage(message)
  }

  deleteMessage(message: CopilotChatMessage) {
    this.copilotEngine.deleteMessage(message)
    this.conversationsChange.emit(this.conversations)
  }

  async resubmitMessage(element: HTMLDivElement, id: string, message: CopilotChatMessage, content: string) {
    // Cancel the edit status of element
    this.cancelMessageContent(element)
    // Update messages in conversation
    this.copilotEngine.updateConversation(id, (conversation) => {
      const messages = conversation.messages
      const index = messages.findIndex((item) => item.id === message.id)
      if (index > -1) {
        // 删除答案
        if (messages[index + 1]?.role === CopilotChatMessageRoleEnum.Assistant) {
          messages.splice(index + 1, 1)
        }
        // 删除提问
        messages.splice(index, 1)
        if (!messages.filter((message) => message.role === CopilotChatMessageRoleEnum.User).length) {
          return null
        }
        return {
          ...conversation,
          messages: [...messages]
        }
      }
      return conversation
    })

    // Send new message
    await this.askCopilotStream(content)
  }

  /**
   * @deprecated regenerate method should in copilot engine service
   */
  async regenerate(message: CopilotChatMessage) {
    this.copilotEngine.updateLastConversation((conversation) => {
      const messages = conversation.messages
      const index = messages.findIndex((item) => item.id === message.id)
      messages.splice(index)
      return { ...conversation, messages: [...messages] }
    })
    await this.askCopilotStream(null, { conversationId: message.id })
  }

  isFoucs(target: HTMLDivElement | HTMLTextAreaElement) {
    return document.activeElement === target
  }

  _autocompleteDisplayWith(option: CopilotContextItem) {
    if (typeof option === 'string') {
      return option
    } else if (typeof option === 'object') {
      return [this.beforeLastWord(), `@${option.uKey}`].filter(Boolean).join(' ') + ' '
    }
    return null
  }
  autocompleteDisplayWith = this._autocompleteDisplayWith.bind(this)

  triggerFun(event: KeyboardEvent) {
    if ((event.isComposing || event.shiftKey) && event.key === 'Enter') {
      return
    }
    if (!this.#suggestionsOpened() && event.key === 'Enter') {
      setTimeout(() => {
        this.askCopilotStream(this.prompt().trim())
      })
      return
    }

    if (event.key === '/' || event.key === '@') {
      setTimeout(() => {
        this.commandsPanelOpen.set(true)
      })
      return
    }

    // Tab 键补全提示语
    if (event.key === 'Tab') {
      event.preventDefault()
      if (this.promptCompletion()) {
        this.promptControl.setValue(this.promptControl.value.trimEnd() + ' ' + this.promptCompletion())
      } else {
        // const activatedPrompt = this.#activatedPrompt()
        // if (this.isContextTrigger()) {
        //   let item: CopilotContextItem = null
        //   if (activatedPrompt && typeof activatedPrompt !== 'string') {
        //     item = activatedPrompt
        //   } else {
        //     item = this.filteredContextItems()[0]
        //   }
        //   if (item) {
        //     this.promptControl.setValue(this.beforeLastWord() + ' @' + item.uKey + ' ')
        //     this.context.set(item)
        //   }
        // } else if (typeof activatedPrompt === 'string') {
        //   this.promptControl.setValue(activatedPrompt)
        // } else if (this.filteredCommands()?.length) {
        //   this.promptControl.setValue(this.filteredCommands()[0] ? '/' + this.filteredCommands()[0].name + ' ' : null)
        // }
      }
    }

    // Reset completion
    this.promptCompletion.set(null)

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      if (this.commandsPanelOpen()) {
        this.commandsPanel().nativeElement.focus()
      } else {
        const historyQuestions = this.historyQuestions()
        if (historyQuestions.length) {
          if (event.key === 'ArrowUp' && this.historyIndex() < historyQuestions.length - 1) {
            this.historyIndex.set(this.historyIndex() + 1)
          } else if (event.key === 'ArrowDown' && this.historyIndex() > -1) {
            this.historyIndex.set(this.historyIndex() - 1)
          } else {
            return
          }
  
          this.promptControl.setValue(historyQuestions[this.historyIndex()] ?? '')
        }
      }
    }
  }

  /**
   * 响应 Commands panel 上的键盘事件
   */
  onSelectCommand(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === 'Tab') {
      this.selectCommand(this.focusCommand())

      this.userInput().nativeElement.focus()
    }
  }

  selectCommand(command: string) {
    const value = this.prompt().replace(new RegExp(this.lastWord() + '$'), command + ' ')
    this.promptControl.setValue(value)
    this.commandsPanelOpen.set(false)
  }

  dropCopilot(event: CdkDragDrop<any[], any[], any>) {
    if (this.copilotEngine) {
      this.copilotEngine.dropCopilot(event)
    }

    setTimeout(() => {
      this.scrollBottom()
    }, 300)
  }

  setRole(role: string) {
    this.copilotService.role.set(role)
  }

  switchRole() {
    const roles = this.roles()
    const index = roles.findIndex((role) => role.name === this.role()[0])
    const nextIndex = (index + 1) % roles.length
    this.copilotService.setRole(roles[nextIndex].name)
  }

  editMessageContent(id: string, element: HTMLDivElement) {
    this.editingMessageId.set(id)
    element.attributes.setNamedItem(document.createAttribute('contenteditable'))
    element.focus()
  }

  cancelMessageContent(element: HTMLDivElement) {
    this.editingMessageId.set(null)
    element.blur()
    element.attributes.removeNamedItem('contenteditable')
  }

  /**
   * Set context item by click
   * 
   * @param item Context item
   */
  setContext(item: CopilotContextItem) {
    const value = this.prompt().replace(new RegExp(this.lastWord() + '$'), `@${item.key}`)
    this.promptControl.setValue(value)
    this.context.set(item)
    this.commandsPanelOpen.set(false)
  }

  repleaceContext(orginal: string, target: CopilotContextItem) {
    const prompt = this.prompt()
    this.promptControl.setValue(prompt.split(`@${orginal} `).join(`@${target.uKey} `))
    this.context.set(target)
  }

  removeContext() {
    const context = this.context()
    if (context) {
      const prompt = this.prompt()
      this.promptControl.setValue(prompt.replace(`@${context.uKey}`, ''))
      this.context.set(null)
    }
  }

  focus(value?: string) {
    if (!this.prompt()) {
      this.promptControl.setValue(value)
    }
    // if (value) {
    //   this.autocompleteTrigger().openPanel()
    // }
    setTimeout(() => {
      this.userInput().nativeElement.focus()
    }, 100);
  }

  async continue(conversation: CopilotChatConversation) {
    await this.copilotEngine.continue(conversation)
  }

  async finish(conversation: CopilotChatConversation) {
    await this.copilotEngine.finish(conversation)
  }

  pickExample(text: string) {
    let prompt = this.commandWord()
    if (this.context()) {
      prompt += ` @${this.context().uKey}`
    }
    this.promptControl.setValue(`${prompt} ${text}`, { emitEvent: false })
    this.promptCompletion.set(null)
  }
}
