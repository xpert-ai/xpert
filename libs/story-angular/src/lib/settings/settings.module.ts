import { NgModule } from '@angular/core'
import { MatDialogModule } from '@angular/material/dialog'
import { MatListModule } from '@angular/material/list'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { PreferencesComponent } from './preferences/preferences.component'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PreferencesComponent],
  imports: [
    ZardIconComponent,
    MatListModule,
    MatDialogModule,
    FormlyModule,
    TranslateModule,
    ButtonGroupDirective
  ],
  exports: [PreferencesComponent]
})
export class NxStorySettingsModule {}
