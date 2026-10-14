import { Routes } from '@angular/router'

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./personal-api-keys.component').then((m) => m.PersonalApiKeysComponent)
  }
]
