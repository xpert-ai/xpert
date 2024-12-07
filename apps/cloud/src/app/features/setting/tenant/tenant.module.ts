import { NgModule } from '@angular/core'
import { RouterModule } from '@angular/router'
import { NgmCommonModule, NgmTableComponent } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { DemoComponent } from './demo/demo.component'
import { SettingsComponent } from './settings/settings.component'
import { TenantRoutingModule } from './tenant-routing.module'
import { PACTenantComponent } from './tenant.component'
import { MaterialModule } from '../../../@shared/material.module'
import { SharedModule } from '../../../@shared/shared.module'

@NgModule({
  imports: [
    SharedModule,
    MaterialModule,
    RouterModule,
    TenantRoutingModule,
    OcapCoreModule,
    NgmCommonModule,
    NgmTableComponent
  ],
  exports: [],
  declarations: [PACTenantComponent, SettingsComponent, DemoComponent],
  providers: []
})
export class TenantModule {}
