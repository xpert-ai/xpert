import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { injectWorkspace } from '@xpert-ai/cloud/state'
import { ChatKitPetOptions } from '@xpert-ai/chatkit-types'
import { AssistantCode, XpertAPIService } from '../../../@core'
import { distinctUntilChanged, EMPTY, filter, map, startWith, switchMap } from 'rxjs'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'
import {
  type ChatKitEffectEvent,
  type ChatKitPromptWorkflowEffect,
  type ChatKitWorkspaceSkillEffect,
  getChatKitEffectXpertId,
  getChatKitPromptWorkflowEffect,
  getChatKitWorkspaceSkillEffect
} from '../utils'

type AssistantRouteState = {
  workspaceRouteId: string | null
  xpertRouteId: string | null
}

export type AssistantContext = {
  workspaceId: string | null
  xpertId: string | null
}

export type AssistantStudioRuntimeContext = {
  targetXpertId: string
  baseDraftHash: string | null
  unsaved: boolean
}

type StudioRefreshEvent = {
  xpertId: string | null
  nonce: number
}

export type PromptWorkflowRefreshEvent = ChatKitPromptWorkflowEffect & {
  nonce: number
}

export type WorkspaceSkillRefreshEvent = ChatKitWorkspaceSkillEffect & {
  nonce: number
}

const SHARED_ASSISTANT_PET: ChatKitPetOptions = {
  behavior: 'auto' as const,
  position: {
    pin: 'bottom-right' as const,
    draggable: true,
    persist: true,
    boundsPadding: 16,
    zIndex: 70,
    scale: 1
  }
}

@Injectable()
export class XpertAssistantFacade {
  readonly #router = inject(Router)
  readonly #xpertService = inject(XpertAPIService)
  readonly #selectedWorkspace = injectWorkspace()

  readonly assistantCode = signal(AssistantCode.XPERT_SHARED)

