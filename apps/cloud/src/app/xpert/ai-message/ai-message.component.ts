import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { nonNullable, stringifyMessageContent } from '@xpert-ai/copilot'
import { ListHeightStaggerAnimation } from '@xpert-ai/core'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { omit } from '@xpert-ai/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { filter, map, shareReplay, switchMap, tap } from 'rxjs'
import {
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  ChatMessageStepCategory,
  getErrorMessage,
  IChatMessage,
  injectToastr,
  SynthesizeService,
  TMessageContentComplex,
  TMessageContentReasoning,
  TtsStreamPlayerService,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatMessageExecutionComponent, ChatMessageExecutionPanelComponent } from '../../@shared/chat'
import { CopyComponent } from '../../@shared/common'
import { ChatService } from '../chat.service'
import { XpertHomeService } from '../home.service'
import { ChatThoughtComponent } from '../thought/thought.component'
import { TCopilotChatMessage } from '../types'
import { ChatMessageContentComponent } from './content/content.component'
import { ChatMessageAvatarComponent } from './avatar/avatar.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import {
  AgentRunEntry,
  AgentRunEvent,
  AgentRunRenderNode,
  AgentRunRenderUnit,
  buildAgentRunRenderTree,
  getAgentNodeUnits,
  getAgentRunCounts,
  getAgentRunDuration,
  isFailedRunStatus,
  isRunningRunStatus,
  normalizeRunStatus
} from './agent-run-tree'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    MarkdownModule,
    ...ZardTooltipImports,
    NgmCommonModule,
    EmojiAvatarComponent,
    ChatMessageExecutionComponent,
    CopyComponent,
    ChatMessageContentComponent,
    ChatThoughtComponent,
    ChatMessageAvatarComponent
  ],
  selector: 'pac-ai-message',
  templateUrl: './ai-message.component.html',
  styleUrl: 'ai-message.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [ListHeightStaggerAnimation],
  providers: [SynthesizeService, TtsStreamPlayerService],
  host: {
    '[class.busy]': 'busy()'
  }
})
export class ChatAiMessageComponent {
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum
  eChatMessageStepCategory = ChatMessageStepCategory

  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly #toastr = injectToastr()
  readonly #dialog = inject(Dialog)
  readonly #synthesizeService = inject(SynthesizeService)
  readonly #translate = inject(TranslateService)

  // Inputs
  readonly message = input<TCopilotChatMessage>()
  readonly showExecution = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly xpert = this.chatService.xpert
  readonly project = this.chatService.project
  readonly avatar = computed(() => (this.xpert() ? this.xpert().avatar : this.project()?.avatar))
  readonly title = computed(() => (this.xpert() ? this.xpert().title || this.xpert().name : this.project()?.name))
  readonly agents = computed(
    () =>
      this.xpert()?.agents?.reduce((acc, agent) => {
        acc[agent.key] = agent
        return acc
      }, {}) ?? {}
  )
  readonly features = computed(() => this.xpert()?.features)
  readonly textToSpeech_enabled = computed(() => this.features()?.textToSpeech?.enabled)
  readonly feedbacks = this.chatService.feedbacks
  readonly executionId = computed(() => this.message()?.executionId)
  readonly status = computed(() => this.message()?.status)
  readonly busy = computed(
    () => this.chatService.answering() && ['thinking', 'reasoning', 'answering'].includes(this.status())
  )
  readonly answering = computed(() => this.chatService.answering() && ['thinking', 'answering'].includes(this.status()))
  readonly canRetry = computed(() => !!this.message()?.id && !this.chatService.answering())
  readonly feedbackReady = computed(() => {
    const status = this.status() as XpertAgentExecutionStatusEnum | string
    const endedStatuses = new Set<XpertAgentExecutionStatusEnum | string>([
      XpertAgentExecutionStatusEnum.SUCCESS,
      XpertAgentExecutionStatusEnum.ERROR,
      XpertAgentExecutionStatusEnum.TIMEOUT,
      XpertAgentExecutionStatusEnum.INTERRUPTED,
      'aborted'
    ])
    return !this.answering() && endedStatuses.has(status)
  })

