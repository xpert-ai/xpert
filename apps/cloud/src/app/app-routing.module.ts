import { NgModule } from '@angular/core'
import { ExtraOptions, PreloadAllModules, RouterModule, Routes } from '@angular/router'
import { SignInSuccessComponent } from './@core/auth/signin-success'
import { onboardGuard } from './@core'

const routes: Routes = [
  {
    path: 'public',
    loadChildren: () => import('./public/public.module').then((m) => m.PublicModule)
  },
  {
		path: 'onboarding',
		loadChildren: () => import('./onboarding/onboarding.module').then((m) => m.OnboardingModule),
		canActivate: [onboardGuard]
	},
  {
    path: 'auth',
    loadChildren: () => import('@metad/cloud/auth').then((m) => m.PacAuthModule)
  },
  { path: 'sign-in/success', component: SignInSuccessComponent },
  {
    path: 'x',
    loadChildren: () => import('./chat/routes').then((m) => m.routes)
  },
  {
    path: '',
    loadChildren: () => import('./features/features.module').then((m) => m.FeaturesModule)
  },
  // { path: '', redirectTo: 'pages', pathMatch: 'full' },
  { path: '**', redirectTo: '' }
]

const config: ExtraOptions = {
  useHash: false,
  preloadingStrategy: PreloadAllModules
}

@NgModule({
  imports: [RouterModule.forRoot(routes, config)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
