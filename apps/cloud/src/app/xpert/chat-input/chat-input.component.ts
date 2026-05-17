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
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  Attachment_Type_Options,
  AudioRecorderService,
  getErrorMessage,
  injectToastr,
  IStorageFile,
  Store,
  uuid,
  AiAssistantService
} from '@cloud/app/@core'
import { CopilotEnableModelComponent } from '@cloud/app/@shared/copilot'
import { AppService } from '@cloud/app/app.service'
import { OverlayAnimations } from '@xpert-ai/core'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { catchError, finalize, map, of, switchMap } from 'rxjs'
import {
  buildSlashOptions,
  buildTriggerOptions,
  ChatAttachmentsComponent,
  ChatComposerMenuComponent,
  ChatComposerSlashOption,
  ChatFollowUpsComponent,
  ChatRuntimeCapabilityKind,
  ChatRuntimeCapabilityOption,
  ChatSlashPaletteComponent,
  createChatCommandSource,
  findSlashOptionByInvocation,
  flattenSlashOptions,
  getBusyComposerFollowUpMode,
  getSelectedRuntimeCapabilityOptions,
  getSlashCommandActionRuntimeCapabilities,
  hasRuntimeCapabilitiesSelection,
  mergeRuntimeCapabilitiesSelections,
  normalizeChatRuntimeCapabilities,
  parseSlashInvocation,
  readFollowUpBehaviorStorageValue,
  renderSlashCommandTemplate,
  resolveSlashTrigger,
  runtimeCapabilityOptionFromCapability,
  setRuntimeCapabilitySelected,
  shouldSubmitRawSlashInvocation
} from '@cloud/app/@shared/chat'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { ChatService, PendingFollowUp } from '../chat.service'
import { XpertHomeService } from '../home.service'
import {
  getReferenceKey,
  getReferenceLabel,
  getReferenceSource,
  mergeReferences,
  XpertChatReference
} from '../../@shared/chat/references'
import {
  buildContextUsageTooltip,
  getHistoricalContextTokens,
  resolveContextUsage,
  toPositiveNumber
} from '../../@shared/chat/context/context-usage'
import type { ChatFollowUpRailItem } from '../../@shared/chat/follow-ups/follow-ups'
import type { ChatKitCommandSource, RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'

const LONG_TEXT_REFERENCE_THRESHOLD = 5000

type ComposerSelectionOffsets = {
  start: number
  end: number
}

type SendMetadata = {
  planMode?: boolean
  runtimeCapabilities?: RuntimeCapabilitiesSelection | null
  commandSource?: ChatKitCommandSource | null
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslateModule,
    ...ZardTooltipImports,
    ZardButtonComponent,
    ZardIconComponent,
    NgmCommonModule,
    CopilotEnableModelComponent,
    ChatAttachmentsComponent,
    ChatComposerMenuComponent,
    ChatFollowUpsComponent,
    ChatSlashPaletteComponent
  ],
  selector: 'xp-chat-input',
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
  readonly #assistantService = inject(AiAssistantService)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #audioRecorder = inject(AudioRecorderService)
  readonly #store = inject(Store)

  // Inputs
  readonly disabled = input<boolean>()

  // Outputs
  readonly asked = output<string>()

  // Children
  readonly canvasRef = viewChild('waveCanvas', { read: ElementRef })
  readonly userInputRef = viewChild('userInput', { read: ElementRef })

  // States
  readonly promptText = signal('')
  readonly draftPrompt = computed(() => this.promptText().trim())
  readonly answering = this.chatService.answering
  readonly pendingFollowUps = this.chatService.pendingFollowUps
  readonly followUpBehavior = signal<'queue' | 'steer'>(this.readPersistedFollowUpBehavior())
  readonly planModeEnabled = signal(false)
  readonly runtimeSelection = signal<RuntimeCapabilitiesSelection | null>(null)
  readonly runtimeSelectionOwnerId = signal<string | null>(null)
  readonly runtimeCapabilitiesLoading = signal(false)
  readonly slashRange = signal<ReturnType<typeof resolveSlashTrigger>>(null)
  readonly slashActiveIndex = signal(0)
  readonly expandedSlashGroups = signal<ChatRuntimeCapabilityKind[]>([])

  readonly xpert = this.chatService.xpert
  readonly conversation = this.chatService.conversation
  readonly canvasOpened = computed(() => this.homeService.canvasOpened()?.opened)
  readonly hasConversation = computed(() => !!this.chatService.conversation()?.id)
  readonly primaryAgent = computed(() => this.xpert()?.agent ?? this.conversation()?.xpert?.agent)
  readonly runtimeCapabilities = toSignal(
    toObservable(computed(() => this.xpert()?.id ?? null)).pipe(
      switchMap((xpertId) => {
        if (!xpertId) {
          return of(null)
        }

        this.runtimeCapabilitiesLoading.set(true)
        return this.#assistantService.getRuntimeCapabilities(xpertId).pipe(
          map((capabilities) => normalizeChatRuntimeCapabilities(capabilities)),
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of(null)
          }),
          finalize(() => this.runtimeCapabilitiesLoading.set(false))
        )
      })
    ),
    {
      initialValue: null
    }
  )

  readonly selectedRuntimeCapabilityOptions = computed(() =>
    getSelectedRuntimeCapabilityOptions(this.runtimeCapabilities(), this.runtimeSelection())
  )
  readonly hasRuntimeCapabilitySelection = computed(() => hasRuntimeCapabilitiesSelection(this.runtimeSelection()))
  readonly slashOptions = computed(() =>
    buildTriggerOptions(
      this.runtimeCapabilities()?.commands,
      this.slashRange(),
      this.runtimeCapabilities(),
      this.expandedSlashGroups(),
      this.runtimeSelection(),
      this.#translate.currentLang
    )
  )
  readonly visiblePaletteOptions = computed(() => (this.slashRange() ? this.slashOptions() : []))
  readonly visiblePaletteFlatOptions = computed(() => flattenSlashOptions(this.visiblePaletteOptions()))
  readonly showSlashPalette = computed(() => Boolean(this.slashRange()))

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
  readonly references = signal<XpertChatReference[]>([])
  readonly hasReferences = computed(() => this.references().length > 0)
  readonly canSend = computed(() => (!!this.draftPrompt() || this.hasReferences()) && !this.disabled())
  readonly showCopilotEnableModel = !this.chatService.isPublic()
  readonly referenceKey = getReferenceKey
  readonly referenceLabel = getReferenceLabel
  readonly referenceSource = getReferenceSource

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
  readonly attachments = this.chatService.attachments
  readonly recentAttachments = this.chatService.getRecentAttachmentsSignal()
  readonly url = model<string>(null)
  readonly files = computed(() =>
    (this.attachments() ?? [])
      .map(({ storageFile }) => storageFile)
      .filter((file): file is IStorageFile => Boolean(file))
  )

  constructor() {
    effect(() => this.#audioRecorder.canvasRef.set(this.canvasRef()))
    effect(() => this.#audioRecorder.xpert.set(this.xpert()))
    effect(() => {
      const speechText = this.#audioRecorder.text()
      if (speechText) {
        this.setComposerText(speechText, { caretOffset: speechText.length })
      }
    })
    effect(() => this.persistFollowUpBehavior(this.followUpBehavior()))
    effect(() => {
      const xpertId = this.xpert()?.id ?? null
      if (this.runtimeSelectionOwnerId() !== xpertId) {
        this.runtimeSelectionOwnerId.set(xpertId)
        this.runtimeSelection.set(null)
        this.closePalettes()
      }
    })
  }

  send() {
    if (this.executeSlashCommandFromDraft()) {
      return
    }

    const content = this.draftPrompt()
    if (!content && !this.hasReferences()) {
      return
    }

    this.ask(content ?? '')
  }

  ask(content: string, followUpBehavior: 'queue' | 'steer' = this.followUpBehavior(), metadata: SendMetadata = {}) {
    const references = this.references()
    if (!content && !references.length) {
      return
    }

    const runtimeCapabilities =
      metadata.runtimeCapabilities === undefined ? this.getRuntimeCapabilitiesForSubmit() : metadata.runtimeCapabilities
    const planMode = metadata.planMode ?? this.planModeEnabled()
    const id = uuid()
    this.chatService.sendMessage({
      id,
      content,
      references,
      followUpMode: followUpBehavior,
      ...(planMode ? { planMode: true } : {}),
      ...(runtimeCapabilities ? { runtimeCapabilities } : {}),
      ...(metadata.commandSource ? { commandSource: metadata.commandSource } : {}),
      files: this.files().map((file) => ({
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

    this.setComposerText('')
    this.attachments.set([])
    this.references.set([])
    this.runtimeSelection.set(null)
    this.closePalettes()

    this.asked.emit(content)
  }

  stopGenerating() {
    this.chatService.cancelMessage()
  }

  onComposerInput() {
    const element = this.getComposerElement()
    this.promptText.set(this.normalizeComposerText(element?.innerText ?? ''))
    this.updateSlashPalette()
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (event.isComposing || this.isComposing()) {
      return
    }

    if (this.showSlashPalette()) {
      if (this.handlePaletteKeydown(event)) {
        return
      }
    }

    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !this.promptText() &&
      this.selectedRuntimeCapabilityOptions().length
    ) {
      event.preventDefault()
      const option =
        event.key === 'Backspace'
          ? this.selectedRuntimeCapabilityOptions()[this.selectedRuntimeCapabilityOptions().length - 1]
          : this.selectedRuntimeCapabilityOptions()[0]
      this.removeRuntimeCapability(option)
      return
    }

    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    if (this.executeSlashCommandFromDraft()) {
      return
    }

    const text = this.draftPrompt()
    if (text || this.hasReferences()) {
      queueMicrotask(() => {
        this.ask(text ?? '', this.answering() ? getBusyComposerFollowUpMode(event) : this.followUpBehavior())
      })
    }
  }

  onComposerPaste(event: ClipboardEvent) {
    const clipboardData = event.clipboardData
    if (!clipboardData) {
      return
    }

    const imageFiles = Array.from(clipboardData.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (imageFiles.length) {
      event.preventDefault()
      this.addFiles(imageFiles)
      return
    }

    const pastedText = clipboardData.getData('text/plain')
    if (!pastedText) {
      return
    }

    event.preventDefault()
    if (pastedText.trim().length > LONG_TEXT_REFERENCE_THRESHOLD) {
      this.addReferences([
        {
          type: 'quote',
          source: this.#translate.instant('PAC.Chat.PastedText', { Default: 'Pasted text' }),
          text: pastedText
        }
      ])
      return
    }

    const selection = this.getComposerSelectionOffsets()
    this.replaceComposerRange(
      selection ?? { start: this.promptText().length, end: this.promptText().length },
      pastedText
    )
  }

  onCompositionStart() {
    this.isComposing.set(true)
  }

  onCompositionUpdate(event: CompositionEvent) {
    void event
  }

  onCompositionEnd(event: CompositionEvent) {
    void event
    this.isComposing.set(false)
    this.onComposerInput()
  }

  navigateCopilot() {
    this.#router.navigate(['/settings/copilot'])
  }

  toggleCanvas() {
    this.homeService.canvasOpened.update((state) =>
      state ? { ...state, opened: !state.opened } : { opened: true, type: 'Computer' }
    )
  }

  setPlanMode(enabled: boolean) {
    this.planModeEnabled.set(enabled)
    this.focusComposer()
  }

  setRuntimeSelection(selection: RuntimeCapabilitiesSelection | null) {
    this.runtimeSelection.set(selection)
    this.focusComposer()
  }

  removeRuntimeCapability(option: ChatRuntimeCapabilityOption) {
    this.runtimeSelection.set(setRuntimeCapabilitySelected(this.runtimeSelection(), option, false, option.workspaceId))
  }

  setFollowUpBehavior(behavior: 'queue' | 'steer') {
    this.followUpBehavior.set(behavior)
  }

  closeQueue() {
    this.followUpBehavior.set('steer')
    this.chatService.closeQueue()
  }

  turnOffFollowUpQueueing() {
    this.followUpBehavior.set('steer')
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

  editPendingFollowUp(item?: ChatFollowUpRailItem) {
    const content = (item?.content ?? item?.input ?? '').trim()
    if (!item || (!content && !item.references?.length)) {
      return
    }

    const pendingItem = item as PendingFollowUp
    this.followUpBehavior.set(item.mode)
    if (pendingItem.planMode) {
      this.planModeEnabled.set(true)
    }
    if (pendingItem.runtimeCapabilities) {
      this.runtimeSelection.set(pendingItem.runtimeCapabilities)
    }
    this.setComposerText(content, { caretOffset: content.length, focus: true })
    this.references.set(item.references ?? [])
    this.removePendingFollowUp(item.id)
  }

  clearPendingFollowUps() {
    this.chatService.clearPendingFollowUps()
  }

  addReferences(references: XpertChatReference[]) {
    if (!references.length) {
      return
    }

    this.references.update((current) => mergeReferences(current, references))
  }

  removeReference(reference: XpertChatReference) {
    const key = this.referenceKey(reference)
    this.references.update((current) => current.filter((item) => this.referenceKey(item) !== key))
  }

  choosePaletteOption(option: ChatComposerSlashOption) {
    if (option.type === 'capability' && option.capability) {
      this.runtimeSelection.set(
        setRuntimeCapabilitySelected(this.runtimeSelection(), option.capability, true, option.capability.workspaceId)
      )
      const slashRange = this.slashRange()
      if (slashRange) {
        this.replaceComposerRange(slashRange, '')
      }
      this.closePalettes()
      this.focusComposer()
      return
    }

    if (option.builtin?.group) {
      this.toggleSlashGroup(option.builtin.group)
      return
    }

    this.executeSlashOption(option, '', this.slashRange())
  }

  setSlashActiveIndex(index: number) {
    this.slashActiveIndex.set(index)
  }

  // Attachments
  fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    this.onFileDropped(event.files)
  }

  onFileDropped(event?: FileList | null) {
    this.addFiles(event ? Array.from(event) : [])
  }

  onAttachCreated(file: IStorageFile) {
    this.chatService.onAttachCreated(file)
  }

  onAttachDeleted(fileId: string) {
    this.chatService.onAttachDeleted(fileId)
  }

  addAttachment(file: IStorageFile) {
    this.attachments.update((state) => {
      const attachments = state ?? []
      if (!attachments.some((attachment) => attachment.storageFile?.id === file.id)) {
        if (attachments.length >= this.attachment_maxNum()) {
          this.#toastr.error('PAC.Chat.AttachmentsMaxNumExceeded', '', {
            Default: 'Attachments exceed the maximum number allowed.'
          })
          return attachments
        }
        return [...attachments, { storageFile: file }]
      }
      return attachments
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

  private addFiles(files: File[]) {
    if (!files.length) {
      return
    }

    const pendingFiles = [...files]
    this.attachments.update((state) => {
      const attachments = [...(state ?? [])]
      while (attachments.length <= this.attachment_maxNum() && pendingFiles.length > 0) {
        if (attachments.length >= this.attachment_maxNum()) {
          this.#toastr.error('PAC.Chat.AttachmentsMaxNumExceeded', '', {
            Default: 'Attachments exceed the maximum number allowed.'
          })
          return attachments
        }
        const file = pendingFiles.shift()
        if (!file) {
          continue
        }
        if (
          attachments.some(
            (attachment) => attachment.file?.name === file.name || attachment.storageFile?.originalName === file.name
          )
        ) {
          this.#toastr.error('PAC.Chat.AttachmentsAlreadyExists', '', { Default: 'Attachment already exists.' })
          continue
        }
        attachments.push({ file })
      }
      return attachments
    })
  }

  private handlePaletteKeydown(event: KeyboardEvent) {
    const options = this.visiblePaletteFlatOptions()
    if (event.key === 'Escape') {
      event.preventDefault()
      this.closePalettes()
      return true
    }

    if (event.key === 'ArrowDown' || event.key === 'Tab') {
      event.preventDefault()
      this.slashActiveIndex.set(options.length ? (this.slashActiveIndex() + 1) % options.length : 0)
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.slashActiveIndex.set(options.length ? (this.slashActiveIndex() - 1 + options.length) % options.length : 0)
      return true
    }

    if (event.key === 'Enter' && !event.shiftKey && options.length) {
      event.preventDefault()
      this.choosePaletteOption(options[Math.min(this.slashActiveIndex(), options.length - 1)])
      return true
    }

    return false
  }

  private executeSlashCommandFromDraft() {
    const invocation = parseSlashInvocation(this.promptText())
    if (!invocation) {
      return false
    }

    const option = findSlashOptionByInvocation(
      buildSlashOptions(
        this.runtimeCapabilities()?.commands,
        '',
        this.runtimeCapabilities(),
        [],
        undefined,
        this.#translate.currentLang
      ),
      invocation
    )
    if (!option) {
      return false
    }

    if (shouldSubmitRawSlashInvocation(option)) {
      return false
    }

    return this.executeSlashOption(option, invocation.args, {
      trigger: '/',
      start: 0,
      end: this.promptText().length,
      query: invocation.name
    })
  }

  private executeSlashOption(
    option: ChatComposerSlashOption,
    args: string,
    range: ReturnType<typeof resolveSlashTrigger>
  ) {
    if (option.disabled || option.disabledReason || option.disabledReasonKey) {
      return true
    }

    const commandSource = createChatCommandSource(option)
    if (option.builtin?.command === 'plan') {
      if (args) {
        this.ask(args, this.followUpBehavior(), {
          planMode: true,
          commandSource
        })
      } else {
        this.planModeEnabled.update((enabled) => !enabled)
        this.replaceComposerRange(range ?? { start: 0, end: this.promptText().length }, '')
        this.closePalettes()
      }
      return true
    }

    if (option.builtin?.group) {
      this.toggleSlashGroup(option.builtin.group)
      return true
    }

    const action = option.command?.action
    if (!action || action.type === 'client_action') {
      return true
    }

    const actionRuntimeCapabilities = getSlashCommandActionRuntimeCapabilities(action)
    if (actionRuntimeCapabilities) {
      this.runtimeSelection.set(mergeRuntimeCapabilitiesSelections(this.runtimeSelection(), actionRuntimeCapabilities))
    }

    if (action.type === 'insert_text' || action.type === 'insert_invocation') {
      this.replaceComposerRange(
        range ?? { start: 0, end: this.promptText().length },
        renderSlashCommandTemplate(action.template, args)
      )
      this.closePalettes()
      return true
    }

    if (action.type === 'submit_prompt') {
      this.ask(renderSlashCommandTemplate(action.template, args), this.followUpBehavior(), {
        runtimeCapabilities: this.getRuntimeCapabilitiesForSubmit(actionRuntimeCapabilities),
        commandSource
      })
      return true
    }

    if (action.type === 'select_capability') {
      const capability = runtimeCapabilityOptionFromCapability(this.runtimeCapabilities(), action.capability)
      if (capability) {
        this.runtimeSelection.set(
          setRuntimeCapabilitySelected(this.runtimeSelection(), capability, true, capability.workspaceId)
        )
      }
      this.replaceComposerRange(range ?? { start: 0, end: this.promptText().length }, '')
      this.closePalettes()
      return true
    }

    return true
  }

  private getRuntimeCapabilitiesForSubmit(extra?: RuntimeCapabilitiesSelection | null) {
    return mergeRuntimeCapabilitiesSelections(this.runtimeSelection(), extra)
  }

  private updateSlashPalette() {
    const selection = this.getComposerSelectionOffsets()
    const nextRange = resolveSlashTrigger(this.promptText(), selection?.start ?? this.promptText().length)
    const previousRange = this.slashRange()
    this.slashRange.set(nextRange)
    if (previousRange?.trigger !== nextRange?.trigger || previousRange?.query !== nextRange?.query) {
      this.slashActiveIndex.set(0)
      this.expandedSlashGroups.set([])
    }
  }

  private closePalettes() {
    this.slashRange.set(null)
    this.expandedSlashGroups.set([])
    this.slashActiveIndex.set(0)
  }

  private toggleSlashGroup(group: ChatRuntimeCapabilityKind) {
    this.expandedSlashGroups.update((groups) =>
      groups.includes(group) ? groups.filter((item) => item !== group) : [...groups, group]
    )
    this.slashActiveIndex.set(0)
  }

  private replaceComposerRange(range: ComposerSelectionOffsets, text: string) {
    const current = this.promptText()
    const start = Math.max(0, Math.min(range.start, current.length))
    const end = Math.max(start, Math.min(range.end, current.length))
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`
    this.setComposerText(next, { caretOffset: start + text.length, focus: true })
  }

  private setComposerText(text: string, options?: { caretOffset?: number; focus?: boolean }) {
    const normalized = text ?? ''
    this.promptText.set(normalized)
    const element = this.getComposerElement()
    if (element && this.normalizeComposerText(element.innerText) !== normalized) {
      element.innerText = normalized
    }

    if (options?.focus || options?.caretOffset !== undefined) {
      queueMicrotask(() => {
        if (options.focus) {
          this.focusComposer()
        }
        if (options.caretOffset !== undefined) {
          this.setComposerSelection(options.caretOffset, options.caretOffset)
        }
      })
    }
  }

  private focusComposer() {
    this.getComposerElement()?.focus()
  }

  private getComposerElement() {
    return this.userInputRef()?.nativeElement as HTMLElement | undefined
  }

  private normalizeComposerText(value: string) {
    return value
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n$/, '')
  }

  private getComposerSelectionOffsets(): ComposerSelectionOffsets | null {
    const element = this.getComposerElement()
    const selection = typeof window !== 'undefined' ? window.getSelection() : null
    if (!element || !selection || selection.rangeCount === 0) {
      return null
    }

    const range = selection.getRangeAt(0)
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
      return null
    }

    const startRange = range.cloneRange()
    startRange.selectNodeContents(element)
    startRange.setEnd(range.startContainer, range.startOffset)

    const endRange = range.cloneRange()
    endRange.selectNodeContents(element)
    endRange.setEnd(range.endContainer, range.endOffset)

    return {
      start: this.normalizeComposerText(startRange.toString()).length,
      end: this.normalizeComposerText(endRange.toString()).length
    }
  }

  private setComposerSelection(start: number, end: number) {
    const element = this.getComposerElement()
    const selection = typeof window !== 'undefined' ? window.getSelection() : null
    if (!element || !selection) {
      return
    }

    const range = document.createRange()
    const startPosition = this.findTextPosition(element, start)
    const endPosition = this.findTextPosition(element, end)
    range.setStart(startPosition.node, startPosition.offset)
    range.setEnd(endPosition.node, endPosition.offset)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  private findTextPosition(root: HTMLElement, offset: number) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let remaining = Math.max(0, offset)
    let node = walker.nextNode()
    while (node) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) {
        return { node, offset: remaining }
      }
      remaining -= length
      node = walker.nextNode()
    }

    if (!root.firstChild) {
      root.appendChild(document.createTextNode(''))
    }
    const fallbackNode = root.firstChild ?? root
    return {
      node: fallbackNode,
      offset: fallbackNode.textContent?.length ?? 0
    }
  }

  private getFollowUpStorageKey() {
    return `xpert:agent-chat:follow-up-behavior:${this.#store.organizationId ?? 'tenant'}:${this.#store.userId ?? 'anonymous'}`
  }

  private readPersistedFollowUpBehavior(): 'queue' | 'steer' {
    if (typeof localStorage === 'undefined') {
      return 'queue'
    }

    return readFollowUpBehaviorStorageValue(localStorage.getItem(this.getFollowUpStorageKey()))
  }

  private persistFollowUpBehavior(behavior: 'queue' | 'steer') {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(this.getFollowUpStorageKey(), behavior)
  }
}
