import { Routes } from '@angular/router'
import { ExploreComponent } from './explore.component'

export const routes: Routes = [
  {
    path: 'templates/:templateId',
    loadComponent: () => import('./template-detail/template-detail.component').then((m) => m.TemplateDetailComponent),
    data: { title: 'Assistant Template', scopeContext: 'dual-scope' }
  },
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
