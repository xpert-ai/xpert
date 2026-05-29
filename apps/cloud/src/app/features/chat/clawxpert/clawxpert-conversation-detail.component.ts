import { CommonModule } from '@angular/common'
import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import type { ChatKitQuoteReference, TChatElementReference, TChatFileElementReference } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardIconComponent, ZardMenuImports, ZardTabsImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import type { FileWorkbenchFilePathReferenceRequest, FileWorkbenchReferenceRequest } from '../../../@shared/files'
import { ChatSharedTerminalComponent } from '../../../@shared/chat/terminal/terminal.component'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import {
  AssistantCode,
  AiThreadService,
  ChatConversationService,
  IChatConversation,
  getErrorMessage,
  injectToastr
} from '../../../@core'
import { registerAssistantChatSendMessageCommand } from '../../assistant/assistant-chat-client-command'
import { injectHostedAssistantChatkitControl } from '../../assistant/assistant-chatkit.runtime'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationPreviewComponent } from './clawxpert-conversation-preview.component'
import { ClawXpertFacade } from './clawxpert.facade'
import {
  type ClawXpertSandboxPreviewTarget,
  getSandboxPreviewTargetFromEffectEvent,
  getSandboxPreviewTargetFromLogEvent
} from './clawxpert-sandbox-preview.utils'
import {
  shouldRefreshWorkspaceFilesFromEffectEvent,
  shouldRefreshWorkspaceFilesFromLogEvent
} from './clawxpert-workspace-file-refresh.utils'

const WORKSPACE_FILE_REFRESH_DEBOUNCE_MS = 300
const CONVERSATION_DETAIL_RELATIONS = ['messages']
const CHAT_MINIMIZED_TO_PET_ATTRIBUTE = 'data-chat-minimized-to-pet'
const INSPECTED_ELEMENT_ACTION_TARGET_TEXT =
  'Action target: Apply to THIS inspected element only; do not change the rest of the file/page unless explicitly asked.'

type ChatKitCodeComposerReference = {
  type: 'code'
  path: string
  text: string
  startLine: number
  endLine: number
  language?: string
}

type ChatKitComposerReference = ChatKitCodeComposerReference | ChatKitQuoteReference
type ClawXpertStaticTabId = 'files' | 'terminal'
type ClawXpertWorkspaceTabKind = ClawXpertStaticTabId | 'browser'
type ClawXpertToolTab = {
  id: string
  kind: ClawXpertStaticTabId
}
type ClawXpertBrowserTab = {
  id: string
  kind: 'browser'
  serviceId: string | null
  url: string | null
  displayUrl: string | null
  zoom: number
  deviceToolbarVisible: boolean
  reloadKey: number
}
type ClawXpertWorkspaceTab = ClawXpertToolTab | ClawXpertBrowserTab

