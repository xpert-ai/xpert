import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardDialogRef, ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'

export type ModelAccessWithdrawDialogResult = {
  reason: string | null
}

@Component({
  standalone: true,
  selector: 'xp-model-access-withdraw-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports
  ],
  template: `
    <section>
      <h2 class="text-lg font-semibold text-text-primary">
        {{ 'XP.ModelAccess.WithdrawTitle' | translate: { Default: 'Withdraw this request?' } }}
      </h2>
      <p class="mt-2 text-sm leading-6 text-text-secondary">
        {{
          'XP.ModelAccess.WithdrawDescription'
            | translate: { Default: 'The pending request will be closed and cannot be approved.' }
        }}
      </p>

      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
        <z-form-field class="w-full">
          <z-form-label>
            {{ 'XP.ModelAccess.OptionalReason' | translate: { Default: 'Reason (optional)' } }}
          </z-form-label>
          <textarea z-input class="min-h-24 resize-y" formControlName="reason" maxlength="1000"></textarea>
        </z-form-field>

        <footer class="flex justify-end gap-2">
          <button z-button zType="outline" type="button" (click)="close()">
            {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
          </button>
          <button z-button zType="destructive" type="submit" [disabled]="form.invalid">
            {{ 'XP.ModelAccess.Withdraw' | translate: { Default: 'Withdraw' } }}
          </button>
        </footer>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelAccessWithdrawDialogComponent {
  readonly #dialogRef =
    inject<ZardDialogRef<ModelAccessWithdrawDialogComponent, ModelAccessWithdrawDialogResult | null>>(ZardDialogRef)
  readonly #formBuilder = inject(FormBuilder)

  readonly form = this.#formBuilder.nonNullable.group({
    reason: this.#formBuilder.nonNullable.control('', Validators.maxLength(1000))
  })

  close() {
    this.#dialogRef.close(null)
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    this.#dialogRef.close({
      reason: this.form.controls.reason.value.trim() || null
    })
  }
}
