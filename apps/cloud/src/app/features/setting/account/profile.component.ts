import { CommonModule } from '@angular/common'
import { Component, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { IUser, UsersService } from '@metad/cloud/state'
import { linkedModel } from '@metad/core'
import { isNil, omitBy } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { IUserUpdateInput, LanguagesEnum, Store, ToastrService } from '../../../@core'
import { CreatedByPipe } from '../../../@shared/pipes'
import { UserFormsModule } from '../../../@shared/user'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, UserFormsModule, TranslateModule],
  selector: 'pac-account-profile',
  template: `<div class="flex flex-col items-center justify-start p-4">
    <pac-user-basic-info-form #form class="block max-w-full md:max-w-[600px] lg:max-w-[900px]" [(ngModel)]="user" />

    <div class="w-full flex justify-center items-center gap-2">
      <button type="button" class="btn disabled:btn-disabled btn-large" (click)="reset()">
        {{ 'PAC.ACTIONS.Reset' | translate: { Default: 'Reset' } }}
      </button>
      <button
        type="button"
        class="btn disabled:btn-disabled btn-primary btn-large"
        [disabled]="form.form.invalid || form.form.pristine"
        (click)="save(form.form)"
      >
        {{ 'PAC.ACTIONS.Save' | translate: { Default: 'Save' } }}
      </button>
    </div>
  </div>`,
  styles: [``]
})
export class PACAccountProfileComponent {
  readonly #user = toSignal(this.store.user$)
  readonly reloadTrigger = signal(0)

  readonly user = linkedModel<IUser & { password?: string }>({
    initialValue: null,
    compute: () => {
      this.reloadTrigger()
      return { ...this.#user() }
    },
    update: (user) => {
      //
    }
  })

  constructor(
    private readonly store: Store,
    private readonly userService: UsersService,
    private readonly _toastrService: ToastrService,
  ) {}

  reset() {
    this.reloadTrigger.update((state) => state + 1)
  }

  save(form: FormGroup) {
    const { email, firstName, lastName, tags, preferredLanguage, username, password, imageUrl, timeZone } = this.user()
    let request: IUserUpdateInput = {
      email,
      firstName,
      lastName,
      tags,
      username,
      imageUrl,
      preferredLanguage: preferredLanguage as LanguagesEnum,
      timeZone
    }

    if (password) {
      request = {
        ...request,
        hash: password
      }
    }

    this.userService.updateMe(request).subscribe({
      next: (user) => {
        this._toastrService.success(`PAC.NOTES.USERS.USER_UPDATED`, {
          Default: 'User Updated',
          name: new CreatedByPipe().transform(this.user())
        })
        form.markAsPristine()
        this.store.user = {
          ...this.store.user,
          ...omitBy(user, isNil)
        }
      },
      error: (error) => {
        this._toastrService.error(error)
      }
    })
  }
}
