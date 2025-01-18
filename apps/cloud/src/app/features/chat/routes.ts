import { Routes } from '@angular/router'
import { ChatHomeComponent } from './home.component'
import { ChatTasksComponent } from './tasks/tasks.component'

export const routes: Routes = [
  {
    path: 'r/:role',
    component: ChatHomeComponent,
  },
  {
    path: 'c/:id',
    component: ChatHomeComponent,
  },
  {
    path: 'r/:role/c/:id',
    component: ChatHomeComponent,
  },
  {
    path: 'tasks',
    component: ChatTasksComponent
  },
  {
    path: '**',
    component: ChatHomeComponent,
  },
]
