import { NgModule } from '@angular/core'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NgxPermissionsModule } from 'ngx-permissions'
import { provideLogger } from '../../@core'
import { SemanticModelRoutingModule } from './routing'
import { MaterialModule } from '../../@shared/material.module'
import { SharedModule } from '../../@shared/shared.module'

@NgModule({
  declarations: [],
  imports: [
    SharedModule,
    MaterialModule,
    SemanticModelRoutingModule,

    NgxPermissionsModule,

    LoggerModule
  ],
  providers: [provideLogger()]
})
export class SemanticModelModule {}
