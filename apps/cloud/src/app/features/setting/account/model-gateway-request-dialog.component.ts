import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IModelGatewayCatalogItem } from '@xpert-ai/contracts'
import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective
} from '@xpert-ai/headless-ui'

export type ModelGatewayRequestDialogResult = {
  reason: string
}

@Component({
  standalone: true,
  selector: 'xp-model-gateway-request-dialog',
  imports: [ReactiveFormsModule, TranslateModule, ZardButtonComponent, ZardInputDirective, ...ZardFormImports],
  template: `
    <section>
      <h2 class="text-lg font-semibold text-text-primary">
        {{ 'XP.ModelGateway.ApplyTitle' | translate: { Default: 'Apply for external API access' } }}
      </h2>
      <p class="mt-2 text-sm text-text-secondary">{{ item.externalModelId }} · {{ item.provider }}/{{ item.model }}</p>
      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
        <z-form-field class="w-full">
          <z-form-label>{{ 'XP.ModelGateway.Reason' | translate: { Default: 'Reason' } }}</z-form-label>
          <textarea
            z-input
            class="min-h-28 resize-y"
            formControlName="reason"
            maxlength="1000"
            [placeholder]="
              'XP.ModelGateway.ReasonPlaceholder'
                | translate: { Default: 'Describe the external platform and expected usage.' }
            "
          ></textarea>
        </z-form-field>
        <footer class="flex justify-end gap-2">
          <button z-button zType="outline" type="button" (click)="close()">
            {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
          </button>
          <button z-button type="submit" [disabled]="form.invalid">
            {{ 'XP.ModelGateway.Submit' | translate: { Default: 'Submit request' } }}
          </button>
        </footer>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelGatewayRequestDialogComponent {
  readonly #dialogRef =
    inject<ZardDialogRef<ModelGatewayRequestDialogComponent, ModelGatewayRequestDialogResult | null>>(ZardDialogRef)
  readonly #formBuilder = inject(FormBuilder)
  readonly item = inject<IModelGatewayCatalogItem>(Z_MODAL_DATA)
  readonly form = this.#formBuilder.nonNullable.group({
    reason: this.#formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(1000)
    ])
  })

  close() {
    this.#dialogRef.close(null)
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    this.#dialogRef.close({ reason: this.form.controls.reason.value.trim() })
  }
}
