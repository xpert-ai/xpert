import { RetentionDateTimeComponent } from './retention-date-time.component'
import { DatePipe } from '@angular/common'
import { Component, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms'
import {
  ManualRetentionPreview,
  ManualRetentionRange,
  ManualRetentionResult,
  ManualRetentionTarget
} from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCheckboxComponent, ZardFormImports, ZardSelectImports } from '@xpert-ai/headless-ui'
import { TenantService, ToastrService, getErrorMessage } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'xp-manual-cleanup',
  templateUrl: './manual-cleanup.component.html',
  imports: [
    DatePipe,
    TranslateModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    RetentionDateTimeComponent,
    ...ZardFormImports,
    ...ZardSelectImports
  ]
})
export class ManualCleanupComponent {
  private readonly tenant = inject(TenantService)
  private readonly toastr = inject(ToastrService)
  private readonly destroyRef = inject(DestroyRef)
  readonly busy = signal(false)
  readonly preview = signal<ManualRetentionPreview | null>(null)
  readonly result = signal<ManualRetentionResult | null>(null)
  readonly confirmed = new FormControl(false, { nonNullable: true })
  readonly form = new FormGroup(
    {
      target: new FormControl<ManualRetentionTarget>('copilot_checkpoint', { nonNullable: true }),
      start: new FormControl('', { nonNullable: true, validators: Validators.required }),
      end: new FormControl('', { nonNullable: true, validators: Validators.required })
    },
    { validators: timeRangeValidator }
  )
  private revision = 0

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.revision++
      this.preview.set(null)
      this.result.set(null)
      this.confirmed.setValue(false)
    })
  }

  async previewCleanup() {
    if (this.busy()) return
    this.form.updateValueAndValidity()
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    const { target, start, end } = this.form.getRawValue()
    const range: ManualRetentionRange = {
      target,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString()
    }
    const revision = this.revision
    this.preview.set(null)
    this.result.set(null)
    this.confirmed.setValue(false)
    this.busy.set(true)
    try {
      const preview = await this.tenant.previewCleanup(range)
      if (revision === this.revision) this.preview.set(preview)
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  async executeCleanup() {
    const preview = this.preview()
    if (this.busy() || !preview || !this.confirmed.value || !preview.selectedCount) return
    this.busy.set(true)
    try {
      this.result.set(await this.tenant.executeCleanup(preview.previewToken))
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.preview.set(null)
      this.confirmed.setValue(false)
      this.busy.set(false)
    }
  }
}

function timeRangeValidator(control: AbstractControl): ValidationErrors | null {
  const start = Date.parse(control.get('start')?.value)
  const end = Date.parse(control.get('end')?.value)
  return Number.isFinite(start) && Number.isFinite(end) && start < end && end <= Date.now() ? null : { timeRange: true }
}
