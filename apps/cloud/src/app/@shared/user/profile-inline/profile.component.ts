import { Component, input } from '@angular/core'
import { XpDensityDirective } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { IUser } from '../../../@core'
import { UserPipe } from '../../pipes'

@Component({
  standalone: true,
  selector: 'xp-user-profile-inline',
  templateUrl: 'profile.component.html',
  styleUrls: ['profile.component.scss'],
  imports: [TranslateModule, UserPipe],
  host: {
    class: 'xp-user-profile-inline'
  },
  hostDirectives: [
    {
      directive: XpDensityDirective,
      inputs: ['small', 'large']
    }
  ]
})
export class UserProfileInlineComponent {
  readonly user = input<IUser>()
  readonly isMe = input<boolean>(false)
}
