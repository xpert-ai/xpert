import { CommonModule } from '@angular/common'
import { BreakpointObserver } from '@angular/cdk/layout'
import { Component, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { DestroyRef } from '@angular/core'
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { map, distinctUntilChanged } from 'rxjs'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectChatPanelComponent } from './project-chat-panel.component'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '@cloud/app/@shared/view-extension/view-client-command-registry.service'
import { toSendUserMessageParams } from '../assistant/assistant-chat-client-command'

@Component({
  standalone: true,
  selector: 'xp-project-shell',
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    EmojiAvatarComponent,
    XpertProjectChatPanelComponent,
    ...ZardCardImports
  ],
  template: `
    <div
      class="xp-project-shell relative flex h-full min-h-full min-w-0 overflow-hidden bg-background"
      [class.cursor-col-resize]="chatPanelResizing()"
      [class.select-none]="chatPanelResizing()"
    >
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <header class="sticky top-0 z-30 shrink-0 border-b border-divider-subtle bg-components-card-bg">
          <div class="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div class="flex min-w-0 items-center gap-3">
              <a
                z-button
                zType="ghost"
                zSize="sm"
                routerLink="/project"
                [attr.aria-label]="'XP.XProject.BackToProjects' | translate"
                ><i class="ri-arrow-left-line"></i
              ></a>
              <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                ><i class="ri-share-line"></i
              ></span>
              <div class="min-w-0">
                <h1 class="truncate text-sm font-semibold text-text-primary">
                  {{ facade.project()?.name || ('XP.XProject.ProjectFallback' | translate) }}
                </h1>
                <p class="truncate text-xs text-text-tertiary">
                  {{ facade.project()?.description || ('XP.XProject.ProjectWorkspace' | translate) }}
                </p>
              </div>
              @if (facade.project()?.status) {
                <z-badge zType="outline">{{
                  'XP.XProject.ProjectStatusValue.' + facade.project()?.status | translate
                }}</z-badge>
              }
              @if (facade.project()?.settings?.managementMode; as managementMode) {
                <z-badge zType="secondary">{{
                  'XP.XProject.' + (managementMode === 'advanced' ? 'AdvancedMode' : 'SimpleMode') | translate
                }}</z-badge>
              }
            </div>
            <button
              z-button
              zType="outline"
              zSize="sm"
              type="button"
              [class.bg-hover-bg]="chatPanelOpen()"
              [attr.aria-expanded]="chatPanelOpen()"
              (click)="toggleChatPanel()"
            >
              <i class="ri-team-line mr-1"></i>{{ 'XP.XProject.ProjectExperts' | translate }}
            </button>
          </div>
          <nav
            class="flex w-full gap-1 overflow-x-auto px-4 sm:px-6"
            [attr.aria-label]="'XP.XProject.ProjectNavigation' | translate"
          >
            @for (tab of tabs; track tab.path) {
              <a
                class="whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors hover:text-text-primary"
                [routerLink]="tab.path ? ['/project', id(), tab.path] : ['/project', id()]"
                queryParamsHandling="preserve"
                routerLinkActive
                #tabActive="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: tab.path === '' }"
                [class.border-transparent]="!tabActive.isActive"
                [class.border-primary-500]="tabActive.isActive"
                [class.text-text-secondary]="!tabActive.isActive"
                [class.text-text-primary]="tabActive.isActive"
                [class.font-medium]="tabActive.isActive"
                [attr.aria-current]="tabActive.isActive ? 'page' : null"
                >{{ tab.label | translate }}</a
              >
            }
          </nav>
        </header>
        <div class="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch">
          <main class="h-full min-h-0 min-w-0 flex-1 overflow-y-auto"><router-outlet /></main>
          @if (!chatPanelOpen()) {
            <aside
              class="sticky top-0 hidden h-full min-h-0 w-[21rem] shrink-0 self-stretch border-l border-divider-subtle bg-background-body xl:block"
            >
              <div class="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-5">
                <header class="px-1">
                  <div class="min-w-0">
                    <p class="text-xs font-medium uppercase tracking-[0.12em] text-text-tertiary">
                      {{ 'XP.XProject.Governance' | translate }}
                    </p>
                    <h2 class="mt-1 truncate text-lg font-semibold text-text-primary">
                      {{ 'XP.XProject.ProjectConfiguration' | translate }}
                    </h2>
                  </div>
                </header>

                <div class="mt-5 space-y-3">
                  <section
                    class="rounded-2xl border border-divider-regular bg-components-card-bg p-4"
                    aria-labelledby="project-command-card"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <h3 id="project-command-card" class="text-base font-semibold text-text-primary">
                        {{ 'XP.XProject.Instruction' | translate }}
                      </h3>
                      @if (canEditProjectContent()) {
                        <a
                          z-button
                          zType="ghost"
                          zSize="sm"
                          [routerLink]="['/project', id(), 'config']"
                          [attr.aria-label]="'XP.XProject.Edit' | translate"
                          [title]="'XP.XProject.Edit' | translate"
                        >
                          <i class="ri-add-line"></i>
                        </a>
                      }
                    </div>
                    @if (facade.projectInstruction().trim(); as instruction) {
                      <p class="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-6 text-text-secondary">
                        {{ instruction }}
                      </p>
                    } @else {
                      <p class="mt-3 text-sm leading-6 text-text-tertiary">
                        {{ 'XP.XProject.ProjectInstructionPanelEmpty' | translate }}
                      </p>
                    }
                  </section>

                  <section
                    class="rounded-2xl border border-divider-regular bg-components-card-bg p-4"
                    aria-labelledby="project-connectors-card"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex min-w-0 items-center gap-2">
                        <h3 id="project-connectors-card" class="text-base font-semibold text-text-primary">
                          {{ 'XP.XProject.Connectors' | translate }}
                        </h3>
                      </div>
                      <a
                        z-button
                        zType="ghost"
                        zSize="sm"
                        [routerLink]="['/project', id(), 'config']"
                        [attr.aria-label]="'XP.XProject.ManageProjectConnectors' | translate"
                        [title]="'XP.XProject.ManageProjectConnectors' | translate"
                      >
                        <i class="ri-add-line"></i>
                      </a>
                    </div>
                    <p class="mt-4 text-sm text-text-tertiary">
                      {{ 'XP.XProject.ProjectConnectorsPanelHint' | translate }}
                    </p>
                  </section>

                  <section
                    class="rounded-2xl border border-divider-regular bg-components-card-bg p-4"
                    aria-labelledby="project-experts-card"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex min-w-0 items-center gap-2">
                        <h3 id="project-experts-card" class="text-base font-semibold text-text-primary">
                          {{ 'XP.XProject.ProjectExperts' | translate }}
                        </h3>
                        <span class="text-sm text-text-tertiary">{{ projectExperts().length }}</span>
                      </div>
                      @if (canManageProject()) {
                        <a
                          z-button
                          zType="ghost"
                          zSize="sm"
                          [routerLink]="['/project', id(), 'config']"
                          [attr.aria-label]="'XP.XProject.ManageExperts' | translate"
                          [title]="'XP.XProject.ManageExperts' | translate"
                        >
                          <i class="ri-add-line"></i>
                        </a>
                      }
                    </div>
                    @if (projectExperts().length) {
                      <div class="mt-4 flex flex-wrap gap-2">
                        @for (expert of projectExperts().slice(0, 5); track expert.id) {
                          <emoji-avatar
                            [avatar]="expert.avatar"
                            [fallbackLabel]="expert.title || expert.name"
                            small
                            class="size-10 overflow-hidden rounded-xl border border-divider-subtle"
                            [title]="expert.title || expert.name"
                          />
                        }
                      </div>
                    } @else {
                      <p class="mt-4 text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectExperts' | translate }}</p>
                    }
                  </section>

                  <section
                    class="rounded-2xl border border-divider-regular bg-components-card-bg p-4"
                    aria-labelledby="project-skills-card"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex min-w-0 items-center gap-2">
                        <h3 id="project-skills-card" class="text-base font-semibold text-text-primary">
                          {{ 'XP.XProject.Skills' | translate }}
                        </h3>
                      </div>
                      @if (canEditProjectContent()) {
                        <a
                          z-button
                          zType="ghost"
                          zSize="sm"
                          [routerLink]="['/project', id(), 'config']"
                          [attr.aria-label]="'XP.XProject.ManageProjectSkills' | translate"
                          [title]="'XP.XProject.ManageProjectSkills' | translate"
                        >
                          <i class="ri-add-line"></i>
                        </a>
                      }
                    </div>
                    <p class="mt-4 text-sm text-text-tertiary">
                      {{ 'XP.XProject.ProjectSkillsPanelHint' | translate }}
                    </p>
                  </section>

                  <section
                    class="rounded-2xl border border-divider-regular bg-components-card-bg p-4"
                    aria-labelledby="project-automation-card"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex min-w-0 items-center gap-2">
                        <h3 id="project-automation-card" class="text-base font-semibold text-text-primary">
                          {{ 'XP.XProject.Automations' | translate }}
                        </h3>
                        <span class="text-sm text-text-tertiary">{{ facade.scheduledTasks().length }}</span>
                      </div>
                      @if (canManageProject()) {
                        <a
                          z-button
                          zType="ghost"
                          zSize="sm"
                          [routerLink]="['/project', id(), 'config']"
                          [attr.aria-label]="'XP.XProject.AddAutomation' | translate"
                          [title]="'XP.XProject.AddAutomation' | translate"
                        >
                          <i class="ri-add-line"></i>
                        </a>
                      }
                    </div>
                    <p class="mt-4 text-sm text-text-tertiary">{{ 'XP.XProject.AutomationPanelHint' | translate }}</p>
                  </section>

                  <div class="grid grid-cols-3 gap-2 border-t border-divider-subtle px-1 pt-4 text-center">
                    <div>
                      <p class="text-lg font-semibold text-text-primary">{{ facade.tasks().length }}</p>
                      <p class="text-xs text-text-tertiary">{{ 'XP.XProject.TasksLabel' | translate }}</p>
                    </div>
                    <div>
                      <p class="text-lg font-semibold text-text-primary">{{ facade.assetCount() }}</p>
                      <p class="text-xs text-text-tertiary">{{ 'XP.XProject.AssetsLabel' | translate }}</p>
                    </div>
                    <div>
                      <p class="text-lg font-semibold text-text-primary">
                        {{ facade.project()?.members?.length || 0 }}
                      </p>
                      <p class="text-xs text-text-tertiary">{{ 'XP.XProject.MembersLabel' | translate }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          }
        </div>
      </div>
      @if (chatPanelOpen()) {
        <aside
          class="fixed bottom-3 right-3 z-50 h-[min(78vh,44rem)] max-w-[calc(100vw-1.5rem)] shrink-0 border-divider-subtle lg:sticky lg:top-0 lg:h-full lg:max-h-none lg:max-w-none lg:border-l lg:shadow-sm"
          [style.width.px]="chatPanelWidth()"
        >
          <xp-project-chat-panel
            [project]="facade.project()"
            [projectId]="id()"
            [assistantKey]="chatAssistantKey()"
            [eligibleAssistantIds]="chatEligibleAssistantIds()"
            [initialThreadId]="chatThreadId()"
            [floating]="isNarrow()"
            [resizeMinWidth]="chatPanelMinWidth"
            [resizeMaxWidth]="chatPanelMaxWidth"
            [resizeWidth]="chatPanelWidth()"
            (resizeStart)="startChatPanelResize($event.event, $event.panel, $event.handle)"
            (resizeLost)="onChatPanelResizeLostPointerCapture()"
            (resizeKeydown)="onChatPanelResizeKeydown($event)"
            (closed)="closeChatPanel()"
            (expertChanged)="onChatExpertChanged($event)"
            (threadChanged)="onChatThreadChanged($event)"
          />
        </aside>
      }
      @if (facade.projectLoading()) {
        <div class="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-[1px]">
          <div
            class="flex items-center gap-2 rounded-md border border-divider-subtle bg-components-card-bg px-4 py-3 text-sm text-text-secondary shadow-sm"
          >
            <i class="ri-loader-4-line animate-spin text-primary"></i>
            <span>{{ 'XP.XProject.LoadingProject' | translate }}</span>
          </div>
        </div>
      } @else if (facade.projectError(); as error) {
        <div class="absolute inset-0 z-40 flex items-center justify-center bg-background/80 px-4 backdrop-blur-[1px]">
          <div
            class="flex max-w-md flex-col items-center gap-3 rounded-md border border-text-destructive bg-components-card-bg px-5 py-4 text-center shadow-sm"
          >
            <i class="ri-error-warning-line text-2xl text-text-destructive"></i>
            <p class="text-sm text-text-destructive">{{ error }}</p>
            <button z-button zType="outline" type="button" (click)="retryProject()">
              {{ 'XP.XProject.RetryProject' | translate }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  host: { class: 'block min-h-full w-full min-w-0' }
})
export class XpertProjectShellComponent implements OnDestroy, OnInit {
  readonly facade = inject(XpertProjectFacade)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #destroyRef = inject(DestroyRef)
  readonly #breakpointObserver = inject(BreakpointObserver)
  readonly #clientCommands = inject(ViewClientCommandRegistry)
  readonly chatPanel = viewChild(XpertProjectChatPanelComponent)
  readonly id = signal(this.#route.snapshot.paramMap.get('id') ?? '')
  readonly isNarrow = toSignal(
    this.#breakpointObserver.observe(['(max-width: 1023px)']).pipe(map((state) => state.matches)),
    { initialValue: false }
  )
  readonly chatPanelOpen = signal(false)
  readonly chatPanelWidth = signal(512)
  readonly chatPanelResizing = signal(false)
  readonly chatPanelMinWidth = 320
  readonly chatPanelMaxWidth = 640
  readonly chatThreadId = signal<string | null>(null)
  readonly chatAssistantKey = signal<string | null>(null)
  readonly chatEligibleAssistantIds = signal<readonly string[] | null>(null)
  readonly projectExperts = computed(() => this.facade.project()?.xperts ?? [])
  readonly canEditProjectContent = computed(() => this.facade.projectAccess()?.capabilities.canEdit ?? false)
  readonly canManageProject = computed(() => this.facade.projectAccess()?.capabilities.canManage ?? false)
  #resizeStartX = 0
  #resizeStartWidth = 0
  #resizePointerId: number | null = null
  #resizeHandle: HTMLElement | null = null
  #resizeMoveListener: ((event: PointerEvent) => void) | null = null
  #resizeEndListener: ((event: PointerEvent) => void) | null = null
  #pendingExpertSelection: ((xpertId: string | null) => void) | null = null
  #unregisterAssistantCommand: (() => void) | null = null
  readonly tabs = [
    { label: 'XP.XProject.Overview', path: '' },
    { label: 'XP.XProject.Plan', path: 'plan' },
    { label: 'XP.XProject.Conversations', path: 'tasks' },
    { label: 'XP.XProject.Assets', path: 'assets' },
    { label: 'XP.XProject.Config', path: 'config' }
  ]

  constructor() {
    this.#unregisterAssistantCommand = this.#clientCommands.register(
      ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
      async (payload, context) => {
        if (context.hostType !== 'project' || context.hostId !== this.id()) {
          return { success: false, code: 'unsupported', message: 'This Project assistant is not available.' }
        }

        const candidates = context.manifest.runtime?.featureProviders ?? []
        if (!candidates.length) {
          return { success: false, code: 'unsupported', message: 'No Project expert provides this capability.' }
        }

        const eligibleIds = candidates.map((candidate) => candidate.xpertId)
        this.chatEligibleAssistantIds.set(eligibleIds)
        const selectedId =
          candidates.length === 1 ? candidates[0].xpertId : await this.selectProjectExpert(eligibleIds)
        if (!selectedId) {
          return { success: false, code: 'cancelled', message: 'Project expert selection was cancelled.' }
        }

        this.chatAssistantKey.set(selectedId)
        this.openChatPanel(selectedId)
        const panel = await this.waitForChatPanel()
        const control = await this.waitForChatControl(panel)
        await control.sendUserMessage(toSendUserMessageParams(payload))
        return { success: true, status: 'sent', xpertId: selectedId }
      }
    )
  }

  ngOnInit() {
    this.#route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        distinctUntilChanged(),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe((id) => {
        this.id.set(id)
        if (id) void this.facade.loadProject(id)
      })
    this.#route.queryParamMap
      .pipe(
        map((params) => params.get('chat') === 'open'),
        distinctUntilChanged(),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe((open) => this.chatPanelOpen.set(open))
    this.#route.queryParamMap
      .pipe(
        map((params) => params.get('threadId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe((threadId) => this.chatThreadId.set(threadId))
    this.#route.queryParamMap
      .pipe(
        map((params) => params.get('xpert')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe((key) => this.chatAssistantKey.set(key))
  }

  retryProject() {
    const projectId = this.id()
    if (projectId) void this.facade.loadProject(projectId)
  }

  ngOnDestroy() {
    this.stopChatPanelResize()
    this.#pendingExpertSelection?.(null)
    this.#pendingExpertSelection = null
    this.#unregisterAssistantCommand?.()
  }

  startChatPanelResize(event: PointerEvent, panel: HTMLElement, handle?: HTMLElement) {
    if (event.button !== 0) return

    const resizeHandle = handle ?? (event.currentTarget as HTMLElement | null)
    if (!resizeHandle) return

    event.preventDefault()
    event.stopPropagation()
    const bounds = this.chatPanelWidthBounds()
    this.#resizeStartX = event.clientX
    this.#resizeStartWidth = panel.getBoundingClientRect().width
    this.chatPanelWidth.set(this.clampChatPanelWidth(this.#resizeStartWidth, bounds))
    this.chatPanelResizing.set(true)
    this.#resizePointerId = event.pointerId
    this.#resizeHandle = resizeHandle
    resizeHandle.setPointerCapture(event.pointerId)

    this.#resizeMoveListener = (moveEvent) => {
      if (moveEvent.pointerId !== this.#resizePointerId) return

      const nextWidth = this.#resizeStartWidth - (moveEvent.clientX - this.#resizeStartX)
      this.chatPanelWidth.set(this.clampChatPanelWidth(nextWidth, bounds))
      moveEvent.preventDefault()
    }
    this.#resizeEndListener = (endEvent) => {
      if (endEvent.pointerId !== this.#resizePointerId) return
      this.stopChatPanelResize()
    }
    document.addEventListener('pointermove', this.#resizeMoveListener)
    document.addEventListener('pointerup', this.#resizeEndListener)
    document.addEventListener('pointercancel', this.#resizeEndListener)
  }

  onChatPanelResizeLostPointerCapture() {
    if (this.#resizePointerId !== null) this.stopChatPanelResize()
  }

  onChatPanelResizeKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 32 : 16
    const delta = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0
    if (!delta) return

    event.preventDefault()
    const bounds = this.chatPanelWidthBounds()
    this.chatPanelWidth.update((width) => this.clampChatPanelWidth(width + delta, bounds))
  }

  private stopChatPanelResize() {
    if (this.#resizeMoveListener) {
      document.removeEventListener('pointermove', this.#resizeMoveListener)
      this.#resizeMoveListener = null
    }
    if (this.#resizeEndListener) {
      document.removeEventListener('pointerup', this.#resizeEndListener)
      document.removeEventListener('pointercancel', this.#resizeEndListener)
      this.#resizeEndListener = null
    }
    const resizeHandle = this.#resizeHandle
    const resizePointerId = this.#resizePointerId
    this.#resizeHandle = null
    this.#resizePointerId = null
    if (resizeHandle && resizePointerId !== null && resizeHandle.hasPointerCapture(resizePointerId)) {
      resizeHandle.releasePointerCapture(resizePointerId)
    }
    this.chatPanelResizing.set(false)
  }

  private chatPanelWidthBounds() {
    const viewportWidth = typeof window === 'undefined' ? this.chatPanelMaxWidth : window.innerWidth
    const viewportMax = Math.max(280, viewportWidth - 24)
    const max = Math.min(this.chatPanelMaxWidth, viewportMax)
    return { min: Math.min(this.chatPanelMinWidth, max), max }
  }

  private clampChatPanelWidth(width: number, bounds: { min: number; max: number }) {
    return Math.round(Math.max(bounds.min, Math.min(bounds.max, width)))
  }

  toggleChatPanel() {
    const open = !this.chatPanelOpen()
    if (open) this.chatEligibleAssistantIds.set(null)
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { chat: open ? 'open' : null },
      queryParamsHandling: 'merge'
    })
  }

  closeChatPanel() {
    if (!this.chatPanelOpen()) return
    this.#pendingExpertSelection?.(null)
    this.#pendingExpertSelection = null
    this.chatEligibleAssistantIds.set(null)
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { chat: null },
      queryParamsHandling: 'merge'
    })
  }

  onChatThreadChanged(threadId: string | null) {
    if (threadId === this.chatThreadId()) return
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { threadId },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }

  onChatExpertChanged(xpertId: string | null) {
    if (this.#pendingExpertSelection && xpertId) {
      const resolve = this.#pendingExpertSelection
      this.#pendingExpertSelection = null
      resolve(xpertId)
    }
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { xpert: xpertId, threadId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }

  private selectProjectExpert(eligibleIds: readonly string[]) {
    this.#pendingExpertSelection?.(null)
    this.chatEligibleAssistantIds.set(eligibleIds)
    this.chatAssistantKey.set(null)
    this.openChatPanel(null)
    return new Promise<string | null>((resolve) => {
      this.#pendingExpertSelection = resolve
    })
  }

  private openChatPanel(xpertId: string | null) {
    this.chatPanelOpen.set(true)
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { chat: 'open', xpert: xpertId, threadId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }

  private async waitForChatPanel() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const panel = this.chatPanel()
      if (panel) return panel
      await nextAnimationFrame()
    }
    throw new Error('Project expert panel did not become available.')
  }

  private async waitForChatControl(panel: XpertProjectChatPanelComponent) {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const control = panel.control()
      if (control) return control
      await nextAnimationFrame()
    }
    throw new Error('Project expert ChatKit did not become ready.')
  }
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}
