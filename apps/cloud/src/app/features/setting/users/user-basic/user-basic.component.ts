import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { UsersService } from '@cloud/app/@core/state'
import { IUser, IUserUpdateInput, IXpertPrincipalReference, LanguagesEnum } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardFormLabelComponent,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { combineLatest, of } from 'rxjs'
import { catchError, startWith, switchMap } from 'rxjs/operators'
import { CreatedByPipe } from '../../../../@shared/pipes'
import { getErrorMessage, LANGUAGES, ToastrService, XpertAPIService } from '../../../../@core'
import { timezones } from '../../../../@core/constants'
import { XpEditUserComponent } from '../edit-user/edit-user.component'

@Component({
  standalone: true,
  selector: 'xp-user-basic',
  templateUrl: 'user-basic.component.html',
  host: { class: 'block min-w-0' },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardFormLabelComponent,
    ZardIconComponent,
    ZardInputDirective
  ]
})
export class UserBasicComponent {
  readonly userComponent = inject(XpEditUserComponent)
  private readonly userService = inject(UsersService)
  private readonly xpertService = inject(XpertAPIService)
  private readonly toastr = inject(ToastrService)
  readonly allowRoleChange = input<boolean>()
  readonly readOnly = input(false)
  readonly showLinkedXpert = input(false)
  readonly saving = signal(false)
  readonly languages = LANGUAGES
  readonly timeZones = timezones.map(({ value, name }) => ({ value: String(value), label: name }))
  readonly roleOptions = computed(() => this.userComponent.roles().map(({ id, name }) => ({ value: id, label: name })))
  readonly readonlyHint = computed(() =>
    this.showLinkedXpert()
      ? 'XP.Users.TechnicalUserReadonlyHint'
      : this.userComponent.isTenantScope()
        ? 'XP.UserDetail.ReadOnlyHint'
        : 'XP.UserDetail.OrganizationReadOnlyHint'
  )
  readonly accountFields = [
    { key: 'firstName', label: 'XP.UserDetail.FirstName', autocomplete: 'given-name', required: false },
    { key: 'lastName', label: 'XP.UserDetail.LastName', autocomplete: 'family-name', required: false },
    { key: 'username', label: 'XP.SHARED.USER_BASIC.Username', autocomplete: 'username', required: true },
    { key: 'email', label: 'XP.SHARED.USER_BASIC.Email', autocomplete: 'email', required: true }
  ] as const
  readonly extraFields = [
    { key: 'thirdPartyId', label: 'XP.SHARED.USER_BASIC.ThirdPartyId', autocomplete: 'off', required: false },
    { key: 'imageUrl', label: 'XP.SHARED.USER_BASIC.AvatarUrl', autocomplete: 'url', required: false }
  ] as const
  readonly form = new FormGroup({
    firstName: new FormControl<string>(null),
    lastName: new FormControl<string>(null),
    username: new FormControl<string>(null, Validators.required),
    email: new FormControl<string>(null, [
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/)
    ]),
    roleId: new FormControl<string>(null, Validators.required),
    preferredLanguage: new FormControl<string>(null),
    timeZone: new FormControl<string>(null),
    thirdPartyId: new FormControl<string>(null),
    imageUrl: new FormControl<string>(null)
  })
  readonly linkedXpert = toSignal<IXpertPrincipalReference | null | undefined>(
    combineLatest([toObservable(this.showLinkedXpert), this.userComponent.userId$]).pipe(
      switchMap(([show, userId]) =>
        show && userId
          ? this.xpertService.getByPrincipalUser(userId).pipe(
              startWith(undefined),
              catchError(() => of(null))
            )
          : of(null)
      )
    ),
    { initialValue: undefined }
  )
  private loadedUser: IUser
  private loadedUserId: string

  constructor() {
    effect(() => {
      const user = this.userComponent.user()
      if (user) {
        this.loadedUser = user
        this.loadedUserId = user.id
        this.reset()
      }
    })
    effect(() => {
      if (this.readOnly()) this.form.disable({ emitEvent: false })
      else {
        this.form.enable({ emitEvent: false })
        if (!this.allowRoleChange()) this.form.controls.roleId.disable({ emitEvent: false })
      }
    })
  }

  hasChanges() {
    return !this.readOnly() && this.form.dirty
  }

  reset() {
    const user = this.loadedUser
    if (!user) return
    this.form.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      roleId: user.roleId ?? user.role?.id,
      preferredLanguage: user.preferredLanguage,
      timeZone: user.timeZone,
      thirdPartyId: user.thirdPartyId,
      imageUrl: user.imageUrl
    })
  }

  languageLabel() {
    return (
      this.languages.find(({ value }) => value === this.loadedUser?.preferredLanguage)?.label ||
      this.loadedUser?.preferredLanguage
    )
  }
  timeZoneLabel() {
    return this.timeZones.find(({ value }) => value === this.loadedUser?.timeZone)?.label || this.loadedUser?.timeZone
  }

  fieldError(key: keyof typeof this.form.controls) {
    const control = this.form.controls[key]
    if (!control.touched || !control.invalid) return null
    if (control.hasError('pattern')) return 'FORMLY.VALIDATION.EMAIL'
    return 'XP.UserDetail.Required'
  }

  async save() {
    if (this.readOnly() || this.saving() || !this.loadedUserId) return
    if (this.form.invalid || this.form.pristine) {
      this.form.markAllAsTouched()
      return
    }
    const { roleId, preferredLanguage, ...values } = this.form.getRawValue()
    const request: IUserUpdateInput = {
      ...values,
      tags: this.loadedUser.tags,
      preferredLanguage: preferredLanguage as LanguagesEnum,
      ...(this.allowRoleChange() ? { roleId } : {})
    }
    const userId = this.loadedUserId
    this.saving.set(true)
    try {
      await this.userService.update(userId, request)
      this.toastr.success('XP.NOTES.USERS.USER_UPDATED', {
        name: new CreatedByPipe().transform({ ...this.loadedUser, ...request })
      })
      if (this.loadedUserId === userId) {
        this.form.markAsPristine()
        this.userComponent.reloadUser()
      }
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }
}
