import { NgModule } from '@angular/core'
import { NgmInputComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { CardCreateComponent } from '../../../@shared/card'
import { MaterialModule } from '../../../@shared/material.module'
import { SharedModule } from '../../../@shared/shared.module'
import { PACDataSourceCreationComponent } from './creation/creation.component'
import { PACDataSourcesRoutingModule } from './data-sources-routing.module'
import { PACDataSourcesComponent } from './data-sources.component'

@NgModule({
  imports: [
    SharedModule,
    MaterialModule,
    FormlyModule,
    TranslateModule,
    PACDataSourcesRoutingModule,
    ContentLoaderModule,
    NgmInputComponent,

    ButtonGroupDirective,
    DensityDirective,
    CardCreateComponent,
    NgmSearchComponent
  ],
  exports: [],
  declarations: [PACDataSourcesComponent, PACDataSourceCreationComponent],
  providers: []
})
export class PACDataSourcesModule {}
