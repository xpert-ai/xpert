import { inject } from '@angular/core'
import { Router, Routes, UrlMatchResult, UrlSegment } from '@angular/router'
import { AiFeatureEnum, Store } from '../../@core'
import { filter, map, take } from 'rxjs/operators'
import { ChatTasksComponent } from './tasks/tasks.component'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ChatHomeComponent } from './home/home.component'
import { ChatBiComponent } from './chatbi/chatbi.component'
import { ChatCommonAssistantComponent } from './common/common.component'
import { ChatCommonWelcomeComponent } from './welcome/welcome.component'
import { ClawXpertConversationDetailComponent } from './clawxpert/clawxpert-conversation-detail.component'
import { ClawXpertComponent } from './clawxpert/clawxpert.component'
import { ClawXpertOverviewComponent } from './clawxpert/clawxpert-overview.component'

function featureGate(featureKeys: AiFeatureEnum[]) {
  return () => {
    const store = inject(Store)
    const router = inject(Router)

    return store.user$.pipe(
      filter((user) => Array.isArray(user?.tenant?.featureOrganizations)),
      take(1),
      map(() =>
        featureKeys.every((featureKey) => store.hasFeatureEnabled(featureKey))
          ? true
          : router.createUrlTree(['/chat'])
      )
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
        redirectTo: 'x/welcome',
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
