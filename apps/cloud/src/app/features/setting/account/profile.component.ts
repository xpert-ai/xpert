import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { UsersService } from '@cloud/app/@core/state'
import { TranslateModule } from '@ngx-translate/core'
import { IUser, IUserUpdateInput, LanguagesEnum } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardFormFieldComponent,
  ZardFormLabelComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { isNil, omitBy } from 'lodash-es'
import { catchError, firstValueFrom, map, of } from 'rxjs'
import { getErrorMessage, LANGUAGES, RoleService, Store, ToastrService } from '../../../@core'
import { timezones } from '../../../@core/constants'
import { CreatedByPipe } from '../../../@shared/pipes'

@Component({
  standalone: true,
  selector: 'xp-account-profile',
  templateUrl: './profile.component.html',
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardFormFieldComponent,
    ZardFormLabelComponent,
    ZardInputDirective
  ]
})
export class XpAccountProfileComponent {
  private readonly store = inject(Store)
  private readonly userService = inject(UsersService)
  private readonly toastr = inject(ToastrService)
  readonly user = toSignal(this.store.user$)
  private readonly roles = toSignal(
    inject(RoleService)
      .getAll()
      .pipe(
        map(({ items }) => items),
        catchError(() => of([]))
      ),
    { initialValue: [] }
  )
  readonly roleLabel = computed(
    () =>
      this.user()?.role?.name ||
      this.roles().find(({ id }) => id === this.user()?.roleId)?.name ||
      this.user()?.roleId ||
      '—'
  )
  readonly languages = LANGUAGES
  readonly timeZones = timezones.map(({ value, name }) => ({ value: String(value), label: name }))
  readonly saving = signal(false)
  readonly form = new FormGroup({
    firstName: new FormControl<string>(null),
    lastName: new FormControl<string>(null),
    username: new FormControl<string>(null, Validators.required),
    email: new FormControl<string>({ value: null, disabled: true }),
    imageUrl: new FormControl<string>(null),
    preferredLanguage: new FormControl<string>(null),
    timeZone: new FormControl<string>(null)
  })

  constructor() {
    effect(() => this.form.reset(this.profileValues(this.user())))
  }

  reset() {
    if (!this.saving()) {
      this.form.reset(this.profileValues(this.store.user))
    }
  }

  async save() {
    if (this.form.invalid || this.form.pristine || this.saving()) {
      this.form.markAllAsTouched()
      return
    }

    const { firstName, lastName, username, imageUrl, preferredLanguage, timeZone } = this.form.getRawValue()
    const request: IUserUpdateInput = {
      email: this.user()?.email,
      firstName,
      lastName,
      tags: this.user()?.tags,
      username,
      imageUrl,
      preferredLanguage: preferredLanguage as LanguagesEnum,
      timeZone
    }

    this.saving.set(true)
    try {
      const user = await firstValueFrom(this.userService.updateMe(request))
      this.toastr.success('XP.NOTES.USERS.USER_UPDATED', {
        Default: 'User Updated',
        name: new CreatedByPipe().transform({ ...this.user(), ...request })
      })
      this.store.user = { ...this.store.user, ...omitBy(user, isNil) }
      this.form.markAsPristine()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  private profileValues(user: IUser) {
    return {
      firstName: user?.firstName,
      lastName: user?.lastName,
      username: user?.username,
      email: user?.email,
      imageUrl: user?.imageUrl,
      preferredLanguage: user?.preferredLanguage,
      timeZone: user?.timeZone
    }
  }
}
