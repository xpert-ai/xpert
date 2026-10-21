import { Routes } from '@angular/router'
export const routes: Routes = [
  { path: '', loadComponent: () => import('./analytics.component').then((m) => m.AnalyticsSettingsComponent) }
]
