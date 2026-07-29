import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms'
import { passwordStrength } from './password-strength'

/**
 * Password strength validator
 *
 * @param control
 * @returns `strength` error if the password has status
 */
export const passwordStrengthValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value: string = control.value || ''
  const status = passwordStrength(value).value

  return {
    strength: status
  }
}

/**
 * Must match validator
 *
 * @param controlName
 * @param matchingControlName
 * @returns `mismatch` error if the two controls don't match
 */
export function matchValidator(controlName: string, matchingControlName: string): ValidatorFn {
  return (formGroup: AbstractControl): ValidationErrors | null => {
    const control = formGroup.get(controlName)
    const matchingControl = formGroup.get(matchingControlName)

    if (!control || !matchingControl || control.value === matchingControl.value) {
      return null
    } else {
      return { mismatch: true }
    }
  }
}

/**
 * Must match validator
 *
 * @param matchingControl
 * @returns `mismatch` error if the two controls don't match
 */
export function matchWithValidator(matchingControl: AbstractControl)
export function matchWithValidator(formGroup: AbstractControl, controlName?: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const matchingControl = controlName ? formGroup.get(controlName) : formGroup
    if (!control || !matchingControl || control.value === matchingControl.value) {
      return null
    } else {
      return { mismatch: true }
    }
  }
}
