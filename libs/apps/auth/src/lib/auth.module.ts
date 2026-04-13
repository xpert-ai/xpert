import { CommonModule } from '@angular/common'
import { Injector, ModuleWithProviders, NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCheckboxComponent, ZardInputDirective, ZardTabComponent, ZardTabGroupComponent } from '@xpert-ai/headless-ui'
import { PacAuthRoutingModule } from './auth-routing.module'
import {
  defaultAuthOptions,
  PacAuthOptions,
  PacAuthStrategyClass,
  PAC_AUTH_INTERCEPTOR_HEADER,
  PAC_AUTH_OPTIONS,
  PAC_AUTH_STRATEGIES,
  PAC_AUTH_TOKENS,
  PAC_AUTH_TOKEN_INTERCEPTOR_FILTER,
  PAC_AUTH_USER_OPTIONS
} from './auth.options'
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component'
import { NoAuthGuard } from './guards/no-auth.guard'
import { deepExtend } from './helpers'
import { UserLoginComponent } from './login/login.component'
import { PacLogoutComponent } from './logout/logout.component'
import { UserRegisterResultComponent } from './register-result/register-result.component'
import { UserRegisterComponent } from './register/register.component'
import { ResetPasswordComponent } from './reset-password/reset-password.component'
import { PacAuthService } from './services/auth.service'
import { NbAuthSimpleToken } from './services/token/token'
import { PacAuthTokenParceler, PAC_AUTH_FALLBACK_TOKEN } from './services/token/token-parceler'
import { PacTokenLocalStorage, PacTokenStorage } from './services/token/token-storage'
import { PacTokenService } from './services/token/token.service'
import { PacAuthStrategy } from './strategies/auth-strategy'
import { PacAuthStrategyOptions } from './strategies/auth-strategy-options'
import { VarifyEmailComponent } from './verify-email/verify-email.component'

export function nbStrategiesFactory(options: PacAuthOptions, injector: Injector): PacAuthStrategy[] {
  const strategies = []
  options.strategies.forEach(([strategyClass, strategyOptions]: [PacAuthStrategyClass, PacAuthStrategyOptions]) => {
    const strategy: PacAuthStrategy = injector.get(strategyClass)
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
    PacLogoutComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    VarifyEmailComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    PacAuthRoutingModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardTabGroupComponent,
    ZardTabComponent,
    ZardCheckboxComponent
  ],
  exports: [
    UserLoginComponent,
    UserRegisterComponent,
    UserRegisterResultComponent,
    PacLogoutComponent,
  ],
  providers: [
    PacAuthService,
    PacTokenService,
    {
      provide: PacTokenStorage,
      useClass: PacTokenLocalStorage
    },
    PacAuthTokenParceler,
    {
      provide: PAC_AUTH_TOKENS,
      useFactory: function nbOptionsFactory() {
        return {}
      },
      deps: [PAC_AUTH_STRATEGIES]
    },
    { provide: PAC_AUTH_FALLBACK_TOKEN, useValue: NbAuthSimpleToken },
    { provide: PAC_AUTH_INTERCEPTOR_HEADER, useValue: 'Authorization' },
    { provide: PAC_AUTH_TOKEN_INTERCEPTOR_FILTER, useValue: {} },

    NoAuthGuard
  ]
})
export class PacAuthModule {
  static forRoot(pacAuthOptions?: PacAuthOptions): ModuleWithProviders<PacAuthModule> {
    return {
      ngModule: PacAuthModule,
      providers: [
        { provide: PAC_AUTH_USER_OPTIONS, useValue: pacAuthOptions },
        {
          provide: PAC_AUTH_OPTIONS,
          useFactory: nbOptionsFactory,
          deps: [PAC_AUTH_USER_OPTIONS]
        },
        {
          provide: PAC_AUTH_STRATEGIES,
          useFactory: nbStrategiesFactory,
          deps: [PAC_AUTH_OPTIONS, Injector]
        }
      ]
    }
  }
}
