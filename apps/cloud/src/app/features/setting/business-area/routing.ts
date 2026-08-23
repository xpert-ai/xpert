import type { Routes } from '@angular/router'

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./business-area.component').then((m) => m.BusinessAreaSettingsComponent)
  }
]

export default routes
