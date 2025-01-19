import { Routes } from '@angular/router'
import { ChatHomeComponent } from './home.component'
import { ChatTasksComponent } from './tasks/tasks.component'
import { ChatXpertComponent } from './xpert/xpert.component'

export const routes: Routes = [
  {
    path: '',
    component: ChatHomeComponent,
    children: [
      {
        path: 'x/:role',
        component: ChatXpertComponent,
      },
      {
        path: 'c/:id',
        component: ChatXpertComponent,
      },
      {
        path: 'x/:role/c/:id',
        component: ChatXpertComponent,
      },
      {
        path: 'tasks',
        component: ChatTasksComponent
      },
    ]
  },
  {
    path: '**',
    component: ChatHomeComponent,
  },
]
