import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { TChatElementReference } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardIconComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { ChatComputerTimelineComponent } from '../../../@shared/chat/computer-timeline/computer-timeline.component'
import { FileWorkbenchReferenceRequest } from '../../../@shared/files'
import { ChatSharedTerminalComponent } from '../../../@shared/chat/terminal/terminal.component'
import { AssistantCode, AiThreadService, ChatConversationService, IChatConversation, getErrorMessage, injectToastr } from '../../../@core'
import { injectHostedAssistantChatkitControl } from '../../assistant/assistant-chatkit.runtime'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationPreviewComponent } from './clawxpert-conversation-preview.component'
import { ClawXpertFacade } from './clawxpert.facade'
import {
  shouldRefreshWorkspaceFilesFromEffectEvent,
  shouldRefreshWorkspaceFilesFromLogEvent
} from './clawxpert-workspace-file-refresh.utils'

const WORKSPACE_FILE_REFRESH_DEBOUNCE_MS = 300
const CONVERSATION_DETAIL_REFRESH_INTERVAL_MS = 1000
const CONVERSATION_DETAIL_RELATIONS = ['messages']

type ChatKitCodeComposerReference = {
  type: 'code'
  path: string
  text: string
  startLine: number
  endLine: number
  language?: string
}

type ChatKitComposerReference = ChatKitCodeComposerReference | TChatElementReference

type ChatKitReferenceComposerControl = {
  element: unknown
  setComposerValue(params: {
    text?: string
    reply?: string
    attachments?: unknown[]
    references?: ChatKitComposerReference[]
    appendReferences?: boolean
  }): Promise<void>
  focusComposer(): Promise<void>
}

