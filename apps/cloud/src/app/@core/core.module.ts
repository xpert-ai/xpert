import { CommonModule } from '@angular/common'
import {
  HttpClient,
  provideHttpClient,
  withInterceptorsFromDi
} from '@angular/common/http'
import {
  ModuleWithProviders,
  NgModule,
  Optional,
  SkipSelf
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  MissingTranslationHandler,
  TranslateLoader,
  TranslateModule
} from '@ngx-translate/core'
import { throwIfAlreadyLoaded } from './module-import-guard'
import { HttpLoaderFactory } from './theme'
import { NgmMissingTranslationHandler } from '@metad/ocap-angular/core'



@NgModule({
  imports: [
    CommonModule,
    FormsModule,

    // 3rd party
    // FontAwesomeModule,
    TranslateModule.forRoot({
      missingTranslationHandler: {
        provide: MissingTranslationHandler,
        useClass: NgmMissingTranslationHandler
      },
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    })
  ],
  // providers: [provideHttpClient(withInterceptorsFromDi())],
  declarations: [
  ]
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
    throwIfAlreadyLoaded(parentModule, 'CoreModule')
  }

  static forRoot(): ModuleWithProviders<CoreModule> {
    return {
      ngModule: CoreModule,
      providers: [
        // { provide: MAT_DATE_LOCALE, useValue: zhCN },
      ]
    }
  }
}
