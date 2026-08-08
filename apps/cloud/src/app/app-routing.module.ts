import { NgModule } from '@angular/core'
import { ExtraOptions, PreloadAllModules, RouterModule, Routes } from '@angular/router'
import { SignInSuccessComponent } from './@core/auth/signin-success'
import { authGuard } from './@core/auth/auth.guard'

const routes: Routes = [
  {
    path: 'onboarding',
    loadChildren: () => import('./onboarding/onboarding.module').then((m) => m.OnboardingModule)
  },
  {
    path: 'auth',
    loadChildren: () => import('@cloud/app/auth').then((m) => m.XpAuthModule)
  },
  {
    path: 'artifacts/auth/:artifactLinkSlug',
    canActivate: [authGuard],
    loadComponent: () => import('./artifacts/artifact-share-auth.component').then((m) => m.ArtifactShareAuthComponent)
  },
  { path: 'sign-in/success', component: SignInSuccessComponent },
  {
    path: 'x-chatkit',
    loadChildren: () => import('./xpert/chatkit/routes').then((m) => m.routes)
  },
  {
    path: 'x',
    loadChildren: () => import('./xpert/routes').then((m) => m.routes)
  },
  {
    path: 'plugins/marketplace',
    loadComponent: () =>
      import('./plugin-marketplace/public-plugin-marketplace-page.component').then(
        (m) => m.PublicPluginMarketplacePageComponent
      )
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
