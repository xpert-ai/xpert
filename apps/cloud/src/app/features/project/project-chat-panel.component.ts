import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import type { IXpert, IXpertProject } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { environment } from '@cloud/environments/environment'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { injectHostedAssistantChatkitControl, sanitizeAssistantFrameUrl } from '../assistant/assistant-chatkit.runtime'

@Component({
  standalone: true,
  selector: 'xp-project-chat-panel',
  imports: [
    CommonModule,
    DragDropModule,
    RouterLink,
    TranslateModule,
    ChatKit,
    ZardButtonComponent,
    EmojiAvatarComponent
  ],
  template: `
    <section
      #panel
      cdkDrag
      cdkDragBoundary=".xp-project-shell"
      [cdkDragDisabled]="!floating()"
      class="group relative flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-divider-regular bg-components-card-bg shadow-xl lg:rounded-none lg:border-0 lg:shadow-none"
    >
      <div
        class="absolute inset-y-0 left-0 z-50 flex w-3 -translate-x-1/2 cursor-col-resize touch-none select-none items-center justify-center"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        [attr.aria-label]="'XP.XProject.ResizeProjectExpert' | translate"
        [attr.aria-valuemin]="resizeMinWidth()"
        [attr.aria-valuemax]="resizeMaxWidth()"
        [attr.aria-valuenow]="resizeWidth()"
        (pointerdown)="onResizePointerDown($event, panel)"
        (lostpointercapture)="resizeLost.emit()"
        (keydown)="resizeKeydown.emit($event)"
      >
        <span
          class="h-full w-px bg-divider-subtle transition-colors hover:bg-primary group-focus-within:bg-primary"
        ></span>
      </div>
      <header class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-divider-subtle px-4">
        <div cdkDragHandle class="flex min-w-0 cursor-grab items-center gap-2 active:cursor-grabbing">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <i class="ri-chat-3-line"></i>
          </span>
          <div class="min-w-0">
            <h2 class="truncate text-sm font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectExperts' | translate }}
            </h2>
            <p class="truncate text-xs text-text-tertiary">
              {{ project()?.name || ('XP.XProject.ProjectFallback' | translate) }}
              @if (assistant()?.name; as assistantName) {
                <span> &middot; {{ assistantName }}</span>
              }
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          @if (assistant()) {
            <button
              z-button
              zType="ghost"
              zSize="sm"
              type="button"
              [title]="'XP.XProject.ChangeProjectExpert' | translate"
              (click)="chooseAssistant(null)"
            >
              {{ 'XP.XProject.ChangeProjectExpert' | translate }}
            </button>
          }
          <a
            z-button
            zType="ghost"
            zSize="sm"
            class="shrink-0 px-2 text-xs text-text-secondary"
            [routerLink]="['/project', projectId(), 'config']"
            [queryParams]="{ chat: 'open' }"
            queryParamsHandling="merge"
            [attr.aria-label]="'XP.XProject.ViewProjectConfiguration' | translate"
            [title]="'XP.XProject.ViewProjectConfiguration' | translate"
          >
            <span class="hidden sm:inline">{{ 'XP.XProject.ViewProjectConfiguration' | translate }}</span>
            <i class="ri-arrow-right-up-line sm:ml-1"></i>
          </a>
          <button
            z-button
            zType="ghost"
            zSize="icon"
            type="button"
            class="shrink-0 text-text-secondary hover:text-text-primary"
            [attr.aria-label]="'XP.XProject.CloseProjectChat' | translate"
            [title]="'XP.XProject.CloseProjectChat' | translate"
            (click)="closed.emit()"
          >
            <i class="ri-close-line"></i>
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1">
        @if (!assistantId()) {
          <div class="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center">
            <i class="ri-team-line text-3xl text-text-tertiary"></i>
            <p class="mt-3 text-sm font-medium text-text-primary">
              {{ 'XP.XProject.SelectProjectExpertToChat' | translate }}
            </p>
            <p class="mt-1 max-w-xs text-xs text-text-secondary">
              {{ 'XP.XProject.SelectProjectExpertToChatDesc' | translate }}
            </p>
            @if (eligibleAssistants().length > 0) {
              <div class="mt-4 grid w-full max-w-sm gap-2">
                @for (xpert of eligibleAssistants(); track xpert.id) {
                  <button
                    z-button
                    zType="outline"
                    type="button"
                    class="h-auto justify-start px-3 py-2 text-left"
                    (click)="chooseAssistant(xpert.id)"
                  >
                    <emoji-avatar
                      [avatar]="xpert.avatar"
                      [fallbackLabel]="xpert.title || xpert.name"
                      xs
                      class="size-7 shrink-0 overflow-hidden rounded-md"
                    />
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium">{{ xpert.title || xpert.name }}</span>
                      <span class="block truncate text-xs text-text-tertiary">{{ xpert.slug }}</span>
                    </span>
                  </button>
                }
              </div>
            } @else {
              <a z-button zType="outline" zSize="sm" class="mt-4" [routerLink]="['/project', projectId(), 'config']">
                {{ 'XP.XProject.GoToProjectConfiguration' | translate }}
              </a>
            }
          </div>
        } @else if (control(); as chatkitControl) {
          <xpert-chatkit class="block h-full min-h-0" [control]="chatkitControl" />
        } @else {
          <div class="flex h-full min-h-0 items-center justify-center px-6 text-sm text-text-secondary">
            {{ 'XP.XProject.ProjectChatLoading' | translate }}
          </div>
        }
      </div>
    </section>
  `,
  host: { class: 'block h-full min-h-0 min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertProjectChatPanelComponent {
  readonly project = input<IXpertProject | null>(null)
  readonly projectId = input('')
  readonly floating = input(false)
  readonly resizeMinWidth = input(320)
  readonly resizeMaxWidth = input(640)
  readonly resizeWidth = input(512)
  readonly assistantKey = input<string | null>(null)
  readonly eligibleAssistantIds = input<readonly string[] | null>(null)
  readonly initialThreadId = input<string | null>(null)
  readonly closed = output<void>()
  readonly threadChanged = output<string | null>()
  readonly expertChanged = output<string | null>()
  readonly resizeStart = output<{ event: PointerEvent; panel: HTMLElement; handle: HTMLElement }>()
  readonly resizeLost = output<void>()
  readonly resizeKeydown = output<KeyboardEvent>()

  readonly selectedAssistantId = signal<string | null>(null)

  readonly eligibleAssistants = computed(() => {
    const xperts = this.project()?.xperts ?? []
    const eligibleIds = this.eligibleAssistantIds()
    if (!eligibleIds?.length) return xperts
    const allowed = new Set(eligibleIds)
    return xperts.filter((xpert) => allowed.has(xpert.id))
  })

  readonly assistant = computed(() => {
    const xperts = this.eligibleAssistants()
    const key = this.selectedAssistantId()
    return key ? (xperts.find((xpert) => xpert.id === key || xpert.slug === key) ?? null) : null
  })
  readonly assistantId = computed(
    () => this.assistant()?.id ?? (this.initialThreadId()?.trim() ? this.selectedAssistantId() : null)
  )
  readonly identity = computed(() => {
    const projectId = this.projectId().trim()
    const assistantId = this.assistantId()
    return projectId && assistantId ? `project-chat:${projectId}:${assistantId}` : null
  })
  readonly requestContext = computed(() => {
    const projectId = this.projectId().trim()
    return {
      env: {
        ...(projectId ? { projectId } : {})
      }
    }
  })
  readonly chatkitFrameUrl = computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL))
  readonly control = injectHostedAssistantChatkitControl({
    identity: this.identity,
    assistantId: this.assistantId,
    projectId: computed(() => this.projectId().trim() || null),
    frameUrl: this.chatkitFrameUrl,
    requestContext: this.requestContext,
    composer: computed(() => ({
      projects: {
        enabled: true,
        locked: true,
        label: this.project()?.name || this.projectId()
      },
      connectors: { enabled: true }
    })),
    initialThread: this.initialThreadId,
    layout: { maxWidth: '100%' },
    titleKey: 'XP.XProject.ProjectExpert',
    titleDefault: 'Project expert',
    onThreadChange: ({ threadId }) => this.threadChanged.emit(threadId)
  })

  constructor() {
    effect(() => {
      const xperts = this.eligibleAssistants()
      this.selectedAssistantId.set(resolveProjectChatAssistantId(xperts, this.assistantKey(), this.initialThreadId()))
    })
  }

  chooseAssistant(id: string | null) {
    this.selectedAssistantId.set(id)
    this.expertChanged.emit(id)
  }

  onResizePointerDown(event: PointerEvent, panel: HTMLElement) {
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    this.resizeStart.emit({ event, panel, handle })
  }
}

export function resolveProjectChatAssistantId(
  xperts: IXpert[],
  requestedKey?: string | null,
  threadId?: string | null
) {
  const key = requestedKey?.trim()
  if (!key) return null
  const current = xperts.find((xpert) => xpert.id === key || xpert.slug === key)
  if (current?.id) return current.id
  return threadId?.trim() ? key : null
}
