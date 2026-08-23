import { CommonModule } from '@angular/common'
import { BreakpointObserver } from '@angular/cdk/layout'
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { DestroyRef } from '@angular/core'
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { ConnectorInstance } from '@xpert-ai/plugin-sdk/connector'
import type { ISkillPackage } from '@xpert-ai/contracts'
import { resolveI18nText } from '@xpert-ai/contracts'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { firstValueFrom, map, distinctUntilChanged } from 'rxjs'
import { SkillPackageService, XpertConnectorService } from '../../@core'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectChatPanelComponent } from './project-chat-panel.component'
import { IconComponent } from '../../@shared/avatar'

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
    IconComponent,
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
          <div class="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
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
              <i class="ri-sparkling-2-line mr-1"></i>{{ 'XP.XProject.ProjectAssistant' | translate }}
            </button>
          </div>
          <nav
            class="mx-auto flex w-full max-w-screen-2xl gap-1 overflow-x-auto px-4 sm:px-6"
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
        <div class="mx-auto flex h-full min-h-0 w-full max-w-screen-2xl min-w-0 flex-1 items-stretch">
          <main class="h-full min-h-0 min-w-0 flex-1 overflow-y-auto"><router-outlet /></main>
          @if (!chatPanelOpen()) {
            <aside
              class="sticky top-0 hidden h-full min-h-0 w-[21rem] shrink-0 self-stretch border-l border-divider-subtle bg-background-body xl:block"
            >
              <div class="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-5">
                <header class="flex items-center justify-between gap-3 px-1">
                  <div class="min-w-0">
                    <p class="text-xs font-medium uppercase tracking-[0.12em] text-text-tertiary">
                      {{ 'XP.XProject.Governance' | translate }}
                    </p>
                    <h2 class="mt-1 truncate text-lg font-semibold text-text-primary">
                      {{ 'XP.XProject.ProjectConfiguration' | translate }}
                    </h2>
                  </div>
                  <a
                    z-button
                    zType="ghost"
                    zSize="sm"
                    [routerLink]="['/project', id(), 'config']"
                    [attr.aria-label]="'XP.XProject.Settings' | translate"
                    [title]="'XP.XProject.Settings' | translate"
                  >
                    <i class="ri-settings-3-line"></i>
                  </a>
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
                    </div>
                    @if (facade.project()?.settings?.instruction?.trim(); as instruction) {
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
                        <span class="text-sm text-text-tertiary">{{ workspaceConnectorCount() }}</span>
                      </div>
                      <a
                        z-button
                        zType="ghost"
                        zSize="sm"
                        [routerLink]="workspaceId() ? ['/xpert/w', workspaceId(), 'connectors'] : null"
                        [attr.aria-label]="'XP.XProject.OpenWorkspaceResources' | translate"
                        [title]="'XP.XProject.OpenWorkspaceResources' | translate"
                      >
                        <i class="ri-add-line"></i>
                      </a>
                    </div>
                    @if (workspaceResourcesLoading() && !workspaceConnectors().length) {
                      <p class="mt-4 text-sm text-text-tertiary">
                        {{ 'XP.XProject.LoadingWorkspaceResources' | translate }}
                      </p>
                    } @else if (workspaceConnectors().length) {
                      <div class="mt-4 flex flex-wrap gap-2">
                        @for (connector of workspaceConnectors().slice(0, 5); track connector.id) {
                          <span
                            class="flex size-10 items-center justify-center rounded-xl border border-divider-subtle bg-background-default-subtle text-sm font-semibold text-text-secondary"
                            [title]="connectorLabel(connector)"
                          >
                            {{ connectorInitial(connector) }}
                          </span>
                        }
                      </div>
                    } @else {
                      <p class="mt-4 text-sm text-text-tertiary">
                        {{ 'XP.XProject.NoConnectorsInWorkspace' | translate }}
                      </p>
                    }
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
                    </div>
                    @if (projectExperts().length) {
                      <div class="mt-4 flex flex-wrap gap-2">
                        @for (expert of projectExperts().slice(0, 5); track expert.id) {
                          <span
                            class="flex size-10 items-center justify-center overflow-hidden rounded-xl border border-divider-subtle bg-background-default-subtle text-sm font-semibold text-text-secondary"
                            [title]="expert.title || expert.name"
                          >
                            {{ expertInitial(expert.title || expert.name) }}
                          </span>
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
                        <span class="text-sm text-text-tertiary">{{ workspaceSkills().length }}</span>
                      </div>
                      <a
                        z-button
                        zType="ghost"
                        zSize="sm"
                        [routerLink]="workspaceId() ? ['/xpert/w', workspaceId(), 'skills'] : null"
                        [attr.aria-label]="'XP.XProject.OpenWorkspaceResources' | translate"
                        [title]="'XP.XProject.OpenWorkspaceResources' | translate"
                      >
                        <i class="ri-add-line"></i>
                      </a>
                    </div>
                    @if (workspaceSkills().length) {
                      <div class="mt-4 flex flex-wrap gap-2">
                        @for (skill of workspaceSkills().slice(0, 5); track skill.id) {
                          <span
                            class="flex size-10 items-center justify-center overflow-hidden rounded-xl border border-divider-subtle bg-background-default-subtle"
                            [title]="skillLabel(skill)"
                          >
                            <xp-icon [icon]="skill.metadata?.icon ?? null" [size]="22"></xp-icon>
                          </span>
                        }
                      </div>
                    } @else {
                      <p class="mt-4 text-sm text-text-tertiary">{{ 'XP.XProject.NoSkillsInWorkspace' | translate }}</p>
                    }
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
                        <span class="text-sm text-text-tertiary">{{ facade.automations().length }}</span>
                      </div>
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
                    </div>
                    @if (facade.automations().length) {
                      <div class="mt-4 space-y-2">
                        @for (automation of facade.automations().slice(0, 2); track automation.id) {
                          <div class="flex items-center gap-2 text-sm text-text-secondary">
                            <span
                              class="size-2 rounded-full"
                              [class.bg-primary]="automation.enabled"
                              [class.bg-divider-regular]="!automation.enabled"
                            ></span>
                            <span class="truncate">{{ automation.name }}</span>
                          </div>
                        }
                      </div>
                    } @else {
                      <p class="mt-4 text-sm text-text-tertiary">{{ 'XP.XProject.AutomationPanelHint' | translate }}</p>
                    }
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
            [initialThreadId]="chatThreadId()"
            [floating]="isNarrow()"
            [resizeMinWidth]="chatPanelMinWidth"
            [resizeMaxWidth]="chatPanelMaxWidth"
            [resizeWidth]="chatPanelWidth()"
            (resizeStart)="startChatPanelResize($event.event, $event.panel, $event.handle)"
            (resizeLost)="onChatPanelResizeLostPointerCapture()"
            (resizeKeydown)="onChatPanelResizeKeydown($event)"
            (closed)="closeChatPanel()"
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
  readonly workspaceConnectors = signal<ConnectorInstance[]>([])
  readonly workspaceSkills = signal<ISkillPackage[]>([])
  readonly workspaceResourcesLoading = signal(false)
  readonly projectExperts = computed(() => this.facade.project()?.xperts ?? [])
  readonly workspaceConnectorCount = computed(() => this.workspaceConnectors().length)
  readonly workspaceId = computed(() => this.facade.project()?.workspaceId ?? '')
  readonly #connectorService = inject(XpertConnectorService)
  readonly #skillPackageService = inject(SkillPackageService)
  #loadedResourceWorkspaceId: string | null = null
  #resourceLoadSequence = 0
  #resizeStartX = 0
  #resizeStartWidth = 0
  #resizePointerId: number | null = null
  #resizeHandle: HTMLElement | null = null
  #resizeMoveListener: ((event: PointerEvent) => void) | null = null
  #resizeEndListener: ((event: PointerEvent) => void) | null = null
  readonly tabs = [
    { label: 'XP.XProject.Overview', path: '' },
    { label: 'XP.XProject.Plan', path: 'plan' },
    { label: 'XP.XProject.Conversations', path: 'tasks' },
    { label: 'XP.XProject.Assets', path: 'assets' },
    { label: 'XP.XProject.Config', path: 'config' }
  ]

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId()
      if (workspaceId === this.#loadedResourceWorkspaceId) return

      this.#loadedResourceWorkspaceId = workspaceId || null
      if (!workspaceId) {
        this.workspaceConnectors.set([])
        this.workspaceSkills.set([])
        this.workspaceResourcesLoading.set(false)
        return
      }

      void this.loadWorkspaceResources(workspaceId)
    })
  }

  async loadWorkspaceResources(workspaceId: string) {
    const sequence = ++this.#resourceLoadSequence
    this.workspaceResourcesLoading.set(true)
    try {
      const [connectorsResult, skillsResult] = await Promise.allSettled([
        firstValueFrom(this.#connectorService.list(workspaceId)),
        firstValueFrom(
          this.#skillPackageService.getAllByWorkspace(workspaceId, {
            relations: ['skillIndex', 'skillIndex.repository'],
            take: 100
          })
        )
      ])
      if (sequence !== this.#resourceLoadSequence || workspaceId !== this.workspaceId()) return
      this.workspaceConnectors.set(
        connectorsResult.status === 'fulfilled'
          ? connectorsResult.value.filter((connector) => connector.status !== 'disconnected')
          : []
      )
      this.workspaceSkills.set(skillsResult.status === 'fulfilled' ? (skillsResult.value.items ?? []) : [])
    } catch {
      if (sequence !== this.#resourceLoadSequence) return
      this.workspaceConnectors.set([])
      this.workspaceSkills.set([])
    } finally {
      if (sequence === this.#resourceLoadSequence) this.workspaceResourcesLoading.set(false)
    }
  }

  connectorLabel(connector: ConnectorInstance) {
    return connector.profile?.name || connector.profile?.email || connector.provider
  }

  connectorInitial(connector: ConnectorInstance) {
    return this.connectorLabel(connector).trim().charAt(0).toUpperCase() || 'C'
  }

  expertInitial(name?: string) {
    return name?.trim().charAt(0).toUpperCase() || 'A'
  }

  skillLabel(skill: ISkillPackage) {
    return resolveI18nText(skill.metadata?.displayName, 'zh-Hans') || skill.name || skill.metadata?.name || 'Skill'
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
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { chat: open ? 'open' : null },
      queryParamsHandling: 'merge'
    })
  }

  closeChatPanel() {
    if (!this.chatPanelOpen()) return
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
}
