import { CommonModule } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatTabsModule } from '@angular/material/tabs'
import { matchValidator, matchWithValidator } from '@metad/cloud/auth'
import { UsersService } from '@metad/cloud/state'
import { pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { cloneDeep } from 'lodash-es'
import { firstValueFrom } from 'rxjs'
import { HttpStatus, Store, ToastrService, User, getErrorMessage } from '../../../@core'
import { UserFormsModule } from '../../../@shared/user/forms'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    UserFormsModule,
    TranslateModule
  ],
  selector: 'pac-account-password',
  template: `<form
    class="flex flex-col items-start justify-start p-4 m-auto w-96"
    [formGroup]="passwordForm"
    (ngSubmit)="resetPassword()"
  >
    <input
      matInput
      type="text"
      id="username"
      name="username"
      autocomplete="username"
      aria-hidden="true"
      class="hidden"
    />
    <mat-form-field appearance="fill" floatLabel="always" class="self-stretch">
      <mat-label>
        {{ 'PAC.KEY_WORDS.CurrentPassword' | translate: { Default: 'Current Password' } }}
      </mat-label>
      <input type="password" matInput formControlName="hash" autocomplete="current-password" />
      <mat-error *ngIf="hash.invalid">{{ 'PAC.KEY_WORDS.Error' | translate: { Default: 'Error' } }}</mat-error>
    </mat-form-field>
    <mat-form-field appearance="fill" floatLabel="always" class="self-stretch">
      <mat-label>
        {{ 'PAC.KEY_WORDS.NewPassword' | translate: { Default: 'New Password' } }}
      </mat-label>
      <input type="password" matInput formControlName="password" autocomplete="new-password" />
      @if (minlengthError(); as error) {
        <mat-error>
          {{ 'PAC.Onboarding.Minlength' | translate: { Default: 'Min length' } }} {{ error.requiredLength }}
          {{ 'PAC.Onboarding.Actuallength' | translate: { Default: 'actual length' } }}
          {{ error.actualLength }}</mat-error>
      }
    </mat-form-field>

    <mat-form-field appearance="fill" floatLabel="always" class="self-stretch">
      <mat-label>
        {{ 'PAC.KEY_WORDS.ConfirmPassword' | translate: { Default: 'Confirm Password' } }}
      </mat-label>
      <input type="password" matInput formControlName="confirmPassword" autocomplete="new-password" />
      @if (mustMatchError(); as error) {
        <mat-error>{{ 'PAC.Onboarding.PasswordMustMatch' | translate: { Default: 'Password must match' } }}</mat-error>
      }
    </mat-form-field>

    <div class="w-full flex justify-center items-center gap-2">
      <button
        type="button"
        class="btn disabled:btn-disabled btn-primary btn-large"
        [disabled]="passwordForm.pristine || passwordForm.invalid || loading()"
      >
        {{ 'PAC.ACTIONS.Save' | translate: { Default: 'Save' } }}
      </button>
    </div>
  </form>`,
  styles: [``]
})
export class PACAccountPasswordComponent {
  user: User
  readonly passwordControl = new FormControl(null, [Validators.required, Validators.minLength(8)])
  passwordForm = new FormGroup({
    hash: new FormControl(null),
    password: this.passwordControl,
    confirmPassword: new FormControl(null, [Validators.required, matchWithValidator(this.passwordControl)])
  },
  {
    validators: [matchValidator('password', 'confirmPassword')],
  })

  get hash() {
    return this.passwordForm.get('hash')
  }

  readonly loading = signal(false)

  private _userSub = this.store.user$.pipe(takeUntilDestroyed()).subscribe((user) => {
    this.user = cloneDeep(user) as User
  })
  constructor(
    private readonly store: Store,
    private readonly userService: UsersService,
    private readonly _toastrService: ToastrService
  ) {
  }

  minlengthError() {
    return this.passwordForm.get('password').getError('minlength')
  }

  mustMatchError() {
    return this.passwordForm.get('confirmPassword').getError('mismatch')
  }

  async resetPassword() {
    if (this.passwordForm.valid) {
      try {
        this.loading.set(true)
        await firstValueFrom(this.userService.password(this.user.id, pick(this.passwordForm.value, 'hash', 'password')))
        this.passwordForm.markAsPristine()
        this._toastrService.success('PAC.MESSAGE.PasswordChange', { Default: 'Password change' })
      } catch (err) {
        this._toastrService.error(getErrorMessage(err))
        if (err instanceof HttpErrorResponse) {
          if (err.status === HttpStatus.FORBIDDEN) {
            this.passwordForm.get('hash').setErrors({
              error: `Error`
            })
          }
        }
      } finally {
        this.loading.set(false)
      }
    }
  }
}
