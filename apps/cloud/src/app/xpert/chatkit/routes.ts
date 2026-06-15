import { Routes } from '@angular/router'
import { authGuard } from '../routes'
import { PublicChatkitComponent } from './public-chatkit.component'

export const routes: Routes = [
  {
    path: 'x/:name/c/:id',
    component: PublicChatkitComponent,
    data: {
      title: 'ChatKit Xpert Conversation'
    },
    canActivate: [authGuard]
  },
  {
    path: 'x/:name',
    component: PublicChatkitComponent,
    data: {
      title: 'ChatKit Xpert'
    },
    canActivate: [authGuard]
  }
]
