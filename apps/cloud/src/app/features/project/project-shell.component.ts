import { CommonModule } from '@angular/common'
import { BreakpointObserver } from '@angular/cdk/layout'
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { DestroyRef } from '@angular/core'
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { map, distinctUntilChanged } from 'rxjs'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectChatPanelComponent } from './project-chat-panel.component'

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
                <z-badge zType="outline">{{ facade.project()?.status }}</z-badge>
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
        <div class="mx-auto flex min-h-0 w-full max-w-screen-2xl min-w-0 flex-1">
          <main class="min-h-0 min-w-0 flex-1 overflow-y-auto"><router-outlet /></main>
          @if (!chatPanelOpen()) {
            <aside
              class="sticky top-0 hidden h-fit w-64 shrink-0 self-start border-l border-divider-subtle p-4 xl:block"
            >
              <z-card class="border border-divider-regular bg-components-card-bg shadow-none"
                ><z-card-content class="space-y-3 p-4"
                  ><p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                    {{ 'XP.XProject.ProjectStatus' | translate }}
                  </p>
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-text-secondary">{{ 'XP.XProject.TasksLabel' | translate }}</span
                    ><span class="font-medium text-text-primary">{{ facade.tasks().length }}</span>
                  </div>
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-text-secondary">{{ 'XP.XProject.AssetsLabel' | translate }}</span
                    ><span class="font-medium text-text-primary">{{ facade.assetCount() }}</span>
                  </div>
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-text-secondary">{{ 'XP.XProject.MembersLabel' | translate }}</span
                    ><span class="font-medium text-text-primary">{{ facade.project()?.members?.length || 0 }}</span>
                  </div></z-card-content
                ></z-card
              ><a
                class="mt-3 flex items-center justify-between rounded-md border border-divider-subtle px-3 py-2 text-sm text-text-secondary hover:bg-background-default-subtle hover:text-text-primary"
                [routerLink]="['/project', id(), 'config']"
                >{{ 'XP.XProject.Settings' | translate }} <i class="ri-settings-3-line"></i
              ></a>
            </aside>
          }
        </div>
      </div>
      @if (chatPanelOpen()) {
        <aside
          #chatPanel
          class="fixed bottom-3 right-3 z-50 h-[min(78vh,44rem)] max-w-[calc(100vw-1.5rem)] shrink-0 border-divider-subtle lg:sticky lg:top-0 lg:h-full lg:max-h-none lg:max-w-none lg:border-l lg:shadow-sm"
          [style.width.px]="chatPanelWidth()"
        >
          <div
            class="group absolute inset-y-0 left-0 z-50 flex w-3 -translate-x-1/2 cursor-col-resize touch-none select-none items-center justify-center"
            role="separator"
            tabindex="0"
            aria-orientation="vertical"
            [attr.aria-label]="'XP.XProject.ResizeProjectAssistant' | translate"
            [attr.aria-valuemin]="chatPanelMinWidth"
            [attr.aria-valuemax]="chatPanelMaxWidth"
            [attr.aria-valuenow]="chatPanelWidth()"
            (pointerdown)="startChatPanelResize($event, chatPanel)"
            (lostpointercapture)="onChatPanelResizeLostPointerCapture()"
            (keydown)="onChatPanelResizeKeydown($event)"
          >
            <span
              class="h-full w-px bg-divider-subtle transition-colors group-hover:bg-primary group-focus-visible:bg-primary"
            ></span>
          </div>
          <xp-project-chat-panel
            [project]="facade.project()"
            [projectId]="id()"
            [assistantKey]="chatAssistantKey()"
            [initialThreadId]="chatThreadId()"
            [floating]="isNarrow()"
            (closed)="closeChatPanel()"
            (threadChanged)="onChatThreadChanged($event)"
          />
        </aside>
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
  #resizeStartX = 0
  #resizeStartWidth = 0
  #resizePointerId: number | null = null
  #resizeHandle: HTMLElement | null = null
  #resizeMoveListener: ((event: PointerEvent) => void) | null = null
  #resizeEndListener: ((event: PointerEvent) => void) | null = null
  readonly tabs = [
    { label: 'XP.XProject.Overview', path: '' },
    { label: 'XP.XProject.Plan', path: 'plan' },
    { label: 'XP.XProject.Tasks', path: 'tasks' },
    { label: 'XP.XProject.Assets', path: 'assets' },
    { label: 'XP.XProject.Config', path: 'config' }
  ]
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

  ngOnDestroy() {
    this.stopChatPanelResize()
  }

  startChatPanelResize(event: PointerEvent, panel: HTMLElement) {
    if (event.button !== 0) return

    const handle = event.currentTarget as HTMLElement | null
    if (!handle) return

    event.preventDefault()
    event.stopPropagation()
    const bounds = this.chatPanelWidthBounds()
    this.#resizeStartX = event.clientX
    this.#resizeStartWidth = panel.getBoundingClientRect().width
    this.chatPanelWidth.set(this.clampChatPanelWidth(this.#resizeStartWidth, bounds))
    this.chatPanelResizing.set(true)
    this.#resizePointerId = event.pointerId
    this.#resizeHandle = handle
    handle.setPointerCapture(event.pointerId)

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
