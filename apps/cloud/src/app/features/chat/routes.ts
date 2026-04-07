import { inject } from '@angular/core'
import { Router, Routes, UrlMatchResult, UrlSegment } from '@angular/router'
import { AiFeatureEnum, Store } from '../../@core'
import { ChatTasksComponent } from './tasks/tasks.component'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ChatHomeComponent } from './home/home.component'
import { ChatProjectsComponent } from './projects/projects.component'
import { ChatProjectHomeComponent } from './project/home/home.component'
import { ChatProjectConversationComponent } from './project/conversation/conversation.component'
import { ChatProjectComponent } from './project/project.component'
import { ChatBiComponent } from './chatbi/chatbi.component'
import { ChatCommonAssistantComponent } from './common/common.component'
import { ChatCommonWelcomeComponent } from './welcome/welcome.component'
import { ClawXpertConversationDetailComponent } from './clawxpert/clawxpert-conversation-detail.component'
import { ClawXpertComponent } from './clawxpert/clawxpert.component'
import { ClawXpertOverviewComponent } from './clawxpert/clawxpert-overview.component'

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
        canActivate: [
          () => {
            const store = inject(Store)
            if (
              store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) &&
              store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)
            ) {
              return true
            }
            return inject(Router).createUrlTree(['/chat'])
          }
        ],
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
        canActivate: [
          () => {
            const store = inject(Store)
            if (
              store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) &&
              store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CHATBI)
            ) {
              return true
            }
            return inject(Router).createUrlTree(['/chat'])
          }
        ],
        data: {
          title: 'Chat BI',
        }
      },

      {
        path: 'p/:id',
        component: ChatProjectComponent,
        data: {
          title: 'Chat Xpert Project',
        },
        children: [
          {
            path: '',
            component: ChatProjectHomeComponent,
            data: {
              title: 'Chat Xpert Project Home',
            }
          },
          {
            path: 'x/:name',
            component: ChatProjectConversationComponent,
            data: {
              title: 'Chat Project Xpert',
            }
          },
          {
            path: 'c',
            component: ChatProjectConversationComponent,
            data: {
              title: 'Chat Project New Conversation',
            }
          },
          {
            path: 'c/:c',
            component: ChatProjectConversationComponent,
            data: {
              title: 'Chat Project Conversation',
            }
          },
          {
            path: 'x/:name/c/:c',
            component: ChatProjectConversationComponent,
            data: {
              title: 'Chat Project Xpert Conversation',
            }
          },
        ]
      },
      {
        path: 'p',
        component: ChatProjectsComponent,
        data: {
          title: 'Chat Xpert Projects',
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
