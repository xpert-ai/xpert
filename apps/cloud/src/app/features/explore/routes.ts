import { Routes } from '@angular/router'
import { ExploreComponent } from './explore.component'

export const routes: Routes = [
  {
    path: '',
    component: ExploreComponent,
    data: {
      title: 'Explore Marketplace'
    }
  }
]
