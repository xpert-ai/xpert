import { Routes } from '@angular/router'
import { XpertExploreComponent } from './explore.component'

export const routes: Routes = [
  {
    path: '',
    component: XpertExploreComponent,
    data: {
      title: 'Explore Experts',
    }
  },
]
