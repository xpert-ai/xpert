import { NgModule } from '@angular/core'
import { NgmCommonModule, ResizerModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmEntitySchemaComponent } from '@metad/ocap-angular/entity'
import { MtxCheckboxGroupModule } from '@ng-matero/extensions/checkbox-group'
import { NgmDialogComponent } from '@metad/components/dialog'
import { InlineSearchComponent } from 'apps/cloud/src/app/@shared/form-fields'
import { AccessControlRoutingModule } from './access-control-routing.module'
import { AccessControlComponent } from './access-control.component'
import { AccessOverviewComponent } from './overview/overview.component'
import { CubeComponent } from './role/cube/cube.component'
import { RoleOverviewComponent } from './role/overview/overview.component'
import { RoleComponent } from './role/role.component'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'

@NgModule({
  imports: [
    SharedModule,
    MaterialModule,
    AccessControlRoutingModule,
    MtxCheckboxGroupModule,

    ButtonGroupDirective,
    InlineSearchComponent,

    OcapCoreModule,
    NgmEntitySchemaComponent,
    ResizerModule,
    NgmCommonModule,
    NgmDialogComponent,
    UserProfileInlineComponent
  ],
  exports: [],
  declarations: [
    AccessControlComponent,
    AccessOverviewComponent,
    RoleComponent,
    RoleOverviewComponent,
    CubeComponent,
  ],
  providers: []
})
export class AccessControlModule {}
