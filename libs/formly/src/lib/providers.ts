import { importProvidersFrom } from '@angular/core'
import { AbstractControl } from '@angular/forms'
import { PacFormlyColorsComponent } from '@metad/formly/colors'
import { NgmFormlyToggleComponent } from '@metad/formly/mat-toggle'
import { FORMLY_CONFIG, FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { FormlyMatRadioModule } from '@ngx-formly/material/radio'
import { TranslateService } from '@ngx-translate/core'

export function provideFormly() {
  return { provide: FORMLY_CONFIG, multi: true, useFactory: formlyValidationConfig, deps: [TranslateService] }
}

export function fieldMatchValidator(control: AbstractControl, field: FormlyFieldConfig, options = {password: 'password', passwordConfirm: 'passwordConfirm'}) {
  const password = control.value[options.password]
  const passwordConfirm = control.value[options.passwordConfirm]

  // avoid displaying the message error when values are empty
  if (!passwordConfirm || !password) {
    return null;
  }

  if (passwordConfirm === password) {
    return null;
  }
  console.log(passwordConfirm, password)

  return { fieldMatch: { message: 'Password Not Matching' } };
}

export function formlyValidationConfig(translate: TranslateService) {
  return {
    validationMessages: [
      {
        name: 'required',
        message() {
          return translate.stream('FORMLY.VALIDATION.REQUIRED', { Default: 'Required' })
        }
      },
      {
        name: 'minLength',
        message(err, field: FormlyFieldConfig) {
          return translate.stream('FORMLY.VALIDATION.MinLength', {
            Default: `Should have atleast ${field.props.minLength} characters`,
            minLength: field.props.minLength
          })
        }
      },
      {
        name: 'maxLength',
        message(err, field: FormlyFieldConfig) {
          return translate.stream('FORMLY.VALIDATION.MaxLength', {
            Default: `Should have less than ${field.props.maxLength} characters`,
            maxLength: field.props.maxLength
          })
        }
      },
      {
        name: 'min',
        message(err, field: FormlyFieldConfig) {
          return translate.stream('FORMLY.VALIDATION.Min', {
            Default: 'This value should be more than ' + field.props.min,
            min: field.props.min
          })
        }
      },
      {
        name: 'max',
        message(err, field: FormlyFieldConfig) {
          return translate.stream('FORMLY.VALIDATION.Max', {
            Default: `This value should be less than ${field.props.max}`,
            max: field.props.max
          })
        }
      },
      {
        name: 'pattern',
        message(err, field: FormlyFieldConfig) {
          // Check if it's an email pattern validation
          if (field.key === 'email' || field.props?.type === 'email') {
            return translate.stream('FORMLY.VALIDATION.EMAIL', { Default: 'Please enter a valid email address' })
          }
          return translate.stream('FORMLY.VALIDATION.PATTERN', { Default: 'Invalid format' })
        }
      },
      {
        name: 'email',
        message() {
          return translate.stream('FORMLY.VALIDATION.EMAIL', { Default: 'Please enter a valid email address' })
        }
      },
    ],
    types: [
      {
        name: 'colors',
        component: PacFormlyColorsComponent
      }
    ],
    validators: [
      { name: 'fieldMatch', validation: fieldMatchValidator },
    ]
  }
}

export function provideFormlyMaterial() {
  return [
    importProvidersFrom(FormlyMatRadioModule),
    ...FormlyModule.forChild({
      types: [
        {
          name: 'toggle',
          component: NgmFormlyToggleComponent
        }
        // {
        //   name: 'textarea',
        //   component: FormlyFieldTextArea,
        //   wrappers: ['form-field']
        // }
      ]
    }).providers
  ]
}
