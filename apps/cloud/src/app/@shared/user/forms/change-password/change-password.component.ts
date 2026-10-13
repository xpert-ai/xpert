import { Component, DestroyRef, forwardRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  ControlValueAccessor,
  FormControl,
  FormGroup,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  Validators
} from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardFormLabelComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { matchValidator } from '../../../../auth/services/validators'

type PasswordValue = { password: string; confirmPassword: string }

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, ZardFormLabelComponent, ZardInputDirective],
  selector: 'xp-user-change-password-form',
  templateUrl: 'change-password.component.html',
  providers: [
    { provide: NG_VALUE_ACCESSOR, multi: true, useExisting: forwardRef(() => UserChangePasswordFormComponent) }
  ]
})
export class UserChangePasswordFormComponent implements ControlValueAccessor {
  readonly form = new FormGroup(
    {
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirmPassword: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8)]
      })
    },
    { validators: matchValidator('password', 'confirmPassword') }
  )
  readonly fields = [
    { key: 'password', label: 'XP.PasswordSettings.NewPassword' },
    { key: 'confirmPassword', label: 'XP.PasswordSettings.ConfirmPassword' }
  ] as const
  private onChange: (value: PasswordValue) => void = () => undefined
  onTouched: () => void = () => undefined
  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.onChange(this.form.getRawValue()))
  }
  get invalid() {
    return this.form.invalid
  }
  writeValue(value: PasswordValue | null) {
    this.form.reset(value ?? { password: '', confirmPassword: '' }, { emitEvent: false })
  }
  registerOnChange(fn: (value: PasswordValue) => void) {
    this.onChange = fn
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn
  }
  setDisabledState(disabled: boolean) {
    disabled ? this.form.disable({ emitEvent: false }) : this.form.enable({ emitEvent: false })
  }
  errorFor(key: keyof PasswordValue) {
    const control = this.form.controls[key]
    if (!control.touched) return null
    if (control.hasError('required'))
      return key === 'password' ? 'XP.PasswordSettings.NewRequired' : 'XP.PasswordSettings.ConfirmationRequired'
    if (control.hasError('minlength')) return 'XP.PasswordSettings.MinLength'
    return key === 'confirmPassword' && this.form.hasError('mismatch') ? 'XP.PasswordSettings.MustMatch' : null
  }
}
