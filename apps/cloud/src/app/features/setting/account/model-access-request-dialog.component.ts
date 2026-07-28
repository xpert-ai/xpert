import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { IModelAccessCatalogItem, ModelAccessOwnershipScopeEnum } from '@xpert-ai/contracts'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'

export type ModelAccessRequestDialogResult = {
  item: IModelAccessCatalogItem
  reason: string
}

@Component({
  standalone: true,
  selector: 'pac-model-access-request-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    NgmI18nPipe,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <section>
      <header class="space-y-2">
        <h2 class="text-lg font-semibold text-text-primary">
          {{ 'PAC.ModelAccess.ApplyTitle' | translate: { Default: 'Apply for model access' } }}
        </h2>
        <p class="text-sm leading-6 text-text-secondary">
          {{
            'PAC.ModelAccess.ApplyDescription'
              | translate
                : {
                    Default: 'Choose a model not included in your plan and explain why you need personal access.'
                  }
          }}
        </p>
      </header>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
        <z-form-field class="w-full">
          <z-form-label>
            {{ 'PAC.ModelAccess.RequestScope' | translate: { Default: 'Request scope' } }}
          </z-form-label>
          <z-select class="w-full" formControlName="ownershipScope" (zSelectionChange)="changeScope($event)">
            @for (scope of scopeOptions; track scope) {
              <z-select-item [zValue]="scope">
                {{ 'PAC.ModelAccess.Scope.' + scope | translate }}
              </z-select-item>
            }
          </z-select>
        </z-form-field>

        <z-form-field class="w-full">
          <z-form-label>{{ 'PAC.ModelAccess.Model' | translate: { Default: 'Model' } }}</z-form-label>
          <z-select class="w-full" formControlName="key">
            @for (item of itemsForScope(form.controls.ownershipScope.value); track item.key) {
              <z-select-item [zValue]="item.key">
                {{ item.providerLabel ? (item.providerLabel | i18n) : item.provider }}
                ·
                {{ item.modelLabel ? (item.modelLabel | i18n) : item.model }}
                · {{ item.modelType }}
              </z-select-item>
            }
          </z-select>
        </z-form-field>

        <z-form-field class="w-full">
          <z-form-label>{{ 'PAC.ModelAccess.Reason' | translate: { Default: 'Reason' } }}</z-form-label>
          <textarea
            z-input
            class="min-h-28 resize-y"
            formControlName="reason"
            maxlength="1000"
            [placeholder]="
              'PAC.ModelAccess.ReasonPlaceholder'
                | translate: { Default: 'Describe the business need and expected usage.' }
            "
          ></textarea>
        </z-form-field>

        <footer class="flex justify-end gap-2 pt-1">
          <button z-button zType="outline" type="button" (click)="close()">
            {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
          </button>
          <button z-button type="submit" [disabled]="form.invalid">
            {{ 'PAC.ModelAccess.Submit' | translate: { Default: 'Submit request' } }}
          </button>
        </footer>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelAccessRequestDialogComponent {
  readonly #dialogRef = inject<ZardDialogRef<ModelAccessRequestDialogComponent, ModelAccessRequestDialogResult | null>>(
    ZardDialogRef
  )
  readonly #data = inject<{ items: IModelAccessCatalogItem[] }>(Z_MODAL_DATA)
  readonly #formBuilder = inject(FormBuilder)

  readonly items = this.#data.items
  readonly scopeOptions = [ModelAccessOwnershipScopeEnum.Tenant, ModelAccessOwnershipScopeEnum.Organization].filter(
    (scope) => this.items.some((item) => item.ownershipScope === scope)
  )
  readonly #initialScope = this.scopeOptions[0] ?? ModelAccessOwnershipScopeEnum.Tenant
  readonly form = this.#formBuilder.nonNullable.group({
    ownershipScope: this.#formBuilder.nonNullable.control(this.#initialScope, Validators.required),
    key: this.#formBuilder.nonNullable.control(
      this.items.find((item) => item.ownershipScope === this.#initialScope)?.key ?? '',
      Validators.required
    ),
    reason: this.#formBuilder.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(1000)
    ])
  })

  itemsForScope(scope: ModelAccessOwnershipScopeEnum) {
    return this.items.filter((item) => item.ownershipScope === scope)
  }

  changeScope(scope: string | number | Array<string | number>) {
    if (scope !== ModelAccessOwnershipScopeEnum.Tenant && scope !== ModelAccessOwnershipScopeEnum.Organization) {
      return
    }
    this.form.controls.key.setValue(this.itemsForScope(scope)[0]?.key ?? '')
  }

  close() {
    this.#dialogRef.close(null)
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    const value = this.form.getRawValue()
    const item = this.items.find((candidate) => candidate.key === value.key)
    if (item) {
      this.#dialogRef.close({ item, reason: value.reason.trim() })
    }
  }
}
