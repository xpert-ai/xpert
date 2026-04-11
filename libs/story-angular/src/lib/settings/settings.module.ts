import { NgModule } from '@angular/core'
import { ButtonGroupDirective } from '@xpert-ai/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { PreferencesComponent } from './preferences/preferences.component'
import { ZardDialogModule, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PreferencesComponent],
  imports: [
    ZardIconComponent,
    ZardDialogModule,
    FormlyModule,
    TranslateModule,
    ButtonGroupDirective
  ],
  exports: [PreferencesComponent]
})
export class NxStorySettingsModule {}