type ClawXpertConversationPanel = ClawXpertStaticTabId | 'preview'
type ClawXpertBrowserTabChange = Partial<Omit<ClawXpertBrowserTab, 'id' | 'kind'>>
const DEFAULT_BROWSER_ZOOM = 100
const INITIAL_WORKSPACE_TAB: ClawXpertToolTab = {
  id: 'files-initial',
  kind: 'files'
}

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
    ...ZardMenuImports,
    ...ZardTabsImports,
    ClawXpertConversationFilesComponent,
    ClawXpertConversationPreviewComponent,
    ChatSharedTerminalComponent
  ],
  template: `
    <div [class]="workspaceLayoutClasses()">
      <section [class]="detailPanelShellClasses()" [attr.aria-hidden]="showDetailPanel() ? null : 'true'">
        @if (showDetailPanel()) {
          <div class="flex h-full min-h-0 flex-col overflow-hidden">
            <div
              data-workspace-tab-header
              class="flex min-w-0 items-center justify-start gap-1 border-b border-divider-regular px-4 pt-1"
            >
              <nav
                z-tab-nav-bar
                [tabPanel]="tabPanel"
                color="accent"
                alignTabs="start"
                stretchTabs="false"
                disableRipple
                zSize="sm"
                class="m-0 min-w-0 max-w-full shrink border-0 p-0"
              >
                @for (tab of workspaceTabs(); track tab.id) {
                  <button
                    z-tab-link
                    type="button"
                    [attr.data-panel-button]="tab.kind === 'browser' ? 'browser' : tab.kind"
                    [attr.data-tab-id]="tab.id"
                    class="group/tab flex min-w-0 items-center gap-2 !border-transparent transition-colors hover:rounded-2xl hover:bg-hover-bg data-[active=true]:rounded-xl data-[active=true]:!border-transparent data-[active=true]:!bg-hover-bg data-[active=true]:!text-text-primary"
                    [active]="activeTabId() === tab.id"
                    (click)="selectTab(tab.id)"
                  >
                    <span class="relative flex h-5 w-5 shrink-0 items-center justify-center">
                      @switch (tab.kind) {
                        @case ('files') {
                          <i class="ri-folder-3-line shrink-0 text-base"></i>
                        }
                        @case ('terminal') {
                          <i class="ri-terminal-window-line shrink-0 text-base"></i>
                        }
                        @case ('browser') {
                          <i class="ri-global-line shrink-0 text-base"></i>
                        }
                      }
                      <span
                        role="button"
                        tabindex="0"
                        [attr.data-close-tab]="tab.id"
                        class="absolute inset-0 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-text-tertiary text-components-card-bg opacity-0 transition-[background-color,color,opacity] hover:bg-text-secondary group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
                        (click)="closeWorkspaceTab($event, tab.id)"
                        (keydown.enter)="closeWorkspaceTab($event, tab.id)"
                        (keydown.space)="closeWorkspaceTab($event, tab.id)"
                      >
                        <i class="ri-close-line text-sm"></i>
                      </span>
                    </span>
                    @switch (tab.kind) {
                      @case ('files') {
                        <span>{{ 'PAC.Chat.ClawXpert.Files' | translate: { Default: 'Files' } }}</span>
                      }
                      @case ('terminal') {
                        <span>{{ 'PAC.Chat.ClawXpert.Terminal' | translate: { Default: 'Terminal' } }}</span>
                      }
                      @case ('browser') {
                        <span class="max-w-[12rem] truncate">
                          {{ tab.displayUrl || ('PAC.Chat.ClawXpert.Browser' | translate: { Default: 'Browser' }) }}
                        </span>
                      }
                    }
                  </button>
                }
              </nav>

              <button
                z-button
                type="button"
                zType="ghost"
                zSize="icon"
                data-add-workspace-tab
                class="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
                [title]="'PAC.Chat.ClawXpert.NewWorkspaceTab' | translate: { Default: 'New workspace tab' }"
                z-menu
                [zMenuTriggerFor]="workspaceTabMenu"
              >
                <i class="ri-add-line text-lg"></i>
              </button>

              <ng-template #workspaceTabMenu>
                <div z-menu-content class="w-52">
                  <button type="button" z-menu-item data-add-files-tab (click)="addWorkspaceTab('files')">
                    <span class="flex items-center gap-2">
                      <i class="ri-folder-3-line text-base"></i>
                      <span>{{ 'PAC.Chat.ClawXpert.Files' | translate: { Default: 'Files' } }}</span>
                    </span>
                  </button>
                  <button type="button" z-menu-item data-add-browser-tab (click)="addWorkspaceTab('browser')">
                    <span class="flex items-center gap-2">
                      <i class="ri-global-line text-base"></i>
                      <span>{{ 'PAC.Chat.ClawXpert.Browser' | translate: { Default: 'Browser' } }}</span>
                    </span>
                  </button>
                  <button type="button" z-menu-item data-add-terminal-tab (click)="addWorkspaceTab('terminal')">
                    <span class="flex items-center gap-2">
                      <i class="ri-terminal-window-line text-base"></i>
                      <span>{{ 'PAC.Chat.ClawXpert.Terminal' | translate: { Default: 'Terminal' } }}</span>
                    </span>
                  </button>
                </div>
              </ng-template>
            </div>

            <z-tab-nav-panel #tabPanel class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div class="min-h-0 flex-1 p-2 pr-0">
                @if (!activeTab()) {
                  <div
                    data-empty-workspace-placeholder
                    class="flex h-full min-h-[24rem] items-center justify-center px-4 py-8 sm:px-6"
                  >
                    <div
                      data-empty-workspace-card-grid
                      class="grid w-full max-w-5xl grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3 sm:gap-4"
                    >
                      <button
                        type="button"
                        data-empty-workspace-card="files"
                        class="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-background-default-subtle p-6 text-center transition-colors hover:bg-hover-bg"
                        (click)="addWorkspaceTab('files')"
                      >
                        <i class="ri-folder-3-line text-3xl text-text-tertiary"></i>
                        <div class="mt-4 text-xl font-semibold text-text-primary">
                          {{ 'PAC.Chat.ClawXpert.Files' | translate: { Default: 'Files' } }}
                        </div>
                        <div class="mt-2 text-lg text-text-secondary">
                          {{ 'PAC.Chat.ClawXpert.FilesLauncherDesc' | translate: { Default: 'Browse project files' } }}
                        </div>
                      </button>
                      <button
                        type="button"
                        data-empty-workspace-card="browser"
                        class="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-background-default-subtle p-6 text-center transition-colors hover:bg-hover-bg"
                        (click)="addWorkspaceTab('browser')"
                      >
                        <i class="ri-global-line text-3xl text-text-tertiary"></i>
                        <div class="mt-4 text-xl font-semibold text-text-primary">
                          {{ 'PAC.Chat.ClawXpert.Browser' | translate: { Default: 'Browser' } }}
                        </div>
                        <div class="mt-2 text-lg text-text-secondary">
                          {{ 'PAC.Chat.ClawXpert.BrowserLauncherDesc' | translate: { Default: 'Open website' } }}
                        </div>
                      </button>
                      <button
                        type="button"
                        data-empty-workspace-card="terminal"
                        class="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-background-default-subtle p-6 text-center transition-colors hover:bg-hover-bg"
                        (click)="addWorkspaceTab('terminal')"
                      >
                        <i class="ri-terminal-window-line text-3xl text-text-tertiary"></i>
                        <div class="mt-4 text-xl font-semibold text-text-primary">
                          {{ 'PAC.Chat.ClawXpert.Terminal' | translate: { Default: 'Terminal' } }}
                        </div>
                        <div class="mt-2 text-lg text-text-secondary">
                          {{
                            'PAC.Chat.ClawXpert.TerminalLauncherDesc'
                              | translate: { Default: 'Launch interactive shell' }
                          }}
                        </div>
                      </button>
                    </div>
                  </div>
                } @else if (contextLoading() && !resolvedConversationId()) {
                  <div
                    class="flex h-full min-h-[24rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary"
                  >
                    {{
                      'PAC.Chat.ClawXpert.ContextLoading' | translate: { Default: 'Loading conversation workspace...' }
                    }}
                  </div>
                } @else {
                  @if (!resolvedConversationId()) {
                    <div
                      class="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center"
                    >
                      <i class="ri-folder-open-line text-3xl text-text-tertiary"></i>
                      <div class="mt-4 text-base font-medium text-text-primary">
                        {{
                          'PAC.Chat.ClawXpert.DetailPanelEmptyTitle'
                            | translate: { Default: 'Start a conversation to unlock workspace tools' }
                        }}
                      </div>
                      <div class="mt-2 max-w-sm text-sm text-text-secondary">
                        @if (activeTab()?.kind === 'files') {
                          {{
                            'PAC.Chat.ClawXpert.FilesEmptyDesc'
                              | translate
                                : {
                                    Default:
                                      'Once this ClawXpert thread is created, its server-volume workspace files will appear here.'
                                  }
                          }}
                        } @else if (activeTab()?.kind === 'browser') {
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
                      <div
                        class="mb-3 rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-secondary"
                      >
                        {{ contextError() }}
                      </div>
                    }

                    @if (activeTab()?.kind === 'files') {
                      <pac-clawxpert-conversation-files
                        class="h-full"
                        [conversationId]="resolvedConversationId()"
                        [xpertId]="facade.xpertId()"
                        [mode]="'editable'"
                        [reloadKey]="fileListReloadKey()"
                        (referenceRequest)="handleWorkspaceReference($event)"
                      />
                    } @else if (activeTab()?.kind === 'browser') {
                      <pac-clawxpert-conversation-preview
                        class="h-full"
                        [conversationId]="resolvedConversationId()"
                        [serviceId]="activeBrowserTab()?.serviceId"
                        [url]="activeBrowserTab()?.url"
                        [zoom]="activeBrowserTab()?.zoom"
                        [deviceToolbarVisible]="activeBrowserTab()?.deviceToolbarVisible"
                        [reloadKey]="activeBrowserTab()?.reloadKey"
                        (browserStateChange)="updateActiveBrowserTab($event)"
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
        <div
          class="flex h-full min-h-0 flex-col overflow-hidden transition-[border-color,background-color,box-shadow,border-radius,transform]"
          [class]="chatSurfaceClasses()"
        >
          <div class="min-h-0 flex-1">
            @if (facade.loading()) {
              <div
                class="flex h-full min-h-[32rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary"
              >
                {{ 'PAC.Chat.ClawXpert.Loading' | translate: { Default: 'Preparing ClawXpert...' } }}
              </div>
            } @else {
              @switch (facade.viewState()) {
                @case ('organization-required') {
                  <div
                    class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center"
                  >
                    <z-icon zType="domain" class="text-3xl text-text-tertiary"></z-icon>
                    <div class="mt-4 text-base font-medium text-text-primary">
                      {{
                        'PAC.Chat.ClawXpert.OrganizationRequired'
                          | translate: { Default: 'Select an organization to use ClawXpert' }
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
                  <div
                    class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center"
                  >
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
                  <xpert-chatkit #chatkitHost class="block h-full min-h-0" [control]="control()!" />
                }
                @default {
                  <div
                    class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center"
                  >
                    <z-icon zType="edit_note" class="text-3xl text-text-tertiary"></z-icon>
                    <div class="mt-4 text-base font-medium text-text-primary">
                      {{
                        'PAC.Chat.ClawXpert.SetupFirstTitle' | translate: { Default: 'Finish setup in overview first' }
                      }}
                    </div>
                    <div class="mt-2 max-w-sm text-sm text-text-secondary">
                      {{
                        'PAC.Chat.ClawXpert.SetupFirstDesc'
                          | translate
                            : {
                                Default:
                                  'Bind a ClawXpert in the overview page before entering the detail chat workspace.'
                              }
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
  readonly #clientCommands = inject(ViewClientCommandRegistry)
  readonly #responseActive = signal(false)
  #unregisterAssistantCommand: (() => void) | null = null
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
      const previewTarget = getSandboxPreviewTargetFromEffectEvent(event)
      if (previewTarget) {
        this.openBrowserTabFromSandboxEvent(previewTarget)
      }
    },
    onLog: (event) => {
      if (shouldRefreshWorkspaceFilesFromLogEvent(event)) {
        this.scheduleWorkspaceFileListRefresh()
      }
      const previewTarget = getSandboxPreviewTargetFromLogEvent(event)
      if (previewTarget) {
        this.openBrowserTabFromSandboxEvent(previewTarget)
      }
    },
    onResponseStart: () => {
      this.#responseActive.set(true)
      this.facade.patchActiveConversationStatus('busy')
    },
    onResponseEnd: () => {
      this.#responseActive.set(false)
      this.facade.patchActiveConversationStatus('idle')
    }
  })
  readonly workspaceTabs = signal<ClawXpertWorkspaceTab[]>([{ ...INITIAL_WORKSPACE_TAB }])
  readonly browserTabs = computed<ClawXpertBrowserTab[]>(() =>
    this.workspaceTabs().filter((tab): tab is ClawXpertBrowserTab => tab.kind === 'browser')
  )
  readonly activeTabId = signal<string>(INITIAL_WORKSPACE_TAB.id)
  readonly activeTab = computed<ClawXpertWorkspaceTab | null>(() => {
    const tabs = this.workspaceTabs()
    return tabs.find((tab) => tab.id === this.activeTabId()) ?? tabs[0] ?? null
  })
  readonly activeBrowserTab = computed(() => {
    const tab = this.activeTab()
    return tab?.kind === 'browser' ? tab : null
  })
  readonly activePanel = computed<ClawXpertConversationPanel | null>(() => {
    const tab = this.activeTab()
    if (!tab) {
      return null
    }

    return tab.kind === 'browser' ? 'preview' : tab.kind
  })
  readonly fileListReloadKey = signal(0)
  readonly resolvedConversationId = signal<string | null>(null)
  readonly resolvedConversation = signal<IChatConversation | null>(null)
  readonly contextLoading = signal(false)
  readonly contextError = signal<string | null>(null)
  readonly isChatMinimizedToPet = signal(false)
  readonly chatkitHost = viewChild('chatkitHost', { read: ElementRef<HTMLElement> })
  readonly showDetailPanel = computed(() => this.workspaceTabs().length === 0 || !!this.activePanel())
  readonly workspaceLayoutClasses = computed(() => {
    if (this.isChatMinimizedToPet()) {
      return this.showDetailPanel()
        ? 'grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_0rem] transition-[grid-template-columns,grid-template-rows,gap] duration-300 ease-out xl:grid-cols-[minmax(0,1fr)_0rem] xl:grid-rows-1'
        : 'grid h-full min-h-0 grid-cols-1 grid-rows-[0rem_0rem] transition-[grid-template-columns,grid-template-rows,gap] duration-300 ease-out xl:grid-cols-[0rem_0rem] xl:grid-rows-1'
    }

    return this.showDetailPanel()
      ? 'grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(24rem,32rem)] transition-[grid-template-columns,grid-template-rows,gap] duration-300 ease-out xl:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)] xl:grid-rows-1'
      : 'grid h-full min-h-0 grid-cols-1 grid-rows-[0rem_minmax(0,1fr)] transition-[grid-template-columns,grid-template-rows,gap] duration-300 ease-out xl:grid-cols-[0rem_minmax(0,1fr)] xl:grid-rows-1'
  })
  readonly detailPanelShellClasses = computed(() =>
    this.showDetailPanel()
      ? 'min-h-0 min-w-0 overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out max-h-[120rem] translate-y-0 opacity-100 xl:translate-x-0 xl:translate-y-0'
      : 'pointer-events-none min-h-0 min-w-0 overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out max-h-0 -translate-y-4 opacity-0 xl:max-h-none xl:-translate-x-6 xl:translate-y-0'
  )
  readonly chatShellClasses = computed(() => {
    if (this.isChatMinimizedToPet()) {
      return 'min-h-0 min-w-0 overflow-visible p-0 transition-[border-color,background-color,box-shadow,border-radius,transform] duration-300 ease-out xl:w-0 xl:max-w-0 xl:justify-self-end'
    }

    return this.showDetailPanel()
      ? 'min-h-0 min-w-0 transition-[border-color,background-color,box-shadow,border-radius,transform] duration-300 ease-out xl:w-full xl:max-w-[32rem] xl:justify-self-end py-4 px-2'
      : 'min-h-0 min-w-0 rounded-none border border-transparent bg-transparent shadow-none transition-[border-color,background-color,box-shadow,border-radius,transform] duration-300 ease-out xl:w-full'
  })
  readonly chatSurfaceClasses = computed(() =>
    this.showDetailPanel() && !this.isChatMinimizedToPet()
      ? 'rounded-3xl bg-components-card-bg shadow-lg border border-border'
      : ''
  )

  constructor() {
    this.#unregisterAssistantCommand = registerAssistantChatSendMessageCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => this.facade.viewState() === 'ready',
      unavailableMessage: 'Current Assistant ChatKit is not ready.'
    })

    effect((onCleanup) => {
      const chatkitHost = this.chatkitHost()?.nativeElement
      const viewState = this.facade.viewState()

      if (viewState !== 'ready' || !chatkitHost) {
        this.isChatMinimizedToPet.set(false)
        return
      }

      const chatkitElement = resolveEmbeddedChatkitElement(chatkitHost)
      const syncMinimizedToPetState = () => {
        this.isChatMinimizedToPet.set(chatkitElement.dataset.chatMinimizedToPet === 'true')
      }

      syncMinimizedToPetState()

      if (typeof MutationObserver === 'undefined') {
        return
      }

      const observer = new MutationObserver(syncMinimizedToPetState)
      observer.observe(chatkitElement, {
        attributes: true,
        attributeFilter: [CHAT_MINIMIZED_TO_PET_ATTRIBUTE]
      })

      onCleanup(() => {
        observer.disconnect()
        this.isChatMinimizedToPet.set(false)
      })
    })

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
    })
  }

  ngOnDestroy() {
    this.#unregisterAssistantCommand?.()
    this.#unregisterAssistantCommand = null
    this.clearScheduledWorkspaceFileListRefresh()
    this.#responseActive.set(false)
    this.isChatMinimizedToPet.set(false)
    this.facade.setActiveConversation(null)
  }

  async handleWorkspaceReference(request: FileWorkbenchReferenceRequest) {
    if (isFileElementReferenceRequest(request)) {
      await this.attachComposerReferences([toFileElementQuoteReference(request)])
      return
    }

    if (isFilePathReferenceRequest(request)) {
      await this.attachComposerReferences([toFilePathQuoteReference(request)])
      return
    }

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
    await this.attachComposerReferences([toPageElementQuoteReference(request)])
  }

  selectPanel(panel: ClawXpertConversationPanel) {
    if (panel === 'preview') {
      this.openBrowserTabFromSandboxEvent()
      return
    }

    const existingTab = this.workspaceTabs().find((tab) => tab.kind === panel)
    if (existingTab) {
      this.selectTab(existingTab.id)
      return
    }

    this.addWorkspaceTab(panel)
  }

  selectTab(tabId: string) {
    if (!this.workspaceTabs().some((tab) => tab.id === tabId)) {
      return
    }

    this.activeTabId.set(tabId)
  }

  addWorkspaceTab(kind: ClawXpertWorkspaceTabKind) {
    if (kind === 'browser') {
      return this.addBrowserTab()
    }

    const tab: ClawXpertToolTab = {
      id: this.createWorkspaceTabId(kind),
      kind
    }

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activeTabId.set(tab.id)
    return tab
  }

  addBrowserTab(initial?: Partial<Pick<ClawXpertBrowserTab, 'serviceId' | 'url' | 'displayUrl'>>) {
    const tab: ClawXpertBrowserTab = {
      id: this.createWorkspaceTabId('browser'),
      kind: 'browser',
      serviceId: initial?.serviceId ?? null,
      url: initial?.url ?? null,
      displayUrl: initial?.displayUrl ?? null,
      zoom: DEFAULT_BROWSER_ZOOM,
      deviceToolbarVisible: false,
      reloadKey: 0
    }

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activeTabId.set(tab.id)
    return tab
  }

  closeWorkspaceTab(event: Event, tabId: string) {
    event.preventDefault()
    event.stopPropagation()

    const tabs = this.workspaceTabs()
    const closedIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (closedIndex < 0) {
      return
    }

    const nextTabs = tabs.filter((tab) => tab.id !== tabId)
    this.workspaceTabs.set(nextTabs)
    if (this.activeTabId() !== tabId && nextTabs.length > 0) {
      return
    }

    const fallbackTab = nextTabs[Math.min(closedIndex, nextTabs.length - 1)]
    this.activeTabId.set(fallbackTab?.id ?? '')
  }

  updateActiveBrowserTab(change: ClawXpertBrowserTabChange) {
    const tab = this.activeBrowserTab()
    if (!tab) {
      return
    }

    this.updateBrowserTab(tab.id, change)
  }

  private openBrowserTabFromSandboxEvent(target: ClawXpertSandboxPreviewTarget = {}) {
    const matchedTab = this.findBrowserTabForPreviewTarget(target)
    if (matchedTab) {
      this.updateBrowserTab(matchedTab.id, {
        ...(target.displayUrl !== undefined ? { displayUrl: target.displayUrl } : {}),
        ...(target.serviceId !== undefined ? { serviceId: target.serviceId } : {}),
        ...(target.url !== undefined ? { url: target.url } : {})
      })
      this.activeTabId.set(matchedTab.id)
      return matchedTab
    }

    const reusableTab = this.browserTabs().find((tab) => !tab.serviceId && !tab.url)
    if (reusableTab) {
      this.updateBrowserTab(reusableTab.id, {
        ...(target.displayUrl !== undefined ? { displayUrl: target.displayUrl } : {}),
        ...(target.serviceId !== undefined ? { serviceId: target.serviceId } : {}),
        ...(target.url !== undefined ? { url: target.url } : {})
      })
      this.activeTabId.set(reusableTab.id)
      return reusableTab
    }

    return this.addBrowserTab({
      displayUrl: target.displayUrl ?? null,
      serviceId: target.serviceId ?? null,
      url: target.url ?? null
    })
  }

  private findBrowserTabForPreviewTarget(target: ClawXpertSandboxPreviewTarget) {
    return this.browserTabs().find((tab) => isMatchingBrowserTab(tab, target)) ?? null
  }

  private updateBrowserTab(tabId: string, change: ClawXpertBrowserTabChange) {
    this.workspaceTabs.update((tabs) =>
      tabs.map((tab) =>
        tab.kind === 'browser' && tab.id === tabId
          ? {
              ...tab,
              ...change
            }
          : tab
      )
    )
  }

  private createWorkspaceTabId(kind: ClawXpertWorkspaceTabKind) {
    return `${kind}-${Date.now()}-${this.workspaceTabs().length + 1}`
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
        baseConversation = (await firstValueFrom(
          this.#conversationService.getByThreadId(threadId)
        )) as IChatConversation | null
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

function isMatchingBrowserTab(tab: ClawXpertBrowserTab, target: ClawXpertSandboxPreviewTarget) {
  if (typeof target.serviceId === 'string' && target.serviceId.trim() && tab.serviceId === target.serviceId) {
    return true
  }

  const targetUrl = target.url ?? target.displayUrl
  return typeof targetUrl === 'string' && targetUrl.trim()
    ? tab.url === targetUrl || tab.displayUrl === targetUrl
    : false
}

function toFileElementQuoteReference(reference: TChatFileElementReference): ChatKitQuoteReference {
  const source = formatFileElementSource(reference)

  return {
    type: 'quote',
    label: reference.label?.trim() || `${reference.tagName.toLowerCase()} ${reference.selector}`,
    source,
    text: [
      'Reference type: Target inspected HTML file element',
      'Scope: This reference is the currently inspected element only, not the entire file.',
      INSPECTED_ELEMENT_ACTION_TARGET_TEXT,
      `Source location: ${source}`,
      reference.documentTitle?.trim() ? `Document title: ${reference.documentTitle.trim()}` : null,
      'Inspected element:',
      `- Selector: ${reference.selector}`,
      `- DOM path: ${reference.domPath}`,
      `- Tag: ${reference.tagName.toLowerCase()}`,
      reference.role?.trim() ? `- Role: ${reference.role.trim()}` : null,
      `- Attributes: ${formatElementAttributes(reference.attributes)}`,
      'Inspected element visible text:',
      reference.text,
      'Inspected element outerHTML:',
      '```html',
      reference.outerHtml,
      '```'
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
  }
}