@Component({
  standalone: true,
  selector: 'pac-clawxpert-conversation-detail',
  imports: [
    CommonModule,
    TranslateModule,
    ChatKit,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTabsImports,
    ClawXpertConversationFilesComponent,
    ClawXpertConversationPreviewComponent,
    ChatSharedTerminalComponent,
    ChatComputerTimelineComponent
  ],
  template: `
    <div [class]="workspaceLayoutClasses()">
      <section [class]="detailPanelShellClasses()" [attr.aria-hidden]="showDetailPanel() ? null : 'true'">
        @if (showDetailPanel()) {
          <div class="flex h-full min-h-0 flex-col overflow-hidden">
            <div class="flex flex-col items-stretch justify-start border-b border-divider-regular px-5 pt-4">
              <div>
                <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
                  {{ 'PAC.Chat.ClawXpert.Detail' | translate: { Default: 'ClawXpert Detail' } }}
                </div>
                <div class="mt-2 text-lg font-semibold text-text-primary">
                  {{ facade.definition.titleKey | translate: { Default: facade.definition.defaultTitle } }}
                </div>
              </div>

              <nav
                z-tab-nav-bar
                [tabPanel]="tabPanel"
                color="accent"
                alignTabs="start"
                stretchTabs="false"
                disableRipple
                zSize="default"
                class="border-0 p-0 m-0"
              >
                <button
                  z-tab-link
                  type="button"
                  data-panel-button="files"
                  class="flex items-center gap-2"
                  [active]="activePanel() === 'files'"
                  (click)="selectPanel('files')"
                >
                  <i class="ri-folder-3-line text-base"></i>
                  <span>{{ 'PAC.Chat.ClawXpert.Files' | translate: { Default: 'Files' } }}</span>
                </button>

                <button
                  z-tab-link
                  type="button"
                  data-panel-button="computer"
                  class="flex items-center gap-2"
                  [active]="activePanel() === 'computer'"
                  (click)="selectPanel('computer')"
                >
                  <i class="ri-computer-line text-base"></i>
                  <span>{{ 'PAC.Chat.ClawXpert.Computer' | translate: { Default: 'Computer' } }}</span>
                </button>

                <button
                  z-tab-link
                  type="button"
                  data-panel-button="preview"
                  class="flex items-center gap-2"
                  [active]="activePanel() === 'preview'"
                  (click)="selectPanel('preview')"
                >
                  <i class="ri-global-line text-base"></i>
                  <span>{{ 'PAC.Chat.ClawXpert.Browser' | translate: { Default: 'Browser' } }}</span>
                </button>

                <button
                  z-tab-link
                  type="button"
                  data-panel-button="terminal"
                  class="flex items-center gap-2"
                  [active]="activePanel() === 'terminal'"
                  (click)="selectPanel('terminal')"
                >
                  <i class="ri-terminal-window-line text-base"></i>
                  <span>{{ 'PAC.Chat.ClawXpert.Terminal' | translate: { Default: 'Terminal' } }}</span>
                </button>
              </nav>
            </div>

            <z-tab-nav-panel #tabPanel class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div class="min-h-0 flex-1 p-2 pr-0">
                @if (contextLoading() && !resolvedConversationId()) {
                  <div class="flex h-full min-h-[24rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary">
                    {{ 'PAC.Chat.ClawXpert.ContextLoading' | translate: { Default: 'Loading conversation workspace...' } }}
                  </div>
                } @else {
                  @if (!resolvedConversationId()) {
                    <div class="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                      <i class="ri-folder-open-line text-3xl text-text-tertiary"></i>
                      <div class="mt-4 text-base font-medium text-text-primary">
                        {{
                          'PAC.Chat.ClawXpert.DetailPanelEmptyTitle'
                            | translate
                              : { Default: 'Start a conversation to unlock workspace tools' }
                        }}
                      </div>
                      <div class="mt-2 max-w-sm text-sm text-text-secondary">
                        @if (activePanel() === 'files') {
                          {{
                            'PAC.Chat.ClawXpert.FilesEmptyDesc'
                              | translate
                                : {
                                    Default:
                                  'Once this ClawXpert thread is created, its server-volume workspace files will appear here.'
                                  }
                          }}
                        } @else if (activePanel() === 'computer') {
                          {{
                            'PAC.Chat.ClawXpert.ComputerEmptyDesc'
                              | translate
                                : {
                                    Default:
                                      'Once this ClawXpert thread is created, its computer timeline will appear here as workspace tools start running.'
                                  }
                          }}
                        } @else if (activePanel() === 'preview') {
                          {{
                            'PAC.Chat.ClawXpert.PreviewDetailEmptyDesc'
                              | translate
                                : {
                                    Default:
                                      'Once this ClawXpert thread is created, its managed sandbox services will appear here for live browsing and element selection.'
                                  }
                          }}
                        } @else {
                          {{
                            'PAC.Chat.ClawXpert.TerminalEmptyDesc'
                              | translate
                                : {
                                    Default:
                                      'Once this ClawXpert thread is created, you can run commands here against the current workspace.'
                                  }
                          }}
                        }
                      </div>
                    </div>
                  } @else {
                    @if (contextError()) {
                      <div class="mb-3 rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-secondary">
                        {{ contextError() }}
                      </div>
                    }

                    @if (activePanel() === 'files') {
                      <pac-clawxpert-conversation-files
                        class="h-full"
                        [conversationId]="resolvedConversationId()"
                        [xpertId]="facade.xpertId()"
                        [mode]="'editable'"
                        [reloadKey]="fileListReloadKey()"
                        (referenceRequest)="handleWorkspaceReference($event)"
                      />
                    } @else if (activePanel() === 'computer') {
                      <xp-chat-computer-timeline
                        class="h-full"
                        [conversation]="resolvedConversation()"
                        [projectId]="resolvedConversation()?.projectId ?? null"
                      />
                    } @else if (activePanel() === 'preview') {
                      <pac-clawxpert-conversation-preview
                        class="h-full"
                        [conversationId]="resolvedConversationId()"
                        (referenceRequest)="handleElementReference($event)"
                      />
                    } @else {
                      <xp-chat-shared-terminal
                        class="h-full"
                        [mode]="'interactive'"
                        [conversationId]="resolvedConversationId()"
                        [projectId]="resolvedConversation()?.projectId ?? null"
                      />
                    }
                  }
                }
              </div>
            </z-tab-nav-panel>
          </div>
        }
      </section>

      <section [class]="chatShellClasses()">
        <div class="flex h-full min-h-0 flex-col overflow-hidden transition-[border-color,background-color,box-shadow,border-radius,transform]"
          [class]="showDetailPanel() ? 'rounded-3xl bg-components-card-bg shadow-lg border border-border' : ''">

          <div class="min-h-0 flex-1">
            @if (facade.loading()) {
              <div class="flex h-full min-h-[32rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary">
                {{ 'PAC.Chat.ClawXpert.Loading' | translate: { Default: 'Preparing ClawXpert...' } }}
              </div>
            } @else {
              @switch (facade.viewState()) {
                @case ('organization-required') {
                  <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                    <z-icon zType="domain" class="text-3xl text-text-tertiary"></z-icon>
                    <div class="mt-4 text-base font-medium text-text-primary">
                      {{
                        'PAC.Chat.ClawXpert.OrganizationRequired'
                          | translate
                            : { Default: 'Select an organization to use ClawXpert' }
                      }}
                    </div>
                    <div class="mt-2 max-w-sm text-sm text-text-secondary">
                      {{
                        'PAC.Chat.ClawXpert.OrganizationRequiredDesc'
                          | translate
                            : { Default: 'ClawXpert stores one assistant binding per user and per organization.' }
                      }}
                    </div>
                  </div>
                }
                @case ('error') {
                  <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center">
                    <z-icon zType="warning" class="text-3xl text-text-tertiary"></z-icon>
                    <div class="mt-4 text-base font-medium text-text-primary">
                      {{ 'PAC.Chat.ClawXpert.LoadFailed' | translate: { Default: 'Failed to load ClawXpert.' } }}
                    </div>
                    <div class="mt-2 max-w-sm text-sm text-text-secondary">
                      {{ facade.viewErrorMessage() }}
                    </div>
                  </div>
                }
                @case ('ready') {
                  <xpert-chatkit class="h-full min-h-[32rem]" [control]="control()!" />
                }
                @default {
                  <div class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                    <z-icon zType="edit_note" class="text-3xl text-text-tertiary"></z-icon>
                    <div class="mt-4 text-base font-medium text-text-primary">
                      {{ 'PAC.Chat.ClawXpert.SetupFirstTitle' | translate: { Default: 'Finish setup in overview first' } }}
                    </div>
                    <div class="mt-2 max-w-sm text-sm text-text-secondary">
                      {{
                        'PAC.Chat.ClawXpert.SetupFirstDesc'
                          | translate
                            : { Default: 'Bind a ClawXpert in the overview page before entering the detail chat workspace.' }
                      }}
                    </div>
                  </div>
                }
              }
            }
          </div>
        </div>
      </section>
    </div>
  `
})
export class ClawXpertConversationDetailComponent implements OnDestroy {
  readonly #threadService = inject(AiThreadService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #toastr = injectToastr()
  readonly #responseActive = signal(false)
  #workspaceFileRefreshTimer: ReturnType<typeof setTimeout> | null = null

