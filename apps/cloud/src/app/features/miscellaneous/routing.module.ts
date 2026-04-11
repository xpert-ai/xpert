import { Routes } from '@angular/router'
import { MiscellaneousComponent } from './miscellaneous.component'
import { NotFoundComponent } from '../../@shared'

export const routes: Routes = [
  {
    path: '',
    component: MiscellaneousComponent,
    children: [
      {
        path: '404',
        component: NotFoundComponent
      }
    ]
  }
]
