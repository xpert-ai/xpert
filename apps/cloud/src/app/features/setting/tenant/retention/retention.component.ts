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
  DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS,
  MAX_COPILOT_CHECKPOINT_RETENTION_DAYS,
  MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS,
  MIN_COPILOT_CHECKPOINT_RETENTION_DAYS,
  MIN_MODEL_GATEWAY_CALL_RETENTION_DAYS,
  MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
  MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING
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
  readonly minModelGatewayCallRetentionDays = MIN_MODEL_GATEWAY_CALL_RETENTION_DAYS
  readonly maxModelGatewayCallRetentionDays = MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS
  readonly modelGatewayCallRetentionDaysErrorDefault = `Enter an integer from ${MIN_MODEL_GATEWAY_CALL_RETENTION_DAYS} to ${MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS}`
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
    }),
    modelGatewayCallRetentionEnabled: new FormControl<boolean>(false, {
      nonNullable: true
    }),
    modelGatewayCallRetentionDays: new FormControl<number>(DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS, {
      nonNullable: true,
      validators: [
        Validators.required,
        integerValidator,
        Validators.min(MIN_MODEL_GATEWAY_CALL_RETENTION_DAYS),
        Validators.max(MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS)
      ]
    })
  })

  get retentionDaysCtrl() {
    return this.form.controls.retentionDays
  }

  get enabledCtrl() {
    return this.form.controls.enabled
  }

  get modelGatewayCallRetentionEnabledCtrl() {
    return this.form.controls.modelGatewayCallRetentionEnabled
  }

  get modelGatewayCallRetentionDaysCtrl() {
    return this.form.controls.modelGatewayCallRetentionDays
  }

  async ngOnInit() {
    this.loading.set(true)
    try {
      const settings = await this.#tenantService.getSettings()
      this.form.patchValue({
        enabled: parseEnabled(settings?.[COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING]),
        retentionDays: parseRetentionDays(
          settings?.[COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING],
          MIN_COPILOT_CHECKPOINT_RETENTION_DAYS,
          MAX_COPILOT_CHECKPOINT_RETENTION_DAYS,
          DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS
        ),
        modelGatewayCallRetentionEnabled: parseEnabled(
          settings?.[MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING]
        ),
        modelGatewayCallRetentionDays: parseRetentionDays(
          settings?.[MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING],
          MIN_MODEL_GATEWAY_CALL_RETENTION_DAYS,
          MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS,
          DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS
        )
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
        [COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING]: String(this.retentionDaysCtrl.value),
        [MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING]: String(this.modelGatewayCallRetentionEnabledCtrl.value),
        [MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING]: String(this.modelGatewayCallRetentionDaysCtrl.value)
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

function parseRetentionDays(value: unknown, min: number, max: number, defaultValue: number): number {
  const parsed = Number(value)
  return isValidRetentionDays(parsed, min, max) ? parsed : defaultValue
}

function integerValidator(control: AbstractControl<unknown>): ValidationErrors | null {
  const value = control.value
  if (value === null || value === undefined || value === '') {
    return null
  }

  return isInteger(value) ? null : { integer: true }
}

function isValidRetentionDays(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function isInteger(value: unknown): boolean {
  const parsed = Number(value)
  return Number.isInteger(parsed)
}
