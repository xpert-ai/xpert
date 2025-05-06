import { Routes } from '@angular/router'
import { ChatTasksComponent } from './tasks/tasks.component'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ChatHomeComponent } from './home/home.component'
import { ChatProjectsComponent } from './projects/projects.component'
import { ChatProjectHomeComponent } from './project/home/home.component'
import { ChatProjectConversationComponent } from './project/conversation/conversation.component'
import { ChatProjectComponent } from './project/project.component'

export const routes: Routes = [
  {
    path: '',
    component: ChatHomeComponent,
    children: [
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
        }
      },
      {
        path: '**',
        redirectTo: 'x/common',
        pathMatch: 'prefix'
      },
    ]
  },
]
