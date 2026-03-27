import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { OnboardingComponent } from './onboarding.component'
import { WelcomeComponent } from './welcome/welcome.component'
import { onboardGuard } from '../@core/guards'

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
