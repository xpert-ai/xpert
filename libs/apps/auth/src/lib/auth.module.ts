import { CommonModule } from '@angular/common'
import { Injector, ModuleWithProviders, NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardInputDirective,
  ZardTabComponent,
  ZardTabGroupComponent
} from '@xpert-ai/headless-ui'
import { XpAuthRoutingModule } from './auth-routing.module'
import {
  defaultAuthOptions,
  XpAuthOptions,
  XpAuthStrategyClass,
  XP_AUTH_INTERCEPTOR_HEADER,
  XP_AUTH_OPTIONS,
  XP_AUTH_STRATEGIES,
  XP_AUTH_TOKENS,
  XP_AUTH_TOKEN_INTERCEPTOR_FILTER,
  XP_AUTH_USER_OPTIONS
} from './auth.options'
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component'
import { NoAuthGuard } from './guards/no-auth.guard'
import { deepExtend } from './helpers'
import { UserLoginComponent } from './login/login.component'
import { XpLogoutComponent } from './logout/logout.component'
import { UserRegisterResultComponent } from './register-result/register-result.component'
import { UserRegisterComponent } from './register/register.component'
import { ResetPasswordComponent } from './reset-password/reset-password.component'
import { SsoBindComponent } from './sso-bind/sso-bind.component'
import { CurrentUserSsoConfirmComponent } from './current-user-sso-confirm/current-user-sso-confirm.component'
import { XpAuthService } from './services/auth.service'
import { NbAuthSimpleToken } from './services/token/token'
import { XpAuthTokenParceler, XP_AUTH_FALLBACK_TOKEN } from './services/token/token-parceler'
import { XpTokenLocalStorage, XpTokenStorage } from './services/token/token-storage'
import { XpAuthTokenService } from './services/token/token.service'
import { XpAuthStrategy } from './strategies/auth-strategy'
import { XpAuthStrategyOptions } from './strategies/auth-strategy-options'
import { VarifyEmailComponent } from './verify-email/verify-email.component'

export function nbStrategiesFactory(options: XpAuthOptions, injector: Injector): XpAuthStrategy[] {
  const strategies = []
  options.strategies.forEach(([strategyClass, strategyOptions]: [XpAuthStrategyClass, XpAuthStrategyOptions]) => {
    const strategy: XpAuthStrategy = injector.get(strategyClass)
    strategy.setOptions(strategyOptions)

    strategies.push(strategy)
  })
  return strategies
}

export function nbOptionsFactory(options) {
  return deepExtend(defaultAuthOptions, options)
}

@NgModule({
  declarations: [
    UserLoginComponent,
    UserRegisterComponent,
    UserRegisterResultComponent,
    XpLogoutComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    VarifyEmailComponent,
    SsoBindComponent,
    CurrentUserSsoConfirmComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    XpAuthRoutingModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardTabGroupComponent,
    ZardTabComponent,
    ZardCheckboxComponent
  ],
  exports: [UserLoginComponent, UserRegisterComponent, UserRegisterResultComponent, XpLogoutComponent],
  providers: [
    XpAuthService,
    XpAuthTokenService,
    {
      provide: XpTokenStorage,
      useClass: XpTokenLocalStorage
    },
    XpAuthTokenParceler,
    {
      provide: XP_AUTH_TOKENS,
      useFactory: function nbOptionsFactory() {
        return {}
      },
      deps: [XP_AUTH_STRATEGIES]
    },
    { provide: XP_AUTH_FALLBACK_TOKEN, useValue: NbAuthSimpleToken },
    { provide: XP_AUTH_INTERCEPTOR_HEADER, useValue: 'Authorization' },
    { provide: XP_AUTH_TOKEN_INTERCEPTOR_FILTER, useValue: {} },

    NoAuthGuard
  ]
})
export class XpAuthModule {
  static forRoot(xpAuthOptions?: XpAuthOptions): ModuleWithProviders<XpAuthModule> {
    return {
      ngModule: XpAuthModule,
      providers: [
        { provide: XP_AUTH_USER_OPTIONS, useValue: xpAuthOptions },
        {
          provide: XP_AUTH_OPTIONS,
          useFactory: nbOptionsFactory,
          deps: [XP_AUTH_USER_OPTIONS]
        },
        {
          provide: XP_AUTH_STRATEGIES,
          useFactory: nbStrategiesFactory,
          deps: [XP_AUTH_OPTIONS, Injector]
        }
      ]
    }
  }
}
