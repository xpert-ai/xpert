import { NgModule } from '@angular/core'
import { RouterModule } from '@angular/router'
import { XpCommonModule, ZardTableImports, ZardPaginatorComponent } from '@xpert-ai/headless-ui'
import { DemoComponent } from './demo/demo.component'
import { SettingsComponent } from './settings/settings.component'
import { SettingValueComponent } from './settings/setting-value.component'
import { SettingJsonEditorComponent } from './settings/setting-json-editor.component'
import { TenantRoutingModule } from './tenant-routing.module'
import { XpTenantComponent } from './tenant.component'
import { SharedUiModule } from '../../../@shared/ui.module'
import { SharedModule } from '../../../@shared/shared.module'
import { SMTPComponent } from '../../../@shared/smtp/smtp.component'

@NgModule({
  imports: [
    SharedModule,
    SharedUiModule,
    RouterModule,
    TenantRoutingModule,
    SMTPComponent,
    XpCommonModule,
    SettingValueComponent,
    SettingJsonEditorComponent,
    ...ZardTableImports,
    ZardPaginatorComponent
  ],
  exports: [],
  declarations: [XpTenantComponent, SettingsComponent, DemoComponent],
  providers: []
})
export class TenantModule {}
