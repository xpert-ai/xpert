import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDatePickerComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { format } from 'date-fns'

export type ModelAccessActionMode = 'approve' | 'reject' | 'extend' | 'revoke'

export type ModelAccessActionDialogResult = {
  validUntil?: string | null
  note?: string | null
  reason?: string
}

@Component({
  standalone: true,
  selector: 'xp-model-access-action-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardDatePickerComponent,
    ZardInputDirective,
    ...ZardFormImports
  ],
  template: `
    <section>
      <h2 class="text-lg font-semibold text-text-primary">
        {{ 'XP.ModelAccess.Action.' + mode() + '.Title' | translate }}
      </h2>
      <form class="mt-5 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
        @if (showsExpiration()) {
          <z-form-field class="w-full">
            <z-form-label>
              {{ 'XP.ModelAccess.Expiration' | translate: { Default: 'Expiration date' } }}
            </z-form-label>
            <z-date-picker class="w-full" zFormat="yyyy-MM-dd" formControlName="validUntil" />
            <z-form-message>
              {{
                'XP.ModelAccess.ExpirationHint' | translate: { Default: 'Leave empty for a grant without expiration.' }
              }}
            </z-form-message>
          </z-form-field>
        }

        <z-form-field class="w-full">
          <z-form-label>
            {{
              requiresReason()
                ? ('XP.ModelAccess.Reason' | translate: { Default: 'Reason' })
                : ('XP.ModelAccess.Note' | translate: { Default: 'Note' })
            }}
          </z-form-label>
          <textarea z-input class="min-h-24 resize-y" formControlName="message" maxlength="1000"></textarea>
        </z-form-field>

        <footer class="flex justify-end gap-2">
          <button z-button zType="outline" type="button" (click)="close()">
            {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
          </button>
          <button
            z-button
            type="submit"
            [zType]="requiresReason() ? 'destructive' : 'default'"
            [disabled]="form.invalid"
          >
            {{ 'XP.ModelAccess.Action.' + mode() + '.Submit' | translate }}
          </button>
        </footer>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelAccessActionDialogComponent {
  readonly #dialogRef =
    inject<ZardDialogRef<ModelAccessActionDialogComponent, ModelAccessActionDialogResult | null>>(ZardDialogRef)
  readonly #data = inject<{ mode: ModelAccessActionMode }>(Z_MODAL_DATA)
  readonly #formBuilder = inject(FormBuilder)

  readonly mode = computed(() => this.#data.mode)
  readonly showsExpiration = computed(() => ['approve', 'extend'].includes(this.mode()))
  readonly requiresReason = computed(() => ['reject', 'revoke'].includes(this.mode()))
  readonly form = this.#formBuilder.nonNullable.group({
    validUntil: this.#formBuilder.control<Date | null>(null),
    message: this.#formBuilder.nonNullable.control(
      '',
      this.requiresReason()
        ? [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]
        : [Validators.maxLength(1000)]
    )
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
    const message = value.message.trim()
    this.#dialogRef.close(
      this.requiresReason()
        ? { reason: message }
        : {
            validUntil: this.showsExpiration()
              ? value.validUntil
                ? format(value.validUntil, 'yyyy-MM-dd')
                : null
              : undefined,
            note: message || null
          }
    )
  }
}
