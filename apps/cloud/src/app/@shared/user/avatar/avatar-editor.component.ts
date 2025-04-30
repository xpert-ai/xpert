import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, model, output } from '@angular/core'
import { Store, UsersService } from '@metad/cloud/state'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage, injectToastr, IUser } from '../../../@core'
import { AvatarEditorComponent } from '../../files'

/**
 *
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-user-avatar-editor',
  templateUrl: './avatar-editor.component.html',
  styles: [``],
  imports: [CommonModule, TranslateModule, AvatarEditorComponent]
})
export class UserAvatarEditorComponent {
  readonly #store = inject(Store)
  readonly userService = inject(UsersService)
  readonly #toastr = injectToastr()

  readonly user = model<IUser>()
  readonly userChange = output<IUser>()

  onUrlChange(event: string) {
    this.userService.updateMe({ imageUrl: event }).subscribe({
      next: (user) => {
        this.user.set(user)
        this.userChange.emit(user)
        this.#store.user = {
          ...this.#store.user,
          imageUrl: user.imageUrl
        }
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
