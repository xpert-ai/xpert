import { PortalModule } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatSidenavModule } from '@angular/material/sidenav'
import { MatToolbarModule } from '@angular/material/toolbar'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NxComponentSettingsComponent } from './component-form/formly-form.component'
import { DesignerPanelComponent } from './panel/panel.component'
import { NgmSettingsPanelComponent } from './settings-panel/settings-panel.component'
import { ZardButtonComponent, ZardIconComponent, ZardTabsImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PortalModule,
    MatSidenavModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTabsImports,
    MatToolbarModule,
    ...ZardTooltipImports,
    FormlyModule,
    TranslateModule,

    // OCAP Modules
    OcapCoreModule,
    NgmSettingsPanelComponent,
    NxComponentSettingsComponent,
    DesignerPanelComponent
  ],
  exports: [NgmSettingsPanelComponent, NxComponentSettingsComponent, DesignerPanelComponent]
})
export class NxDesignerModule {}
