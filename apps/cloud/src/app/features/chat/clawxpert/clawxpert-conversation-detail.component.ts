import { CommonModule } from '@angular/common'
import { Component, computed, effect, ElementRef, inject, OnDestroy, Signal, signal, viewChild } from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import type {
  ChatKitQuoteReference,
  IconDefinition,
  I18nObject,
  TChatElementReference,
  TChatFileElementReference,
  XpertExtensionViewManifest
} from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardIconComponent, ZardMenuImports, ZardTabsImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import type { FileWorkbenchFilePathReferenceRequest, FileWorkbenchReferenceRequest } from '../../../@shared/files'
import { IconComponent } from '../../../@shared/avatar'
import { ChatSharedTerminalComponent } from '../../../@shared/chat/terminal/terminal.component'
import { ExtensionHostOutletComponent } from '../../../@shared/view-extension'
import { ViewHostEventBus } from '../../../@shared/view-extension/view-host-event-bus.service'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import {
  AiThreadService,
  ChatConversationService,
  IChatConversation,
  ViewExtensionApiService,
  getErrorMessage,
  injectToastr
} from '../../../@core'
import {
  registerAssistantChatSendMessageCommand,
  registerAssistantContextSetCommand,
  type AssistantContextSetPayload
} from '../../assistant/assistant-chat-client-command'
import { injectHostedAssistantChatkitControl } from '../../assistant/assistant-chatkit.runtime'
import { WORKBENCH_CHAT_FACADE, WorkbenchChatFacade } from '../workbench-chat/workbench-chat.facade'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'
import { ClawXpertConversationPreviewComponent } from './clawxpert-conversation-preview.component'
import { ClawXpertFacade } from './clawxpert.facade'
import { ChatTasksComponent } from '../tasks/tasks.component'
import {
  type ClawXpertSandboxPreviewTarget,
  getSandboxPreviewTargetFromEffectEvent,
  getSandboxPreviewTargetFromLogEvent
} from './clawxpert-sandbox-preview.utils'
import {
  shouldRefreshWorkspaceFilesFromEffectEvent,
  shouldRefreshWorkspaceFilesFromLogEvent
} from './clawxpert-workspace-file-refresh.utils'
import { createAssistantToolCompletedHostEvent } from './assistant-tool-host-events.utils'

const WORKSPACE_FILE_REFRESH_DEBOUNCE_MS = 300
const CONVERSATION_DETAIL_RELATIONS = ['messages']
const CHAT_MINIMIZED_TO_PET_ATTRIBUTE = 'data-chat-minimized-to-pet'
const INSPECTED_ELEMENT_ACTION_TARGET_TEXT =
  'Action target: Apply to THIS inspected element only; do not change the rest of the file/page unless explicitly asked.'
const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
const WORKBENCH_BROWSER_OPEN_COMMAND = 'workbench.browser.open'
const DEFAULT_FIXED_VIEW_ICON = {
  type: 'font',
  value: 'ri-layout-grid-line',
  alt: 'Fixed view'
} satisfies IconDefinition

type ChatKitCodeComposerReference = {
  type: 'code'
  path: string
  text: string
  startLine: number
  endLine: number
  language?: string
}

type ChatKitComposerReference = ChatKitCodeComposerReference | ChatKitQuoteReference
type AssistantWorkbenchRequestContext = Omit<AssistantContextSetPayload, 'key' | 'clear'>
type ClawXpertStaticTabId = 'files' | 'terminal' | 'tasks'
type ClawXpertAddableWorkspaceTabKind = ClawXpertStaticTabId | 'browser'
type ClawXpertWorkspaceTabKind = ClawXpertAddableWorkspaceTabKind | 'fixed-view'
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
type ClawXpertFixedViewTab = {
  id: string
  kind: 'fixed-view'
  viewKey: string
  title: string
  icon: IconDefinition | null
}
type ClawXpertWorkspaceTab = ClawXpertToolTab | ClawXpertBrowserTab | ClawXpertFixedViewTab

