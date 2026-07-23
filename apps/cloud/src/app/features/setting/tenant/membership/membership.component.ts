import { CommonModule } from '@angular/common'
import { Component, OnInit, inject, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  DEFAULT_MEMBERSHIP_TOKENS_PER_POINT,
  MEMBERSHIP_TOKENS_PER_POINT_OPTIONS,
  MEMBERSHIP_TOKENS_PER_POINT_SETTING
} from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardFormImports, ZardSelectImports } from '@xpert-ai/headless-ui'
import { TenantService, ToastrService, getErrorMessage } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'pac-tenant-membership',
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
    ...ZardSelectImports,
    ZardButtonComponent
  ]
})
export class TenantMembershipComponent implements OnInit {
  readonly #tenantService = inject(TenantService)
  readonly #toastr = inject(ToastrService)

  readonly tokensPerPointOptions = MEMBERSHIP_TOKENS_PER_POINT_OPTIONS
  readonly loading = signal(false)
  readonly form = new FormGroup({
    tokensPerPoint: new FormControl<number>(DEFAULT_MEMBERSHIP_TOKENS_PER_POINT, {
      nonNullable: true,
      validators: [Validators.required]
    })
  })

  get tokensPerPointCtrl() {
    return this.form.controls.tokensPerPoint
  }

  async ngOnInit() {
    this.loading.set(true)
    try {
      const settings = await this.#tenantService.getSettings()
      this.form.patchValue({
        tokensPerPoint: parseTokensPerPoint(settings?.[MEMBERSHIP_TOKENS_PER_POINT_SETTING])
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
        [MEMBERSHIP_TOKENS_PER_POINT_SETTING]: String(this.tokensPerPointCtrl.value)
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

function parseTokensPerPoint(value: unknown): number {
  const parsed = Number(value)
  return MEMBERSHIP_TOKENS_PER_POINT_OPTIONS.some((option) => option === parsed)
    ? parsed
    : DEFAULT_MEMBERSHIP_TOKENS_PER_POINT
}
