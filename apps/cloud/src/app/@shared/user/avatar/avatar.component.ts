
import { Component, Input } from '@angular/core'
import { IUser } from '../../../@core'
import { UserPipe } from "../../pipes"
import { AvatarComponent } from '../../files'

/**
 * 内容用 AvatarComponent 替代
 */
@Component({
    standalone: true,
    selector: 'pac-user-avatar',
    template: `<pac-avatar [imageUrl]="user?.imageUrl" alt="{{user | user}}"/>`,
    styles: [``],
    imports: [UserPipe, AvatarComponent]
})
export class UserAvatarComponent {
  @Input() user?: IUser
}
