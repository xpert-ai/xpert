import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IModelGatewayCatalogItem } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardFormImports, ZardInputDirective, XpDialogFrameImports } from '@xpert-ai/headless-ui'

export type ModelGatewayRequestDialogResult = {
  reason: string
}

@Component({
  standalone: true,
  selector: 'xp-model-gateway-request-dialog',
  imports: [
    ...XpDialogFrameImports,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports
  ],
  template: `
    <form xpDialogLayout="standard" class="max-h-[84vh]" [formGroup]="form" (ngSubmit)="submit()">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ 'XP.ModelGateway.ApplyTitle' | translate: { Default: 'Apply for external API access' } }}
        </h2>
        <p xpDialogDescription>{{ item.externalModelId }} · {{ item.provider }}/{{ item.model }}</p>
      </header>
      <div xpDialogBody>
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
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button z-button type="submit" [zDisabled]="form.invalid">
          {{ 'XP.ModelGateway.Submit' | translate: { Default: 'Submit request' } }}
        </button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelGatewayRequestDialogComponent {
  readonly #dialogRef = inject<DialogRef<ModelGatewayRequestDialogResult | null>>(DialogRef)
  readonly #formBuilder = inject(FormBuilder)
  readonly item = inject<IModelGatewayCatalogItem>(DIALOG_DATA)
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
