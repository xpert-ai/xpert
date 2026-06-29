import { Component, OnInit, inject, signal } from '@angular/core'
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms'
import {
  COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
  COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
  DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS,
  MAX_COPILOT_CHECKPOINT_RETENTION_DAYS,
  MIN_COPILOT_CHECKPOINT_RETENTION_DAYS
} from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import { TenantService, ToastrService, getErrorMessage } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'pac-tenant-retention',
  templateUrl: './retention.component.html',
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
    `
  ],
  imports: [
    TranslateModule,
    ReactiveFormsModule,
    ...ZardFormImports,
    ZardInputDirective,
    ZardButtonComponent,
    ZardSwitchComponent
  ]
})
export class TenantRetentionComponent implements OnInit {
  readonly #tenantService = inject(TenantService)
  readonly #toastr = inject(ToastrService)

  readonly minRetentionDays = MIN_COPILOT_CHECKPOINT_RETENTION_DAYS
  readonly maxRetentionDays = MAX_COPILOT_CHECKPOINT_RETENTION_DAYS
  readonly retentionDaysErrorDefault = `Enter an integer from ${MIN_COPILOT_CHECKPOINT_RETENTION_DAYS} to ${MAX_COPILOT_CHECKPOINT_RETENTION_DAYS}`
  readonly loading = signal(false)
  readonly form = new FormGroup({
    enabled: new FormControl<boolean>(false, {
      nonNullable: true
    }),
    retentionDays: new FormControl<number>(DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS, {
      nonNullable: true,
      validators: [
        Validators.required,
        integerValidator,
        Validators.min(MIN_COPILOT_CHECKPOINT_RETENTION_DAYS),
        Validators.max(MAX_COPILOT_CHECKPOINT_RETENTION_DAYS)
      ]
    })
  })

  get retentionDaysCtrl() {
    return this.form.controls.retentionDays
  }

  get enabledCtrl() {
    return this.form.controls.enabled
  }

  async ngOnInit() {
    this.loading.set(true)
    try {
      const settings = await this.#tenantService.getSettings()
      this.form.patchValue({
        enabled: parseEnabled(settings?.[COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING]),
        retentionDays: parseRetentionDays(settings?.[COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING])
      })
      this.form.markAsPristine()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }

    this.loading.set(true)
    try {
      await this.#tenantService.saveSettings({
        [COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING]: String(this.enabledCtrl.value),
        [COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING]: String(this.retentionDaysCtrl.value)
      })
      this.form.markAsPristine()
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}

function parseEnabled(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parseRetentionDays(value: unknown): number {
  const parsed = Number(value)
  return isValidRetentionDays(parsed)
    ? parsed
    : DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS
}

function integerValidator(control: AbstractControl<unknown>): ValidationErrors | null {
  const value = control.value
  if (value === null || value === undefined || value === '') {
    return null
  }

  return isInteger(value) ? null : { integer: true }
}

function isValidRetentionDays(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_COPILOT_CHECKPOINT_RETENTION_DAYS &&
    value <= MAX_COPILOT_CHECKPOINT_RETENTION_DAYS
  )
}

function isInteger(value: unknown): boolean {
  const parsed = Number(value)
  return Number.isInteger(parsed)
}
