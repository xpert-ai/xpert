import { Routes } from '@angular/router'
import { ChatHomeComponent } from './home/home.component'

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
    path: '**',
    component: ChatHomeComponent,
  },
]
