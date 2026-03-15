
import { Component, input } from '@angular/core'
import { IUser } from '../../types'

@Component({
  standalone: true,
  selector: 'ngm-copilot-user-avatar',
  template: `<img class="" [src]="user()?.imageUrl || '/assets/images/avatar-default.svg'" alt="{{ user()?.name }}" />`,
  imports: []
})
export class UserAvatarComponent {
  readonly user = input<IUser>()
}
