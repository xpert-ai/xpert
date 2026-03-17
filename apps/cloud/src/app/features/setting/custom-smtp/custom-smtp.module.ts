import { NgModule } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SMTPComponent } from '../../../@shared/smtp/smtp.component'
import { CustomSmtpRoutingModule } from './custom-smtp-routing.module'
import { CustomSmtpComponent } from './custom-smtp.component'
import { SharedUiModule } from '../../../@shared/ui.module'
import { SharedModule } from '../../../@shared/shared.module'

@NgModule({
  imports: [CustomSmtpRoutingModule, TranslateModule, SharedModule, SharedUiModule, SMTPComponent],
  declarations: [CustomSmtpComponent],
  providers: []
})
export class CustomSmtpModule {}
