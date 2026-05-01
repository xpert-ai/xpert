import { inject } from '@angular/core'
import { Router, Routes, UrlMatchResult, UrlSegment } from '@angular/router'
import { CurrentUserHydrationService } from '@xpert-ai/cloud/state'
import { from, of, race, timer } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { AiFeatureEnum, AssistantBindingScope, AssistantBindingService, AssistantCode, Store } from '../../@core'
import { ChatTasksComponent } from './tasks/tasks.component'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ChatHomeComponent } from './home/home.component'
import { ChatBiComponent } from './chatbi/chatbi.component'
import { ChatCommonAssistantComponent } from './common/common.component'
import { ClawXpertConversationDetailComponent } from './clawxpert/clawxpert-conversation-detail.component'
import { ClawXpertComponent } from './clawxpert/clawxpert.component'
import { ClawXpertOverviewComponent } from './clawxpert/clawxpert-overview.component'

const FEATURE_HYDRATION_TIMEOUT_MS = 3000

function hydrateFeatureContext(options: { skipSessionCache?: boolean } = {}) {
  const currentUserHydrationService = inject(CurrentUserHydrationService)
  const hydration = currentUserHydrationService.getFeatureHydration(options)

  return race(
    from(hydration).pipe(
      map((user) => !!user),
      catchError(() => of(false))
    ),
    timer(FEATURE_HYDRATION_TIMEOUT_MS).pipe(map(() => false))
  )
}

function featureGate(featureKeys: AiFeatureEnum[]) {
  return () => {
    const store = inject(Store)
    const router = inject(Router)

    return hydrateFeatureContext({ skipSessionCache: true }).pipe(
      map((hydrated) =>
        hydrated && featureKeys.every((featureKey) => store.hasFeatureEnabled(featureKey))
          ? true
          : router.createUrlTree(['/chat'])
      )
    )
  }
}

function redirectToDefaultChatEntry() {
  return () => {
    const store = inject(Store)
    const router = inject(Router)
    const assistantBindingService = inject(AssistantBindingService)

    return hydrateFeatureContext({ skipSessionCache: true }).pipe(
      switchMap((hydrated) => {
        if (
          !hydrated ||
          !store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) ||
          !store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)
        ) {
          return of(router.createUrlTree(['/chat/x/common']))
        }

        if (!store.organizationId) {
          return of(router.createUrlTree(['/chat/clawxpert']))
        }

        return assistantBindingService.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER).pipe(
          switchMap((binding) => {
            const assistantId = readAssistantBindingAssistantId(binding)
            if (!assistantId) {
              return of(router.createUrlTree(['/chat/clawxpert']))
            }

            return assistantBindingService.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT).pipe(
              map((xperts) =>
                hasMatchingXpertId(xperts, assistantId)
                  ? router.createUrlTree(['/chat/clawxpert/c'])
                  : router.createUrlTree(['/chat/clawxpert'])
              ),
              catchError(() => of(router.createUrlTree(['/chat/clawxpert'])))
            )
          }),
          catchError(() => of(router.createUrlTree(['/chat/clawxpert'])))
        )
      })
    )
  }
}

export const routes: Routes = [
  {
    path: '',
    component: ChatHomeComponent,
    children: [
      {
        path: '',
        component: ChatCommonAssistantComponent,
        canActivate: [redirectToDefaultChatEntry()],
        pathMatch: 'full'
      },
      {
        path: 'x/welcome',
        redirectTo: '/chat/x/common',
        pathMatch: 'full'
      },
      {
        path: 'x/common/c/:id',
        redirectTo: '/chat/x/common',
        pathMatch: 'full'
      },
      {
        path: 'x/common',
        component: ChatCommonAssistantComponent,
        data: {
          title: 'Common Assistant',
        }
      },
      {
        path: 'x/:name',
        component: ChatXpertComponent,
        data: {
          title: 'Chat Xpert',
        }
      },
      {
        path: 'c/:id',
        component: ChatXpertComponent,
        data: {
          title: 'Chat Conversation',
        }
      },
      {
        path: 'x/:name/c/:id',
        component: ChatXpertComponent,
        data: {
          title: 'Chat Xpert Conversation',
        }
      },
      {
        path: 'clawxpert',
        component: ClawXpertComponent,
        canActivateChild: [featureGate([AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT])],
        data: {
          title: 'ClawXpert',
        },
        children: [
          {
            path: '',
            component: ClawXpertOverviewComponent,
            data: {
              title: 'ClawXpert Overview',
            }
          },
          {
            matcher: clawxpertConversationMatcher,
            component: ClawXpertConversationDetailComponent,
            data: {
              title: 'ClawXpert Conversation',
            }
          }
        ]
      },
      {
        path: 'chatbi',
        component: ChatBiComponent,
        canActivate: [featureGate([AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CHATBI])],
        data: {
          title: 'Chat BI',
        }
      },

      {
        path: 'tasks',
        component: ChatTasksComponent,
        data: {
          title: 'Chat Tasks',
        },
      },
      {
        path: 'tasks/:id',
        component: ChatTasksComponent,
        data: {
          title: 'Chat Task',
        },
      },
      {
        path: '**',
        redirectTo: 'x/common',
        pathMatch: 'prefix'
      },
    ]
  },
]

function clawxpertConversationMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments[0]?.path !== 'c') {
    return null
  }

  if (segments.length === 1) {
    return {
      consumed: segments
    }
  }

  if (segments.length === 2) {
    return {
      consumed: segments,
      posParams: {
        threadId: segments[1]
      }
    }
  }

  return null
}

function readAssistantBindingAssistantId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('assistantId' in value)) {
    return null
  }

  const assistantId = value.assistantId
  if (typeof assistantId !== 'string') {
    return null
  }

  const normalizedAssistantId = assistantId.trim()
  return normalizedAssistantId || null
}

function hasMatchingXpertId(value: unknown, assistantId: string): boolean {
  if (!Array.isArray(value)) {
    return false
  }

  return value.some((item) => {
    if (!item || typeof item !== 'object' || !('id' in item)) {
      return false
    }

    return item.id === assistantId
  })
}