type ClawXpertConversationPanel = ClawXpertStaticTabId | 'preview' | 'fixed-view'
type ClawXpertBrowserTabChange = Partial<Omit<ClawXpertBrowserTab, 'id' | 'kind'>>
type ClawXpertFixedViewMenuItem = {
  viewKey: string
  title: string
  description: string | null
  icon: IconDefinition | null
  order: number
}
const DEFAULT_BROWSER_ZOOM = 100
const TASKS_WORKSPACE_TAB_ID = 'tasks'
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
    ChatTasksComponent,
    ChatSharedTerminalComponent,
    IconComponent,
    ExtensionHostOutletComponent
  ],
  template: `
    <div [class]="workspaceLayoutClasses()">
      <section [class]="detailPanelShellClasses()" [attr.aria-hidden]="showDetailPanel() ? null : 'true'">
        @if (showDetailPanel()) {
          <div class="flex h-full min-h-0 flex-col overflow-hidden">
            <div data-workspace-tab-header class="flex min-w-0 items-center justify-start gap-1.5 px-2 py-1.5">
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
                @for (tab of workspaceTabs(); track tab.id; let last = $last) {
                  <button
                    z-tab-link
                    type="button"
                    [attr.data-panel-button]="tab.kind === 'browser' ? 'browser' : tab.kind"
                    [attr.data-tab-id]="tab.id"
                    class="group/tab relative flex h-9 min-w-0 items-center gap-2 rounded-xl border-0 bg-transparent pl-2 pr-3 text-sm font-medium text-text-secondary transition-[background-color,color] hover:text-text-primary data-[active=true]:!border-transparent data-[active=true]:!bg-hover-bg data-[active=true]:!text-text-primary"
                    [active]="activeTabId() === tab.id"
                    (click)="selectTab(tab.id)"
                  >
                    <span class="relative flex h-5 w-5 shrink-0 items-center justify-center mr-1">
                      <span
                        class="flex h-5 w-5 items-center justify-center text-text-primary transition-opacity group-hover/tab:opacity-0 group-focus-within/tab:opacity-0"
                      >
                        @switch (tab.kind) {
                          @case ('files') {
                            <i class="ri-folder-3-line shrink-0 text-lg"></i>
                          }
                          @case ('terminal') {
                            <i class="ri-terminal-window-line shrink-0 text-lg"></i>
                          }
                          @case ('tasks') {
                            <i class="ri-calendar-line shrink-0 text-lg"></i>
                          }
                          @case ('browser') {
                            <i class="ri-global-line shrink-0 text-lg"></i>
                          }
                          @case ('fixed-view') {
                            <xp-icon
                              [icon]="tab.icon ?? defaultFixedViewIcon"
                              [size]="18"
                              class="shrink-0 text-text-primary"
                            />
                          }
                        }
                      </span>
                      <span
                        role="button"
                        tabindex="0"
                        [attr.data-close-tab]="tab.id"
                        class="absolute inset-0 flex h-4 w-4 m-auto shrink-0 items-center justify-center rounded-full bg-text-tertiary text-components-card-bg opacity-0 transition-[background-color,opacity] hover:bg-text-secondary group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
                        (click)="closeWorkspaceTab($event, tab.id)"
                        (keydown.enter)="closeWorkspaceTab($event, tab.id)"
                        (keydown.space)="closeWorkspaceTab($event, tab.id)"
                      >
                        <i class="ri-close-line text-sm"></i>
                      </span>
                    </span>
                    @switch (tab.kind) {
                      @case ('files') {
                        <span class="truncate">{{ 'PAC.Chat.ClawXpert.Files' | translate: { Default: 'Files' } }}</span>
                      }
                      @case ('terminal') {
                        <span class="truncate">
                          {{ 'PAC.Chat.ClawXpert.Terminal' | translate: { Default: 'Terminal' } }}
                        </span>
                      }
                      @case ('tasks') {
                        <span class="truncate">{{ 'PAC.Chat.Tasks' | translate: { Default: 'Tasks' } }}</span>
                      }
                      @case ('browser') {
                        <span class="max-w-[12rem] truncate">
                          {{ tab.displayUrl || ('PAC.Chat.ClawXpert.Browser' | translate: { Default: 'Browser' }) }}
                        </span>
                      }
                      @case ('fixed-view') {
                        <span class="max-w-[12rem] truncate">
                          {{ tab.title }}
                        </span>
                      }
                    }

                    @if (!last) {
                      <div class="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-hover-bg"></div>
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
                class="flex !h-9 !w-9 shrink-0 items-center justify-center rounded-xl bg-hover-bg text-text-secondary transition-[background-color,color] hover:text-text-primary"
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
                  @if (fixedViewMenuVisible()) {
                    <div class="my-1 border-t border-divider-regular"></div>
                    <div class="px-2 py-1 text-xs font-medium text-text-tertiary">
                      {{ 'PAC.Chat.ClawXpert.FixedViews' | translate: { Default: 'Fixed Views' } }}
                    </div>
                    @if (loadingFixedViews()) {
                      <button type="button" z-menu-item disabled data-fixed-views-loading>
                        <span class="flex items-center gap-2 text-text-tertiary">
                          <i class="ri-loader-4-line text-base"></i>
                          <span>
                            {{
                              'PAC.Chat.ClawXpert.LoadingFixedViews' | translate: { Default: 'Loading fixed views...' }
                            }}
                          </span>
                        </span>
                      </button>
                    } @else if (fixedViewError()) {
                      <button type="button" z-menu-item disabled data-fixed-views-error>
                        <span class="flex items-center gap-2 text-text-tertiary">
                          <i class="ri-error-warning-line text-base"></i>
                          <span>
                            {{
                              'PAC.Chat.ClawXpert.FixedViewsLoadFailed'
                                | translate: { Default: 'Failed to load fixed views' }
                            }}
                          </span>
                        </span>
                      </button>
                    } @else {
                      @for (fixedView of fixedViewMenuItems(); track fixedView.viewKey) {
                        <button
                          type="button"
                          z-menu-item
                          data-add-fixed-view-tab
                          [attr.data-fixed-view-key]="fixedView.viewKey"
                          (click)="openFixedViewTab(fixedView)"
                        >
                          <span class="flex min-w-0 items-center gap-2">
                            <xp-icon
                              [icon]="fixedView.icon ?? defaultFixedViewIcon"
                              [size]="16"
                              class="shrink-0 text-text-primary"
                            />
                            <span class="min-w-0 truncate">{{ fixedView.title }}</span>
                          </span>
                        </button>
                      }
                    }
                  }
                </div>
              </ng-template>

              <div class="ml-auto flex shrink-0 items-center justify-end">
                <button
                  z-button
                  type="button"
                  zType="ghost"
                  zSize="icon"
                  data-open-tasks-panel
                  class="flex !h-9 !w-12 items-center justify-center rounded-2xl text-text-secondary transition-[background-color,color] hover:bg-hover-bg hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
                  [class.bg-hover-bg]="activeTab()?.kind === 'tasks'"
                  [class.text-text-primary]="activeTab()?.kind === 'tasks'"
                  [disabled]="!facade.xpertId()"
                  [title]="'PAC.Chat.Tasks' | translate: { Default: 'Tasks' }"
                  (click)="openTasksTab()"
                >
                  <i class="ri-calendar-line text-lg"></i>
                </button>
              </div>
            </div>

            <z-tab-nav-panel #tabPanel class="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                    @for (fixedView of fixedViewMenuItems(); track fixedView.viewKey) {
                      <button
                        type="button"
                        data-empty-workspace-card="fixed-view"
                        [attr.data-fixed-view-key]="fixedView.viewKey"
                        class="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-background-default-subtle p-6 text-center transition-colors hover:bg-hover-bg"
                        (click)="openFixedViewTab(fixedView)"
                      >
                        <xp-icon
                          [icon]="fixedView.icon ?? defaultFixedViewIcon"
                          [size]="32"
                          class="text-text-tertiary"
                        />
                        <div class="mt-4 text-xl font-semibold text-text-primary">
                          {{ fixedView.title }}
                        </div>
                        <div class="mt-2 text-lg text-text-secondary">
                          {{
                            fixedView.description ||
                              ('PAC.Chat.ClawXpert.FixedViews' | translate: { Default: 'Fixed Views' })
                          }}
                        </div>
                      </button>
                    }
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
                          'PAC.Chat.ClawXpert.TerminalLauncherDesc' | translate: { Default: 'Launch interactive shell' }
                        }}
                      </div>
                    </button>
                  </div>
                </div>
              } @else if (activeFixedViewTab(); as fixedViewTab) {
                @if (fixedViewHostId(); as hostId) {
                  <xp-extension-host-outlet
                    class="block h-full min-h-0 overflow-hidden"
                    mode="single-view"
                    hostType="agent"
                    [hostId]="hostId"
                    [slot]="agentWorkbenchFixedSlot"
                    [viewKey]="fixedViewTab.viewKey"
                    [fillAvailableHeight]="true"
                  />
                } @else {
                  <div
                    class="flex h-full min-h-[24rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary"
                  >
                    {{ 'PAC.Chat.ClawXpert.NoFixedViews' | translate: { Default: 'No fixed views' } }}
                  </div>
                }
              } @else if (activeTab()?.kind === 'tasks') {
                <div class="h-full min-h-0 overflow-hidden px-4 py-3">
                  <pac-chat-tasks
                    class="block h-full min-h-0"
                    [embedded]="true"
                    [xpertId]="facade.xpertId()"
                    (tasksChanged)="handleTasksChanged()"
                    (conversationSelected)="openTaskHistoryConversation($event)"
                  />
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
                  <div class="block h-full p-2">
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
                      class="h-full p-2 pr-0"
                      [conversationId]="resolvedConversationId()"
                      [xpertId]="facade.xpertId()"
                      [mode]="'editable'"
                      [reloadKey]="fileListReloadKey()"
                      (referenceRequest)="handleWorkspaceReference($event)"
                    />
                  } @else if (activeTab()?.kind === 'browser') {
                    <pac-clawxpert-conversation-preview
                      class="h-full p-2 pr-0"
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
  readonly #viewExtensionApi = inject(ViewExtensionApiService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #clientCommands = inject(ViewClientCommandRegistry)
  readonly #hostEvents = inject(ViewHostEventBus)
  readonly #responseActive = signal(false)
  #unregisterAssistantCommand: (() => void) | null = null
  #unregisterAssistantContextCommand: (() => void) | null = null
  #unregisterBrowserOpenCommand: (() => void) | null = null
  #workspaceFileRefreshTimer: ReturnType<typeof setTimeout> | null = null
  #fixedViewsLoadVersion = 0
  #fixedViewsHostId: string | null = null

  readonly #providedFacade = inject(WORKBENCH_CHAT_FACADE, { optional: true })
  readonly facade: WorkbenchChatFacade = this.#providedFacade ?? inject(ClawXpertFacade)
  readonly #assistantWorkbenchContexts = signal<Record<string, AssistantWorkbenchRequestContext>>({})
  readonly assistantRequestContext = computed(() =>
    buildAssistantRequestContext({
      workspaceId: getOptionalSignalValue(this.facade, 'currentWorkspaceId'),
      xpertId: this.facade.xpertId(),
      contexts: this.#assistantWorkbenchContexts()
    })
  )
  readonly agentWorkbenchFixedSlot = AGENT_WORKBENCH_FIXED_SLOT
  readonly defaultFixedViewIcon = DEFAULT_FIXED_VIEW_ICON
  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => (this.facade.viewState() === 'ready' ? this.facade.identity() : null)),
    assistantId: this.facade.assistantId,
    frameUrl: this.facade.chatkitFrameUrl,
    requestContext: this.assistantRequestContext,
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
      const toolCompletedEvent = createAssistantToolCompletedHostEvent(event, {
        hostType: 'agent',
        hostId: this.facade.xpertId(),
        threadId: this.facade.threadId()
      })
      if (toolCompletedEvent) {
        console.info('[view-extension] publishing assistant tool completed host event', {
          toolName: toolCompletedEvent.toolName,
          hostType: toolCompletedEvent.hostType,
          hostId: toolCompletedEvent.hostId,
          threadId: toolCompletedEvent.threadId
        })
        this.#hostEvents.publish(toolCompletedEvent)
      }
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
  readonly fixedViewTabs = computed<ClawXpertFixedViewTab[]>(() =>
    this.workspaceTabs().filter((tab): tab is ClawXpertFixedViewTab => tab.kind === 'fixed-view')
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
  readonly activeFixedViewTab = computed(() => {
    const tab = this.activeTab()
    return tab?.kind === 'fixed-view' ? tab : null
  })
  readonly activePanel = computed<ClawXpertConversationPanel | null>(() => {
    const tab = this.activeTab()
    if (!tab) {
      return null
    }

    return tab.kind === 'browser' ? 'preview' : tab.kind
  })
  readonly fixedViewHostId = computed(() => (this.facade.viewState() === 'ready' ? this.facade.xpertId() : null))
  readonly loadingFixedViews = signal(false)
  readonly fixedViewError = signal<string | null>(null)
  readonly fixedViewMenuItems = signal<ClawXpertFixedViewMenuItem[]>([])
  readonly fixedViewMenuVisible = computed(
    () => this.loadingFixedViews() || Boolean(this.fixedViewError()) || this.fixedViewMenuItems().length > 0
  )
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
      ? 'rounded-2xl bg-components-card-bg shadow-sm border border-border'
      : ''
  )

  constructor() {
    this.#unregisterAssistantCommand = registerAssistantChatSendMessageCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => this.facade.viewState() === 'ready',
      unavailableMessage: 'Current Assistant ChatKit is not ready.'
    })
    this.#unregisterAssistantContextCommand = registerAssistantContextSetCommand(this.#clientCommands, {
      setContext: (key, context) => {
        this.setAssistantWorkbenchContext(key, context)
      }
    })
    this.#unregisterBrowserOpenCommand = this.#clientCommands.register(WORKBENCH_BROWSER_OPEN_COMMAND, (payload) => {
      const target = toWorkbenchBrowserPreviewTarget(payload)
      if (!target) {
        return {
          success: false,
          code: 'invalid_payload',
          message: 'Workbench browser preview payload must include a URL.'
        }
      }

      const tab = this.openBrowserTabFromSandboxEvent(target)
      return {
        success: true,
        tabId: tab.id,
        url: tab.url ?? tab.displayUrl
      }
    })

    effect((onCleanup) => {
      const hostId = this.fixedViewHostId()
      if (!hostId) {
        this.#fixedViewsHostId = null
        this.resetFixedViews(true)
        return
      }

      if (this.#fixedViewsHostId !== hostId) {
        this.#fixedViewsHostId = hostId
        this.resetFixedViews(true)
      }

      let cancelled = false
      void this.loadFixedViews(hostId, () => cancelled)

      onCleanup(() => {
        cancelled = true
      })
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
    this.#unregisterAssistantContextCommand?.()
    this.#unregisterAssistantContextCommand = null
    this.#unregisterBrowserOpenCommand?.()
    this.#unregisterBrowserOpenCommand = null
    this.clearScheduledWorkspaceFileListRefresh()
    this.#responseActive.set(false)
    this.isChatMinimizedToPet.set(false)
    this.facade.setActiveConversation(null)
  }

  private setAssistantWorkbenchContext(key: string, context: AssistantWorkbenchRequestContext | null) {
    const normalizedKey = key.trim()
    if (!normalizedKey || normalizedKey === 'env') {
      return
    }

    this.#assistantWorkbenchContexts.update((current) => {
      if (!context) {
        if (!current[normalizedKey]) {
          return current
        }

        const next = { ...current }
        delete next[normalizedKey]
        return next
      }

      const normalizedContext = normalizeAssistantWorkbenchContext(context)
      return {
        ...current,
        [normalizedKey]: normalizedContext
      }
    })
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

  selectPanel(panel: ClawXpertStaticTabId | 'preview') {
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

  addWorkspaceTab(kind: ClawXpertAddableWorkspaceTabKind) {
    if (kind === 'browser') {
      return this.addBrowserTab()
    }
    if (kind === 'tasks') {
      return this.openTasksTab()
    }

    const tab: ClawXpertToolTab = {
      id: this.createWorkspaceTabId(kind),
      kind
    }

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activeTabId.set(tab.id)
    return tab
  }

  openTasksTab() {
    const existing = this.workspaceTabs().find((tab) => tab.kind === 'tasks')
    if (existing) {
      this.activeTabId.set(existing.id)
      return existing
    }

    const tab: ClawXpertToolTab = {
      id: TASKS_WORKSPACE_TAB_ID,
      kind: 'tasks'
    }

    this.workspaceTabs.update((tabs) => [...tabs, tab])
    this.activeTabId.set(tab.id)
    return tab
  }

  handleTasksChanged() {
    if (hasTaskSummaryRefresh(this.facade)) {
      this.facade.refreshTaskSummaries()
    }
  }

  async openTaskHistoryConversation(conversation: IChatConversation) {
    const threadId = normalizeConversationThreadId(conversation.threadId)
    if (!threadId) {
      this.#toastr.error(
        this.#translate.instant('PAC.Chat.ClawXpert.TaskHistoryThreadMissing', {
          Default: 'This task history record has no conversation thread.'
        })
      )
      return
    }

    const control = this.control()
    if (!control) {
      this.#toastr.error(
        this.#translate.instant('PAC.Chat.ClawXpert.ChatkitUnavailable', {
          Default: 'Chat is not ready yet.'
        })
      )
      return
    }

    try {
      this.isChatMinimizedToPet.set(false)
      if (conversation.id) {
        this.syncResolvedConversation(conversation.id, conversation)
      }
      await control.setThreadId(threadId)
      this.facade.onChatThreadChange(threadId)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to open task history conversation.')
    }
  }

  openFixedViewTab(fixedView: ClawXpertFixedViewMenuItem) {
    const existing = this.fixedViewTabs().find((tab) => tab.viewKey === fixedView.viewKey)
    if (existing) {
      this.activeTabId.set(existing.id)
      return existing
    }

    const tab = this.createFixedViewTab(fixedView)

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

  private async loadFixedViews(hostId: string, isCancelled: () => boolean) {
    const version = ++this.#fixedViewsLoadVersion
    this.loadingFixedViews.set(true)
    this.fixedViewError.set(null)

    try {
      const manifests = await firstValueFrom(
        this.#viewExtensionApi.getSlotViews('agent', hostId, AGENT_WORKBENCH_FIXED_SLOT)
      )
      if (isCancelled() || version !== this.#fixedViewsLoadVersion || this.#fixedViewsHostId !== hostId) {
        return
      }

      const items = manifests
        .filter((manifest) => shouldShowFixedViewInMenu(manifest))
        .map((manifest) => this.toFixedViewMenuItem(manifest))
        .sort((a, b) => a.order - b.order)

      this.fixedViewMenuItems.set(items)
      this.syncFixedViewTabs(items)
    } catch (error) {
      if (isCancelled() || version !== this.#fixedViewsLoadVersion || this.#fixedViewsHostId !== hostId) {
        return
      }

      this.fixedViewError.set(getErrorMessage(error) || 'Failed to load fixed views')
      this.fixedViewMenuItems.set([])
    } finally {
      if (!isCancelled() && version === this.#fixedViewsLoadVersion && this.#fixedViewsHostId === hostId) {
        this.loadingFixedViews.set(false)
      }
    }
  }

  private resetFixedViews(removeTabs: boolean) {
    this.#fixedViewsLoadVersion += 1
    this.loadingFixedViews.set(false)
    this.fixedViewError.set(null)
    this.fixedViewMenuItems.set([])
    if (removeTabs) {
      this.removeFixedViewTabs()
    }
  }

  private removeFixedViewTabs() {
    const tabs = this.workspaceTabs()
    if (!tabs.some((tab) => tab.kind === 'fixed-view')) {
      return
    }

    const nextTabs = tabs.filter((tab) => tab.kind !== 'fixed-view')
    this.workspaceTabs.set(nextTabs)
    if (!nextTabs.some((tab) => tab.id === this.activeTabId())) {
      this.activeTabId.set(nextTabs[0]?.id ?? '')
    }
  }

  private syncFixedViewTabs(items: ClawXpertFixedViewMenuItem[]) {
    const itemByViewKey = new Map(items.map((item) => [item.viewKey, item]))
    const tabs = this.workspaceTabs()
    const fixedTabsByViewKey = new Map(
      tabs.filter((tab): tab is ClawXpertFixedViewTab => tab.kind === 'fixed-view').map((tab) => [tab.viewKey, tab])
    )
    const nextFixedTabs = items.map((item) => {
      const tab = fixedTabsByViewKey.get(item.viewKey)
      if (!tab) {
        return this.createFixedViewTab(item)
      }

      if (tab.title === item.title && tab.icon === item.icon) {
        return tab
      }

      return {
        ...tab,
        title: item.title,
        icon: item.icon
      }
    })
    const nextNonFixedTabs = tabs.filter(
      (tab) => tab.kind !== 'fixed-view' && !(items.length > 0 && isInitialWorkspaceTab(tab))
    )
    const nextTabs: ClawXpertWorkspaceTab[] =
      items.length > 0 ? [...nextFixedTabs, ...nextNonFixedTabs] : tabs.filter((tab) => tab.kind !== 'fixed-view')
    const changed =
      nextTabs.length !== tabs.length ||
      nextTabs.some((tab, index) => tab !== tabs[index]) ||
      tabs.some((tab) => tab.kind === 'fixed-view' && !itemByViewKey.has(tab.viewKey))

    if (changed) {
      this.workspaceTabs.set(nextTabs)
    }

    const activeTabId = this.activeTabId()
    if (
      !nextTabs.some((tab) => tab.id === activeTabId) ||
      isInitialWorkspaceTab(tabs.find((tab) => tab.id === activeTabId))
    ) {
      this.activeTabId.set(nextFixedTabs[0]?.id ?? nextTabs[0]?.id ?? '')
    }
  }

  private createFixedViewTab(fixedView: ClawXpertFixedViewMenuItem): ClawXpertFixedViewTab {
    return {
      id: `fixed-view-${fixedView.viewKey}`,
      kind: 'fixed-view',
      viewKey: fixedView.viewKey,
      title: fixedView.title,
      icon: fixedView.icon
    }
  }

  private toFixedViewMenuItem(manifest: XpertExtensionViewManifest): ClawXpertFixedViewMenuItem {
    const menu = manifest.workbench?.menu
    return {
      viewKey: manifest.key,
      title: resolveI18nText(menu?.label ?? manifest.title, manifest.key, this.#translate.currentLang),
      description: resolveI18nText(manifest.description, '', this.#translate.currentLang) || null,
      icon: menu?.icon ?? manifest.icon ?? null,
      order: menu?.order ?? manifest.order ?? Number.MAX_SAFE_INTEGER
    }
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

function toWorkbenchBrowserPreviewTarget(payload: unknown): ClawXpertSandboxPreviewTarget | null {
  if (typeof payload === 'string' && payload.trim()) {
    const url = payload.trim()
    return {
      displayUrl: url,
      url
    }
  }

  if (!isPreviewPayloadRecord(payload)) {
    return null
  }

  const url =
    readPreviewPayloadString(payload, 'url') ??
    readPreviewPayloadString(payload, 'displayUrl') ??
    readPreviewPayloadString(payload, 'deploymentUrl') ??
    readPreviewPayloadString(payload, 'previewUrl')
  if (!url) {
    return null
  }

  return {
    displayUrl: readPreviewPayloadString(payload, 'displayUrl') ?? url,
    url
  }
}

function readPreviewPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isPreviewPayloadRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function shouldShowFixedViewInMenu(manifest: XpertExtensionViewManifest) {
  if (manifest.visible === false) {
    return false
  }
  if (manifest.workbench?.fixed === false) {
    return false
  }
  return manifest.workbench?.menu?.enabled !== false
}

function isInitialWorkspaceTab(tab: ClawXpertWorkspaceTab | undefined) {
  return tab?.kind === INITIAL_WORKSPACE_TAB.kind && tab.id === INITIAL_WORKSPACE_TAB.id
}

function hasTaskSummaryRefresh(
  facade: WorkbenchChatFacade
): facade is WorkbenchChatFacade & { refreshTaskSummaries(): void } {
  return 'refreshTaskSummaries' in facade && typeof facade.refreshTaskSummaries === 'function'
}

function getOptionalSignalValue<T extends string>(facade: WorkbenchChatFacade, key: T): string | null {
  const value = (facade as WorkbenchChatFacade & Record<T, Signal<unknown> | undefined>)[key]
  if (typeof value !== 'function') {
    return null
  }
  return getString(value()) ?? null
}

function buildAssistantRequestContext(input: {
  workspaceId: string | null
  xpertId: string | null
  contexts: Record<string, AssistantWorkbenchRequestContext>
}) {
  const env: Record<string, string> = {}
  if (input.workspaceId) {
    env['workspaceId'] = input.workspaceId
  }
  if (input.xpertId) {
    env['xpertId'] = input.xpertId
  }

  const requestContext: Record<string, unknown> = {}
  for (const [key, context] of Object.entries(input.contexts)) {
    Object.assign(env, normalizeAssistantEnv(context.env))
    if (isRecord(context.context)) {
      requestContext[key] = context.context
    }
  }

  if (Object.keys(env).length) {
    requestContext['env'] = env
  }

  return requestContext
}

function normalizeAssistantWorkbenchContext(
  context: AssistantWorkbenchRequestContext
): AssistantWorkbenchRequestContext {
  const env = normalizeAssistantEnv(context.env)
  const structuredContext = isRecord(context.context) ? context.context : undefined
  return {
    ...(Object.keys(env).length ? { env } : {}),
    ...(structuredContext ? { context: structuredContext } : {})
  }
}

function normalizeAssistantEnv(env: unknown): Record<string, string> {
  if (!isRecord(env)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key, getString(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveI18nText(value: string | I18nObject | null | undefined, fallback: string, language?: string | null) {
  if (typeof value === 'string') {
    return value.trim() || fallback
  }
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const normalizedLanguage = (language ?? '').toLowerCase()
  const preferredKeys =
    normalizedLanguage.includes('hant') || normalizedLanguage.includes('tw')
      ? ['zh_Hant', 'zh_Hans', 'en_US']
      : normalizedLanguage.startsWith('zh')
        ? ['zh_Hans', 'zh_Hant', 'en_US']
        : ['en_US', 'zh_Hans', 'zh_Hant']

  for (const key of preferredKeys) {
    const text = Reflect.get(value, key)
    if (typeof text === 'string' && text.trim()) {
      return text.trim()
    }
  }

  for (const text of Object.values(value)) {
    if (typeof text === 'string' && text.trim()) {
      return text.trim()
    }
  }

  return fallback
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

function normalizeConversationThreadId(threadId: string | null | undefined) {
  return typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null
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
