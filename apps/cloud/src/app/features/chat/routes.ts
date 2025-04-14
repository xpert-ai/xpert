import { Routes } from '@angular/router'
import { ChatTasksComponent } from './tasks/tasks.component'
import { ChatXpertComponent } from './xpert/xpert.component'
import { ChatHomeComponent } from './home/home.component'

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
