import { CommonModule } from '@angular/common'
import { Component, effect, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { UserPipe } from '../../../@shared'
import { HeaderSettingsComponent } from '../settings/settings.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { IUser } from '@metad/contracts'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, CdkMenuModule, TranslateModule, UserPipe, HeaderSettingsComponent],
  selector: 'pac-header-user',
  templateUrl: './user.component.html'
})
export class HeaderUserComponent {
  readonly user = input<IUser>()

  constructor() {
    effect(() => {
        console.log(this.user())
    })
  }
}
