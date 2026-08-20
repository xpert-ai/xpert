import { Routes } from '@angular/router'
import { authGuard } from '../routes'
import { PublicChatkitComponent } from './public-chatkit.component'

export const routes: Routes = [
  {
    path: 'h5/:platform/:name/c/:id',
    component: PublicChatkitComponent,
    data: {
      title: 'Enterprise H5 ChatKit Xpert Conversation',
      channel: 'enterprise-h5'
    }
  },
  {
    path: 'h5/:platform/:name',
    component: PublicChatkitComponent,
    data: {
      title: 'Enterprise H5 ChatKit Xpert',
      channel: 'enterprise-h5'
    }
  },
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
