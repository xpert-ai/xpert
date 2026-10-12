import { DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ModelGatewayApiKeyLifetimeEnum, TModelGatewayApiKeyCreateInput } from '@xpert-ai/contracts'
import {
  XpDialogFrameImports,
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-model-gateway-key-dialog',
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <form xpDialogLayout="standard" class="max-h-[84vh]" [formGroup]="form" (ngSubmit)="submit()">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ 'XP.ModelGateway.CreateKey' | translate: { Default: 'Create API key' } }}
        </h2>
        <p xpDialogDescription>
          {{
            'XP.ModelGateway.KeyOwnerHint'
              | translate: { Default: 'Usage from this key is charged to your own membership and point balance.' }
          }}
        </p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="close()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>
      <div xpDialogBody>
        <z-form-field class="w-full">
          <z-form-label>{{ 'XP.ModelGateway.KeyName' | translate: { Default: 'Key name' } }}</z-form-label>
          <input z-input formControlName="name" maxlength="100" />
        </z-form-field>
        <z-form-field class="w-full">
          <z-form-label>{{ 'XP.ModelGateway.Lifetime' | translate: { Default: 'Lifetime' } }}</z-form-label>
          <z-select class="w-full" formControlName="lifetime">
            @for (lifetime of lifetimes; track lifetime) {
              <z-select-item [zValue]="lifetime">
                {{ 'XP.ModelGateway.LifetimeValue.' + lifetime | translate: { Default: lifetime } }}
              </z-select-item>
            }
          </z-select>
        </z-form-field>
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button z-button type="submit" [zDisabled]="form.invalid">
          {{ 'XP.ModelGateway.Create' | translate: { Default: 'Create' } }}
        </button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelGatewayKeyDialogComponent {
  readonly #dialogRef = inject<DialogRef<TModelGatewayApiKeyCreateInput | null>>(DialogRef)
  readonly #formBuilder = inject(FormBuilder)
  readonly lifetimes = Object.values(ModelGatewayApiKeyLifetimeEnum)
  readonly form = this.#formBuilder.nonNullable.group({
    name: this.#formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(100)
    ]),
    lifetime: this.#formBuilder.nonNullable.control(ModelGatewayApiKeyLifetimeEnum.Days90, Validators.required)
  })

  close() {
    this.#dialogRef.close(null)
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    const value = this.form.getRawValue()
    this.#dialogRef.close({ name: value.name.trim(), lifetime: value.lifetime })
  }
}