  readonly #routeState = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.readRouteState())
    ),
    { initialValue: this.readRouteState() }
  )
  readonly #xpertWorkspaceCache = signal<Record<string, string | null>>({})
  readonly #studioRuntimeContext = signal<AssistantStudioRuntimeContext | null>(null)
  readonly #studioRefresh = signal<StudioRefreshEvent | null>(null)
  readonly #promptWorkflowRefresh = signal<PromptWorkflowRefreshEvent | null>(null)
  readonly #workspaceSkillRefresh = signal<WorkspaceSkillRefreshEvent | null>(null)
  readonly xpertId = computed(() => this.#routeState().xpertRouteId)
  readonly workspaceId = computed(() => {
    const routeState = this.#routeState()
    const selectedWorkspaceId = this.#selectedWorkspace()?.id ?? null
    const cachedWorkspaceId = routeState.xpertRouteId
      ? (this.#xpertWorkspaceCache()[routeState.xpertRouteId] ?? null)
      : null

    return routeState.workspaceRouteId ?? cachedWorkspaceId ?? (!routeState.xpertRouteId ? selectedWorkspaceId : null)
  })

  readonly context = computed<AssistantContext>(() => {
    return {
      workspaceId: this.workspaceId(),
      xpertId: this.xpertId()
    }
  })
  readonly requestContext = computed(() => this.buildRequestContext(this.context(), this.#studioRuntimeContext()))
  readonly runtime = injectAssistantChatkitRuntime({
    assistantCode: this.assistantCode.asReadonly(),
    requestContext: this.requestContext,
    displayMode: 'pet',
    pet: SHARED_ASSISTANT_PET,
    titleKey: 'PAC.Xpert.Assistant',
    titleDefault: 'Assistant',
    onEffect: (event) => {
      this.handleEffect(event as ChatKitEffectEvent)
    }
  })
  readonly assistantId = computed(() => {
    if (!this.runtime.isConfigured()) {
      return null
    }

    return this.runtime.config()?.assistantId ?? null
  })
  readonly control = this.runtime.control
  readonly status = this.runtime.status

  readonly studioRefresh = this.#studioRefresh.asReadonly()
  readonly promptWorkflowRefresh = this.#promptWorkflowRefresh.asReadonly()
  readonly workspaceSkillRefresh = this.#workspaceSkillRefresh.asReadonly()

  constructor() {
    effect(() => {
      if (this.xpertId()) {
        return
      }

      if (this.#studioRuntimeContext()) {
        this.#studioRuntimeContext.set(null)
      }
    })

    this.watchXpertWorkspace()
  }

  emitStudioRefresh(xpertId: string | null) {
    this.#studioRefresh.set({
      xpertId,
      nonce: Date.now()
    })
  }

  emitPromptWorkflowRefresh(effect: ChatKitPromptWorkflowEffect) {
    this.#promptWorkflowRefresh.set({
      ...effect,
      nonce: Date.now()
    })
  }

  emitWorkspaceSkillRefresh(effect: ChatKitWorkspaceSkillEffect) {
    this.#workspaceSkillRefresh.set({
      ...effect,
      nonce: Date.now()
    })
  }

  setStudioContext(context: AssistantStudioRuntimeContext | null) {
    if (!context?.targetXpertId) {
      this.clearStudioContext()
      return
    }

    const current = this.#studioRuntimeContext()
    if (
      current?.targetXpertId === context.targetXpertId &&
      current?.baseDraftHash === context.baseDraftHash &&
      current?.unsaved === context.unsaved
    ) {
      return
    }

    this.#studioRuntimeContext.set(context)
  }

  clearStudioContext() {
    if (!this.#studioRuntimeContext()) {
      return
    }

    this.#studioRuntimeContext.set(null)
  }

  handleEffect(event: ChatKitEffectEvent) {
    switch (event.name) {
      case 'navigate_to_studio': {
        const xpertId = getChatKitEffectXpertId(event)
        if (!xpertId) {
          return
        }

        void this.#router.navigate(['/xpert/x', xpertId, 'agents'])
        return
      }
      case 'refresh_studio': {
        this.emitStudioRefresh(getChatKitEffectXpertId(event) ?? this.context().xpertId)
        return
      }
      case 'refresh_prompt_workflows': {
        const effect = getChatKitPromptWorkflowEffect(event)
        if (!effect) {
          return
        }

        void this.navigateToPromptWorkflows(effect)
        return
      }
      case 'refresh_workspace_skills': {
        const effect = getChatKitWorkspaceSkillEffect(event)
        if (!effect) {
          return
        }

        void this.navigateToWorkspaceSkills(effect)
        return
      }
      default: {
        return
      }
    }
  }

  private watchXpertWorkspace() {
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(null),
        map(() => this.readRouteState().xpertRouteId),
        distinctUntilChanged(),
        switchMap((xpertId) => {
          if (!xpertId || this.#xpertWorkspaceCache()[xpertId] !== undefined) {
            return EMPTY
          }

          return this.#xpertService.getTeam(xpertId).pipe(
            map((team: { workspaceId?: string | null }) => ({
              xpertId,
              workspaceId: team.workspaceId ?? null
            }))
          )
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: ({ xpertId, workspaceId }) => {
          this.#xpertWorkspaceCache.update((cache) => ({
            ...cache,
            [xpertId]: workspaceId
          }))
        }
      })
  }

  private async navigateToPromptWorkflows(effect: ChatKitPromptWorkflowEffect) {
    try {
      await this.#router.navigate(['/xpert/w', effect.workspaceId, 'prompt-workflows'])
    } finally {
      this.emitPromptWorkflowRefresh(effect)
    }
  }

  private async navigateToWorkspaceSkills(effect: ChatKitWorkspaceSkillEffect) {
    try {
      await this.#router.navigate(['/xpert/w', effect.workspaceId, 'skills'])
    } finally {
      this.emitWorkspaceSkillRefresh(effect)
    }
  }

  private readRouteState(): AssistantRouteState {
    const url = this.#router.url.split('?')[0]
    const workspaceMatch = url.match(/^\/xpert\/w\/([^/]+)/)
    const xpertMatch = url.match(/^\/xpert\/x\/([^/]+)\/agents(?:\/|$)/)

    return {
      workspaceRouteId: workspaceMatch?.[1] ?? null,
      xpertRouteId: xpertMatch?.[1] ?? null
    }
  }

  private buildRequestContext(
    context: AssistantContext,
    studioRuntimeContext?: AssistantStudioRuntimeContext | null
  ): Record<string, unknown> {
    const requestContext: Record<string, unknown> = {}
    const env: Record<string, string> = {}

    if (context.workspaceId) {
      env['workspaceId'] = context.workspaceId
    }
    if (context.xpertId) {
      env['xpertId'] = context.xpertId
    }

    if (Object.keys(env).length) {
      requestContext['env'] = env
    }

    if (context.xpertId && studioRuntimeContext?.targetXpertId) {
      requestContext['targetXpertId'] = studioRuntimeContext.targetXpertId
      requestContext['unsaved'] = studioRuntimeContext.unsaved

      if (studioRuntimeContext.baseDraftHash) {
        requestContext['baseDraftHash'] = studioRuntimeContext.baseDraftHash
      }
    }

    return requestContext
  }
}
