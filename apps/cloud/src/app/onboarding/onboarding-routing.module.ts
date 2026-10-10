import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { OnboardingComponent } from './onboarding.component'
import { WelcomeComponent } from './welcome/welcome.component'
import { onboardGuard } from '../@core/guards'
import { authGuard } from '../@core/auth/auth.guard'

const routes: Routes = [
  {
    path: '',
    component: OnboardingComponent,
    children: [
      {
        path: '',
        component: WelcomeComponent,
        canActivate: [onboardGuard]
      },
      {
        path: 'tenant',
        loadComponent: () => import('./tenant-details/tenant-details.component').then((m) => m.TenantDetailsComponent),
        canActivate: [onboardGuard]
      },
      {
        path: 'plugins',
        loadComponent: () => import('./plugins/setup-plugins.component').then((m) => m.SetupPluginsComponent),
        canActivate: [authGuard]
      },
      {
        path: 'unknown',
        loadComponent: () => import('./unknown/unknown.component').then((m) => m.OnboardingUnknownComponent)
      }
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OnboardingRoutingModule {}