function toFilePathQuoteReference(reference: FileWorkbenchFilePathReferenceRequest): ChatKitQuoteReference {
  return {
    type: 'quote',
    label: reference.path,
    source: 'Workspace file',
    text: reference.path
  }
}

function toPageElementQuoteReference(reference: TChatElementReference): ChatKitQuoteReference {
  const source = reference.pageTitle?.trim() || reference.pageUrl.trim()

  return {
    type: 'quote',
    label: reference.label?.trim() || `${reference.tagName.toLowerCase()} ${reference.selector}`,
    source,
    text: [
      'Reference type: Target inspected page element',
      'Scope: This reference is the currently inspected element only, not the entire page.',
      INSPECTED_ELEMENT_ACTION_TARGET_TEXT,
      source ? `Page: ${source}` : null,
      `URL: ${reference.pageUrl}`,
      `Service: ${reference.serviceId}`,
      `Selector: ${reference.selector}`,
      `Tag: ${reference.tagName.toLowerCase()}`,
      reference.role?.trim() ? `Role: ${reference.role.trim()}` : null,
      `Attributes: ${formatElementAttributes(reference.attributes)}`,
      'Visible text:',
      reference.text,
      'HTML:',
      '```html',
      reference.outerHtml,
      '```'
    ]
      .filter((line): line is string => line !== null)
      .join('\n')
  }
}

function resolveEmbeddedChatkitElement(host: HTMLElement) {
  return host.querySelector<HTMLElement>('xpertai-chatkit') ?? host
}

function formatFileElementSource(reference: TChatFileElementReference) {
  if (typeof reference.sourceStartLine !== 'number') {
    return reference.filePath
  }

  const lineRange =
    reference.sourceStartLine === reference.sourceEndLine
      ? `${reference.sourceStartLine}`
      : `${reference.sourceStartLine}-${reference.sourceEndLine ?? reference.sourceStartLine}`

  return `${reference.filePath}:${lineRange}`
}

function formatElementAttributes(attributes: Array<{ name: string; value: string }>) {
  if (!attributes.length) {
    return '(none)'
  }

  return attributes.map((attribute) => `${attribute.name}="${attribute.value}"`).join(' ')
}

function isFileElementReferenceRequest(request: FileWorkbenchReferenceRequest): request is TChatFileElementReference {
  return 'type' in request && request.type === 'file_element'
}

function isFilePathReferenceRequest(
  request: FileWorkbenchReferenceRequest
): request is FileWorkbenchFilePathReferenceRequest {
  return 'type' in request && request.type === 'file_path'
}