  readonly #contentStr = computed(() => {
    const content = this.message()?.content
    if (typeof content === 'string') {
      const count = (content.match(/```/g) || []).length
      if (count % 2 === 0) {
        return content
      } else {
        return content + '\n```\n'
      }
    }
    return ''
  })

  readonly contentStr = computed(() => {
    const content = this.#contentStr()
    // if (['thinking', 'answering'].includes(this.status()) && this.answering()) {
    //   return content + '<span class="thinking-placeholder"></span>'
    // }
    return content
  })

  readonly contents = computed(() => {
    const contents = this.message()?.content
    if (Array.isArray(contents)) {
      return contents
    }
    return null
  })

  readonly contentString = computed(() => stringifyMessageContent(this.message().content))
  readonly renderTree = computed(() => buildAgentRunRenderTree(this.message()))

  readonly executings = computed(() =>
    this.message().executions?.filter((_) => _.status === XpertAgentExecutionStatusEnum.RUNNING)
  )

  readonly expandExecutions = signal(false)
  readonly loadingExecutions = signal(false)

  readonly executions$ = toObservable(this.executionId).pipe(
    filter(nonNullable),
    tap(() => this.loadingExecutions.set(true)),
    switchMap((id) => this.agentExecutionService.getOneLog(id)),
    tap(() => this.loadingExecutions.set(false)),
    map((execution) => {
      const executions = []
      execution.subExecutions
        ?.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach((_) => executions.push(_))
      executions.push(omit(execution, 'subExecutions'))
      return executions
    }),
    shareReplay(1)
  )

  // Reasoning
  readonly reasoning = computed(() => {
    const tree = this.renderTree()
    return tree.hasAgentRuns ? tree.rootReasoning : this.message().reasoning
  })

  // Steps
  readonly #events = computed(() => {
    const tree = this.renderTree()
    return tree.hasAgentRuns ? tree.rootEvents : this.message().events
  })
  readonly lastStep = computed(() =>
    this.canvasMessageId() !== this.message().id && this.#events() ? this.#events()[this.#events().length - 1] : null
  )
  readonly events = computed(() => {
    if (this.expandSteps()) {
      return this.#events()
    } else {
      return [this.lastStep()]
    }
  })
  readonly expandSteps = signal(false)
  readonly canvasMessageId = computed(
    () => this.homeService.canvasOpened()?.type === 'Computer' && this.homeService.canvasOpened()?.messageId
  )
  readonly canvasType = computed(() => this.homeService.canvasOpened()?.type)

  readonly collapseMessages = model<Record<string, boolean>>({})
  readonly collapseAgentRuns = model<Record<string, boolean>>({})

  constructor() {
    effect(() => {
      // console.log(`Message status:`, this.status(), this.answering())
    })
  }

  updateCollapse(id: string, status: boolean) {
    this.collapseMessages.update((state) => ({ ...state, [id]: status }))
    this.collapseMessages.update((state) => ({ ...state, [id]: status }))
  }

  trackAgentRenderUnit(index: number, unit: AgentRunRenderUnit) {
    return unit.type === 'agent' ? `agent-${unit.node.id}` : `entry-${unit.entry.source}-${unit.entry.index}-${index}`
  }

  agentNodeUnits(node: AgentRunRenderNode) {
    return getAgentNodeUnits(node)
  }

  entryContent(entry: AgentRunEntry): TMessageContentComplex {
    return typeof entry.item === 'string'
      ? ({
          type: 'text',
          text: entry.item
        } as TMessageContentComplex)
      : (entry.item as TMessageContentComplex)
  }

  previousEntryContent(units: AgentRunRenderUnit[], index: number) {
    for (let i = index - 1; i >= 0; i--) {
      const unit = units[i]
      if (unit.type === 'entry' && unit.entry.source === 'content') {
        return this.entryContent(unit.entry)
      }
    }
    return null
  }

  entryContentId(entry: AgentRunEntry) {
    const item = entry.item
    return typeof item === 'string' ? null : item.id
  }

  isAgentRunExpanded(node: AgentRunRenderNode, hasFollowingItem: boolean) {
    const state = this.collapseAgentRuns()[node.id]
    if (typeof state === 'boolean') {
      return !state
    }
    return isRunningRunStatus(node.info.status) || !hasFollowingItem
  }

  toggleAgentRun(node: AgentRunRenderNode, hasFollowingItem: boolean) {
    this.collapseAgentRuns.update((state) => ({
      ...state,
      [node.id]: this.isAgentRunExpanded(node, hasFollowingItem)
    }))
  }

  agentRunTitle(node: AgentRunRenderNode) {
    const key = node.info.agentKey
    const agent = key ? this.agents()[key] : null
    return agent?.title || agent?.name || key || node.info.title || node.info.xpertName || 'Agent'
  }

  agentRunDuration(node: AgentRunRenderNode) {
    const duration = getAgentRunDuration(node.info)
    return duration === null ? null : this.formatDuration(duration)
  }

  agentRunStatusIcon(node: AgentRunRenderNode) {
    const status = normalizeRunStatus(node.info.status)
    if (status === XpertAgentExecutionStatusEnum.RUNNING) {
      return 'ri-loader-2-line animate-spin text-primary-500'
    }
    if (status === XpertAgentExecutionStatusEnum.SUCCESS) {
      return 'ri-checkbox-circle-line text-text-success'
    }
    if (status === XpertAgentExecutionStatusEnum.PENDING && getAgentRunCounts(node).text > 0) {
      return 'ri-checkbox-circle-line text-text-success'
    }
    if (isFailedRunStatus(status)) {
      return 'ri-close-circle-line text-text-destructive'
    }
    return 'ri-time-line text-text-tertiary'
  }

  agentRunStatusLabel(node: AgentRunRenderNode) {
    const status = normalizeRunStatus(node.info.status)
    if (status === XpertAgentExecutionStatusEnum.PENDING && getAgentRunCounts(node).text > 0) {
      return this.#translate.instant('PAC.Xpert.AgentRunStatusReplied', { Default: 'Replied' })
    }
    return status
  }

  agentRunInputTooltip(node: AgentRunRenderNode) {
    return node.info.inputs === undefined ? null : this.formatDisplayValue(node.info.inputs)
  }

  agentRunCountItems(node: AgentRunRenderNode) {
    const counts = getAgentRunCounts(node)
    return [
      counts.text
        ? { key: 'text', icon: 'ri-message-2-line', count: counts.text, label: `${counts.text} messages` }
        : null,
      counts.tools
        ? { key: 'tools', icon: 'ri-tools-line', count: counts.tools, label: `${counts.tools} tools` }
        : null,
      counts.events
        ? { key: 'events', icon: 'ri-information-line', count: counts.events, label: `${counts.events} events` }
        : null,
      counts.children
        ? { key: 'children', icon: 'ri-git-branch-line', count: counts.children, label: `${counts.children} agents` }
        : null
    ].filter((item): item is { key: string; icon: string; count: number; label: string } => !!item)
  }

  agentRunError(node: AgentRunRenderNode) {
    return node.info.error === undefined || node.info.error === null ? null : this.formatDisplayValue(node.info.error)
  }

  agentEvent(entry: AgentRunEntry) {
    return entry.item as AgentRunEvent
  }

  agentEventLabel(event: AgentRunEvent) {
    return event.title || event.message || event.event || 'Event'
  }

  agentEventDetail(event: AgentRunEvent) {
    return event.title && event.message ? event.message : null
  }

  isAgentEventError(event: AgentRunEvent) {
    return event.error !== undefined || isFailedRunStatus(event.status)
  }

  reasoningEntry(entry: AgentRunEntry) {
    return entry.item as TMessageContentReasoning
  }

  private formatDisplayValue(value: unknown) {
    if (typeof value === 'string') {
      return value
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  private formatDuration(durationMs: number) {
    if (durationMs < 1000) {
      return `${durationMs}ms`
    }
    if (durationMs < 10000) {
      return `${(durationMs / 1000).toFixed(1)}s`
    }
    if (durationMs < 60000) {
      return `${Math.round(durationMs / 1000)}s`
    }
    const minutes = Math.floor(durationMs / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  onCopy(copyButton) {
    copyButton.copied = true
    setTimeout(() => {
      copyButton.copied = false
    }, 3000)
  }

  getFeedback(id: string) {
    return this.feedbacks()?.[id]
  }

  feedback(message: Partial<IChatMessage>, rating: ChatMessageFeedbackRatingEnum) {
    this.messageFeedbackService
      .create({
        messageId: message.id,
        conversationId: message.conversationId,
        rating
      })
      .subscribe({
        next: (feedback) => {
          this.feedbacks.update((state) => ({
            ...(state ?? {}),
            [message.id]: feedback
          }))
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  cancelFeedback(message: Partial<IChatMessage>, id: string) {
    this.messageFeedbackService.delete(id).subscribe({
      next: () => {
        this.feedbacks.update((state) => ({
          ...(state ?? {}),
          [message.id]: null
        }))
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  toggleSteps() {
    this.expandSteps.update((state) => !state)
  }

  openCanvas() {
    this.homeService.canvasOpened.set({
      opened: true,
      type: 'Computer',
      messageId: this.message().id
    })
  }

  openLogs() {
    this.#dialog
      .open(ChatMessageExecutionPanelComponent, {
        panelClass: 'chat-message-executions-dialog',
        data: {
          id: this.message().executionId,
          xpert: this.xpert()
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  // Text to Speech
  readonly synthesizeLoading = this.#synthesizeService.synthesizeLoading
  readonly isPlaying = this.#synthesizeService.isPlaying
  readAloud(message: IChatMessage) {
    this.#synthesizeService.readAloud(message.conversationId, message)
  }

  onRetryMessage() {
    // Trigger retry for the current AI message
    if (!this.canRetry()) {
      return
    }
    this.chatService.retryMessage(this.message().id)
  }
}
