import { Routes } from '@angular/router'
import { ChatProjectsComponent } from '../projects/projects.component'
import { ChatProjectConversationComponent } from './conversation/conversation.component'
import { ChatProjectHomeComponent } from './home/home.component'
import { ChatProjectComponent } from './project.component'

export const routes: Routes = [
  {
    path: '',
    component: ChatProjectsComponent,
    data: {
      title: 'Chat Xpert Projects'
    }
  },
  {
    path: ':id',
    component: ChatProjectComponent,
    data: {
      title: 'Chat Xpert Project'
    },
    children: [
      {
        path: '',
        component: ChatProjectHomeComponent,
        data: {
          title: 'Chat Xpert Project Home'
        }
      },
      {
        path: 'x/:name',
        component: ChatProjectConversationComponent,
        data: {
          title: 'Chat Project Xpert'
        }
      },
      {
        path: 'c',
        component: ChatProjectConversationComponent,
        data: {
          title: 'Chat Project New Conversation'
        }
      },
      {
        path: 'c/:c',
        component: ChatProjectConversationComponent,
        data: {
          title: 'Chat Project Conversation'
        }
      },
      {
        path: 'x/:name/c/:c',
        component: ChatProjectConversationComponent,
        data: {
          title: 'Chat Project Xpert Conversation'
        }
      }
    ]
  }
]
