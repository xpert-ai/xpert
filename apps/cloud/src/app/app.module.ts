import { PlatformModule } from '@angular/cdk/platform'
import { HTTP_INTERCEPTORS, HttpClientModule, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { APP_INITIALIZER, LOCALE_ID, NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { BrowserModule, HammerModule } from '@angular/platform-browser'
import { provideAnimations } from '@angular/platform-browser/animations'
import { RouteReuseStrategy } from '@angular/router'
import { ServiceWorkerModule } from '@angular/service-worker'
import { Ability, PureAbility } from '@casl/ability'
import { NxCoreModule } from '@metad/core'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NgxPermissionsModule } from 'ngx-permissions'
import { provideUiI18nAdapterFactory, provideZard, type UiI18nAdapter, ZardToastComponent } from '@xpert-ai/headless-ui'
import {
  APIInterceptor,
  AppInitService,
  AppRouteReuseStrategy,
  CoreModule,
  LOCALE_DEFAULT,
  LanguageInterceptor,
  TenantInterceptor,
  TokenInterceptor,
  UpdateService
} from './@core'
import { AuthModule } from './@core/auth/auth.module'
import { AppRoutingModule } from './app-routing.module'
import { AppComponent } from './app.component'
import { PAC_API_BASE_URL } from '@metad/cloud/auth'
import { environment } from '../environments/environment'
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter'
import { I18nService, initI18n } from './@shared/i18n'
import { CustomElementsService, initializeCustomElements, provideChatMarkdown } from './@shared/chat'

const TYPE_KEY = '__subject__'
function detectSubjectType(subject) {
  if (!subject || typeof subject === 'string') {
    return subject
  }

  return subject[TYPE_KEY]
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    PlatformModule,
    HammerModule,
    ReactiveFormsModule,
    ZardToastComponent,
    AppRoutingModule,
    CoreModule.forRoot(),
    AuthModule,
    NgxPermissionsModule.forRoot(),
    LoggerModule.forRoot({
      level: NgxLoggerLevel.WARN,
      serverLogLevel: NgxLoggerLevel.ERROR,
      colorScheme: ['purple', 'teal', 'gray', 'gray', 'red', 'red', 'red'],
      enableSourceMaps: true
    }),
    NxCoreModule.forRoot(),
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: false, // environment.production,
      // Register the ServiceWorker as soon as the app is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    }),
  ],
  providers: [
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
    provideZard(),
    // UpdateService,
    {
      provide: LOCALE_ID,
      useValue: LOCALE_DEFAULT
    },
    {
      provide: RouteReuseStrategy,
      useClass: AppRouteReuseStrategy
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: APIInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LanguageInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TenantInterceptor,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (appInitService: AppInitService) => () => {
        return appInitService.init()
      },
      deps: [AppInitService],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => initI18n(),
      multi: true,
    },
    { provide: Ability, useValue: new Ability([], { detectSubjectType }) },
    { provide: PureAbility, useExisting: Ability },
    {
      provide: PAC_API_BASE_URL,
      useValue: environment.API_BASE_URL
    },
    provideUiI18nAdapterFactory(
      (i18nService: I18nService): UiI18nAdapter => ({
        getLanguage: () => i18nService.currentLanguage,
        translate: (key, options) =>
          i18nService.translate(
            key,
            options as {
              ns?: string
              Default?: string
            } & Record<string, string>
          )
      }),
      [I18nService]
    ),
    provideDateFnsAdapter(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeCustomElements,
      multi: true,
      deps: [CustomElementsService]
    },
    provideChatMarkdown(),

    // {
    //   provide: ErrorHandler,
    //   useValue: Sentry.createErrorHandler({
    //     showDialog: false,
    //   }),
    // },
    // {
    //   provide: Sentry.TraceService,
    //   deps: [Router],
    // },
    // {
    //   provide: APP_INITIALIZER,
    //   useFactory: () => () => {},
    //   deps: [Sentry.TraceService],
    //   multi: true,
    // },
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