  readonly facade = inject(ClawXpertFacade)
  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => (this.facade.viewState() === 'ready' ? AssistantCode.CLAWXPERT : null)),
    assistantId: computed(() => this.facade.resolvedPreference()?.assistantId ?? null),
    frameUrl: this.facade.chatkitFrameUrl,
    initialThread: this.facade.threadId,
    titleKey: this.facade.definition.titleKey,
    titleDefault: this.facade.definition.defaultTitle,
    onThreadChange: ({ threadId }) => {
      this.facade.onChatThreadChange(threadId)
    },
    // onThreadLoadStart: ({ threadId }) => {
    //   this.facade.onChatThreadChange(threadId)
    // },
    // onThreadLoadEnd: ({ threadId }) => {
    //   this.facade.onChatThreadChange(threadId)
    // },
    onEffect: (event) => {
      if (shouldRefreshWorkspaceFilesFromEffectEvent(event)) {
        this.scheduleWorkspaceFileListRefresh()
      }
    },
    onLog: (event) => {
      if (shouldRefreshWorkspaceFilesFromLogEvent(event)) {
        this.scheduleWorkspaceFileListRefresh()
      }
    },
    onResponseStart: () => {
      this.#responseActive.set(true)
      this.facade.patchActiveConversationStatus('busy')
    },
    onResponseEnd: () => {
      this.#responseActive.set(false)
      this.facade.patchActiveConversationStatus('idle')

      if (this.activePanel() === 'computer' && this.resolvedConversationId()) {
        void this.refreshResolvedConversationDetail()
      }
    }
  })
  readonly activePanel = signal<'files' | 'computer' | 'preview' | 'terminal' | null>('files')
  readonly fileListReloadKey = signal(0)
  readonly resolvedConversationId = signal<string | null>(null)
  readonly resolvedConversation = signal<IChatConversation | null>(null)
  readonly contextLoading = signal(false)
  readonly contextError = signal<string | null>(null)
  readonly showDetailPanel = computed(() => !!this.activePanel())
  readonly workspaceLayoutClasses = computed(() =>
    this.showDetailPanel()
      ? 'grid h-full min-h-0 grid-cols-1 transition-[grid-template-columns,gap] duration-300 ease-out xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]'
      : 'grid h-full min-h-0 grid-cols-1 transition-[grid-template-columns,gap] duration-300 ease-out xl:grid-cols-[0rem_minmax(0,1fr)]'
  )
  readonly detailPanelShellClasses = computed(() =>
    this.showDetailPanel()
      ? 'min-h-0 min-w-0 overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out max-h-[120rem] translate-y-0 opacity-100 xl:translate-x-0 xl:translate-y-0'
      : 'pointer-events-none min-h-0 min-w-0 overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out max-h-0 -translate-y-4 opacity-0 xl:max-h-none xl:-translate-x-6 xl:translate-y-0'
  )
  readonly chatShellClasses = computed(() =>
    this.showDetailPanel()
      ? 'min-h-0 min-w-0 transition-[border-color,background-color,box-shadow,border-radius,transform] duration-300 ease-out xl:w-full xl:max-w-[32rem] xl:justify-self-end py-4 px-2'
      : 'min-h-0 min-w-0 rounded-none border border-transparent bg-transparent shadow-none transition-[border-color,background-color,box-shadow,border-radius,transform] duration-300 ease-out xl:w-full'
  )

  constructor() {
    effect((onCleanup) => {
      const pendingStartId = this.facade.pendingConversationStartId()
      const control = this.control()

      if (!pendingStartId || this.facade.viewState() !== 'ready' || !control) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }

        void this.facade.beginPendingConversation(pendingStartId, control)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })

    effect((onCleanup) => {
      const control = this.control()
      const threadId = this.facade.threadId()
      const viewState = this.facade.viewState()
      const loadingUserPreference = this.facade.loadingUserPreference()

      this.facade.suppressAutoResume()

      if (!control || threadId || viewState !== 'ready' || loadingUserPreference) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }
        void this.facade.ensureConversationEntry(control)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })

    effect((onCleanup) => {
      const conversationId = this.resolvedConversationId()
      const panel = this.activePanel()
      const isConversationBusy = this.#responseActive() || this.facade.activeConversation()?.status === 'busy'

      if (panel !== 'computer' || !conversationId || !isConversationBusy) {
        return
      }

      let cancelled = false
      const intervalId = setInterval(() => {
        void this.refreshResolvedConversationDetail(() => cancelled)
      }, CONVERSATION_DETAIL_REFRESH_INTERVAL_MS)

      onCleanup(() => {
        cancelled = true
        clearInterval(intervalId)
      })
    })

    effect(
      (onCleanup) => {
        const threadId = this.facade.threadId()
        if (!threadId) {
          this.#responseActive.set(false)
          this.contextLoading.set(false)
          this.contextError.set(null)
          this.resolvedConversationId.set(null)
          this.resolvedConversation.set(null)
          this.facade.setActiveConversation(null)
          return
        }

        let cancelled = false
        this.#responseActive.set(false)
        this.contextLoading.set(true)
        this.contextError.set(null)
        this.resolvedConversationId.set(null)
        this.resolvedConversation.set(null)
        this.facade.setActiveConversation(null)

        void this.resolveConversationContext(threadId, () => cancelled)

        onCleanup(() => {
          cancelled = true
        })
      }
    )
  }

  ngOnDestroy() {
    this.clearScheduledWorkspaceFileListRefresh()
    this.#responseActive.set(false)
    this.facade.setActiveConversation(null)
  }

  async handleWorkspaceReference(request: FileWorkbenchReferenceRequest) {
    await this.attachComposerReferences([
      {
        type: 'code',
        path: request.path,
        text: request.text,
        startLine: request.startLine,
        endLine: request.endLine,
        ...(request.language ? { language: request.language } : {})
      }
    ])
  }

  async handleElementReference(request: TChatElementReference) {
    await this.attachComposerReferences([request])
  }

  selectPanel(panel: 'files' | 'computer' | 'preview' | 'terminal') {
    this.activePanel.update((activePanel) => (activePanel === panel ? null : panel))
  }

  private async attachComposerReferences(references: ChatKitComposerReference[]) {
    const control = this.control() as ChatKitReferenceComposerControl | null
    if (!control?.element) {
      this.#toastr.warning('PAC.Chat.ClawXpert.ReferenceUnavailable', {
        Default: 'Chat composer is not ready yet. Try again in a moment.'
      })
      return
    }

    try {
      await control.setComposerValue({
        references,
        appendReferences: true
      })
      await control.focusComposer()
    } catch (error) {
      this.#toastr.danger(
        getErrorMessage(error) || 'PAC.Chat.ClawXpert.ReferenceAttachFailed',
        'PAC.TOASTR.TITLE.ERROR',
        {
          Default: 'Failed to attach the selected reference.'
        }
      )
    }
  }

  private scheduleWorkspaceFileListRefresh() {
    this.clearScheduledWorkspaceFileListRefresh()
    this.#workspaceFileRefreshTimer = setTimeout(() => {
      this.#workspaceFileRefreshTimer = null
      this.fileListReloadKey.update((value) => value + 1)
    }, WORKSPACE_FILE_REFRESH_DEBOUNCE_MS)
  }

  private clearScheduledWorkspaceFileListRefresh() {
    if (!this.#workspaceFileRefreshTimer) {
      return
    }

    clearTimeout(this.#workspaceFileRefreshTimer)
    this.#workspaceFileRefreshTimer = null
  }

  private async resolveConversationContext(threadId: string, isCancelled: () => boolean) {
    let conversationId: string | null = null
    let baseConversation: IChatConversation | null = null

    try {
      const thread = (await firstValueFrom(this.#threadService.getThread(threadId))) as {
        metadata?: { id?: string }
      } | null
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      conversationId = resolveConversationId(thread?.metadata)
    } catch (error) {
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      this.contextError.set(getErrorMessage(error) || 'Failed to resolve the current thread metadata.')
    }

    try {
      if (!conversationId) {
        baseConversation = (await firstValueFrom(this.#conversationService.getByThreadId(threadId))) as
          | IChatConversation
          | null
        if (isCancelled() || this.facade.threadId() !== threadId) {
          return
        }

        conversationId = baseConversation?.id ?? null
      }

      this.resolvedConversationId.set(conversationId)

      if (!conversationId) {
        this.resolvedConversation.set(null)
        this.facade.setActiveConversation(null)
        this.contextError.set(null)
        return
      }

      const conversation = await this.loadConversationDetail(conversationId)
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      this.syncResolvedConversation(conversationId, conversation ?? baseConversation)
      this.contextError.set(null)
    } catch (error) {
      if (isCancelled() || this.facade.threadId() !== threadId) {
        return
      }

      if (conversationId) {
        this.syncResolvedConversation(conversationId, baseConversation)
      } else {
        this.resolvedConversationId.set(null)
        this.resolvedConversation.set(null)
        this.facade.setActiveConversation(null)
      }

      this.contextError.set(getErrorMessage(error) || 'Failed to resolve the current conversation context.')
    } finally {
      if (!isCancelled() && this.facade.threadId() === threadId) {
        this.contextLoading.set(false)
      }
    }
  }

  private async refreshResolvedConversationDetail(isCancelled: () => boolean = () => false) {
    const conversationId = this.resolvedConversationId()
    if (!conversationId) {
      return
    }

    try {
      const conversation = await this.loadConversationDetail(conversationId)
      if (isCancelled() || this.resolvedConversationId() !== conversationId) {
        return
      }

      if (!conversation) {
        return
      }

      this.syncResolvedConversation(conversationId, conversation)
      this.contextError.set(null)
    } catch (error) {
      if (isCancelled() || this.resolvedConversationId() !== conversationId) {
        return
      }

      this.contextError.set(getErrorMessage(error) || 'Failed to refresh the current conversation context.')
    }
  }

  private async loadConversationDetail(conversationId: string) {
    return (await firstValueFrom(
      this.#conversationService.getById(conversationId, {
        relations: [...CONVERSATION_DETAIL_RELATIONS]
      })
    )) as IChatConversation | null
  }

  private syncResolvedConversation(conversationId: string, conversation: IChatConversation | null) {
    const nextConversation = this.withRuntimeConversationStatus(conversation)

    this.resolvedConversationId.set(nextConversation?.id ?? conversationId)
    this.resolvedConversation.set(nextConversation)
    this.facade.setActiveConversation(nextConversation)
  }

  private withRuntimeConversationStatus(conversation: IChatConversation | null) {
    if (!conversation) {
      return null
    }

    if (!this.#responseActive()) {
      return conversation
    }

    return {
      ...conversation,
      status: 'busy'
    } as IChatConversation
  }
}

function resolveConversationId(metadata?: { id?: string }) {
  const conversationId = metadata?.id
  return typeof conversationId === 'string' && conversationId.trim() ? conversationId : null
}
