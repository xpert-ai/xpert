
import { Component, Input } from '@angular/core'
import { IUser } from '../../../@core'
import { UserPipe } from "../../pipes"

@Component({
    standalone: true,
    selector: 'pac-user-profile-card',
    templateUrl: 'profile.component.html',
    styleUrls: ['profile.component.scss'],
    imports: [UserPipe]
})
export class UserProfileComponent {
  @Input() user?: IUser
}
