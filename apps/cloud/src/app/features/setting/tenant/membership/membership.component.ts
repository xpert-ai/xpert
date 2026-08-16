import { CommonModule } from '@angular/common'
import { Component, OnInit, inject, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { DEFAULT_MEMBERSHIP_CNY_PER_POINT, MEMBERSHIP_CNY_PER_POINT_SETTING } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'
import { TenantService, ToastrService, getErrorMessage } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'xp-tenant-membership',
  templateUrl: './membership.component.html',
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
    `
  ],
  imports: [
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    ...ZardFormImports,
    ZardInputDirective,
    ZardButtonComponent
  ]
})
export class TenantMembershipComponent implements OnInit {
  readonly #tenantService = inject(TenantService)
  readonly #toastr = inject(ToastrService)

  readonly loading = signal(false)
  readonly form = new FormGroup({
    cnyPerPoint: new FormControl<number>(DEFAULT_MEMBERSHIP_CNY_PER_POINT, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.000001)]
    })
  })

  get cnyPerPointCtrl() {
    return this.form.controls.cnyPerPoint
  }

  async ngOnInit() {
    this.loading.set(true)
    try {
      const settings = await this.#tenantService.getSettings()
      this.form.patchValue({
        cnyPerPoint: parseCnyPerPoint(settings?.[MEMBERSHIP_CNY_PER_POINT_SETTING])
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
        [MEMBERSHIP_CNY_PER_POINT_SETTING]: String(this.cnyPerPointCtrl.value)
      })
      this.form.markAsPristine()
      this.#toastr.success('XP.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}

function parseCnyPerPoint(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MEMBERSHIP_CNY_PER_POINT
}
