import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ModelGatewayApiKeyLifetimeEnum, TModelGatewayApiKeyCreateInput } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardDialogRef,
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
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <section>
      <h2 class="text-lg font-semibold text-text-primary">
        {{ 'XP.ModelGateway.CreateKey' | translate: { Default: 'Create API key' } }}
      </h2>
      <p class="mt-2 text-sm leading-6 text-text-secondary">
        {{
          'XP.ModelGateway.KeyOwnerHint'
            | translate: { Default: 'Usage from this key is charged to your own membership and point balance.' }
        }}
      </p>
      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
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
        <footer class="flex justify-end gap-2">
          <button z-button zType="outline" type="button" (click)="close()">
            {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
          </button>
          <button z-button type="submit" [disabled]="form.invalid">
            {{ 'XP.ModelGateway.Create' | translate: { Default: 'Create' } }}
          </button>
        </footer>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelGatewayKeyDialogComponent {
  readonly #dialogRef =
    inject<ZardDialogRef<ModelGatewayKeyDialogComponent, TModelGatewayApiKeyCreateInput | null>>(ZardDialogRef)
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
