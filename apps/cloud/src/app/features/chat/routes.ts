import { inject } from '@angular/core'
import { Router, Routes, UrlMatchResult, UrlSegment } from '@angular/router'
import { of, race, timer } from 'rxjs'
import { filter, map, switchMap, take, catchError } from 'rxjs/operators'
import { AiFeatureEnum, AssistantBindingScope, AssistantBindingService, AssistantCode, Store } from '../../@core'
import { ChatTasksComponent } from './tasks/tasks.component'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ChatHomeComponent } from './home/home.component'
import { ChatBiComponent } from './chatbi/chatbi.component'
import { ChatCommonAssistantComponent } from './common/common.component'
import { ChatCommonWelcomeComponent } from './welcome/welcome.component'
import { ClawXpertConversationDetailComponent } from './clawxpert/clawxpert-conversation-detail.component'
import { ClawXpertComponent } from './clawxpert/clawxpert.component'
import { ClawXpertOverviewComponent } from './clawxpert/clawxpert-overview.component'

const FEATURE_HYDRATION_TIMEOUT_MS = 1000

function waitForFeatureHydration(store: Store) {
  return race(
    store.user$.pipe(
      filter((user) => Array.isArray(user?.tenant?.featureOrganizations)),
      take(1),
      map(() => true)
    ),
    // Avoid leaving the navigation promise pending forever when feature hydration is delayed.
    timer(FEATURE_HYDRATION_TIMEOUT_MS).pipe(map(() => false))
  )
}

function featureGate(featureKeys: AiFeatureEnum[]) {
  return () => {
    const store = inject(Store)
    const router = inject(Router)

    return waitForFeatureHydration(store).pipe(
      map(() =>
        featureKeys.every((featureKey) => store.hasFeatureEnabled(featureKey))
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

    return waitForFeatureHydration(store).pipe(
      switchMap(() => {
        if (
          !store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) ||
          !store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)
        ) {
          return of(router.createUrlTree(['/chat/x/welcome']))
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
        component: ChatCommonWelcomeComponent,
        canActivate: [redirectToDefaultChatEntry()],
        pathMatch: 'full'
      },
      {
        path: 'x/welcome',
        component: ChatCommonWelcomeComponent,
        data: {
          title: 'Common Welcome',
        }
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
        canActivate: [featureGate([AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_CLAWXPERT])],
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
        redirectTo: 'x/welcome',
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
