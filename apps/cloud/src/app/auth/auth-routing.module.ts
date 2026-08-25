import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { environment } from '../../environments/environment'
import { XpAuthComponent } from './auth.component'
import { OidcConsentComponent } from './consent/consent.component'
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component'
import { NoAuthGuard } from './guards/no-auth.guard'
import { UserLoginComponent } from './login/login.component'
import { XpLogoutComponent } from './logout/logout.component'
import { UserRegisterResultComponent } from './register-result/register-result.component'
import { UserRegisterComponent } from './register/register.component'
import { ResetPasswordComponent } from './reset-password/reset-password.component'
import { CurrentUserSsoConfirmComponent } from './current-user-sso-confirm/current-user-sso-confirm.component'
import { SsoBindComponent } from './sso-bind/sso-bind.component'
import { VarifyEmailComponent } from './verify-email/verify-email.component'

const routes: Routes = [
  // Auth Root
  {
    path: '',
    component: XpAuthComponent,
    children: [
      {
        path: 'login',
        component: UserLoginComponent,
        data: { title: '登录', titleI18n: 'app.login.login' }
      },
      ...(environment.mcpOAuthEnabled
        ? [
            {
              path: 'consent',
              component: OidcConsentComponent,
              data: { title: 'Authorization request', titleI18n: 'Auth.McpConsent.Eyebrow' }
            }
          ]
        : []),
      {
        path: 'register',
        component: UserRegisterComponent,
        data: { title: '注册', titleI18n: 'app.register.register' }
      },
      {
        path: 'register-result',
        component: UserRegisterResultComponent,
        data: { title: '注册结果', titleI18n: 'app.register.register' }
      },
      {
        path: 'request-password',
        component: ForgotPasswordComponent,
        canActivate: [NoAuthGuard]
      },
      {
        path: 'reset-password',
        component: ResetPasswordComponent,
        canActivate: [NoAuthGuard]
      },
      {
        path: 'accept-invite',
        loadComponent: () => import('./accept-invite/accept-invite.component').then((m) => m.AcceptInvitePageComponent),
        canActivate: [NoAuthGuard]
      },
      {
        path: 'verify',
        component: VarifyEmailComponent,
        canActivate: [NoAuthGuard]
      },
      {
        path: 'logout',
        component: XpLogoutComponent
      },
      {
        path: 'sso-bind',
        component: SsoBindComponent,
        data: { title: 'Bind Account', titleI18n: 'app.login.bind' }
      },
      {
        path: 'sso-confirm',
        component: CurrentUserSsoConfirmComponent,
        data: { title: 'Confirm Binding', titleI18n: 'app.login.confirm-bind' }
      }
    ]
  }
  // 单页不包裹Layout
  //   { path: 'passport/callback/:type', component: CallbackComponent }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class XpAuthRoutingModule {}
