import { Routes } from '@angular/router'
import { ExploreComponent } from './explore.component'

export const routes: Routes = [
  {
    path: 'apps/:appName',
    loadComponent: () => import('./app-detail/app-detail.component').then((m) => m.ApplicationDetailComponent),
    data: {
      title: 'App Detail',
      scopeContext: 'dual-scope'
    }
  },
  {
    path: '',
    component: ExploreComponent,
    data: {
      title: 'Explore Marketplace'
    }
  }
]
