import { DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardFormImports, ZardInputDirective, XpDialogFrameImports } from '@xpert-ai/headless-ui'

export type ModelAccessWithdrawDialogResult = {
  reason: string | null
}

@Component({
  standalone: true,
  selector: 'xp-model-access-withdraw-dialog',
  imports: [
    ...XpDialogFrameImports,
    CommonModule,
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
          {{ 'XP.ModelAccess.WithdrawTitle' | translate: { Default: 'Withdraw this request?' } }}
        </h2>
        <p xpDialogDescription>
          {{
            'XP.ModelAccess.WithdrawDescription'
              | translate: { Default: 'The pending request will be closed and cannot be approved.' }
          }}
        </p>
      </header>
      <div xpDialogBody>
        <z-form-field class="w-full">
          <z-form-label>
            {{ 'XP.ModelAccess.OptionalReason' | translate: { Default: 'Reason (optional)' } }}
          </z-form-label>
          <textarea z-input class="min-h-24 resize-y" formControlName="reason" maxlength="1000"></textarea>
        </z-form-field>
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button z-button zType="destructive" type="submit" [zDisabled]="form.invalid">
          {{ 'XP.ModelAccess.Withdraw' | translate: { Default: 'Withdraw' } }}
        </button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelAccessWithdrawDialogComponent {
  readonly #dialogRef = inject<DialogRef<ModelAccessWithdrawDialogResult | null>>(DialogRef)
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
