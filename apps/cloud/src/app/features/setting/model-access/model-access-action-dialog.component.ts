import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { IModelAccessModelSnapshot, ModelAccessChannelEnum, ModelAccessOwnershipScopeEnum } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import {
  XpDialogFrameImports,
  XpI18nPipe,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDatePickerComponent,
  ZardFormImports,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { format } from 'date-fns'

export type ModelAccessActionMode = 'approve' | 'reject' | 'extend' | 'revoke'

export type ModelAccessActionDialogData = {
  mode: ModelAccessActionMode
  target?: {
    userName?: string | null
    model: string
    modelSnapshot: IModelAccessModelSnapshot
    channel: ModelAccessChannelEnum
    ownershipScope: ModelAccessOwnershipScopeEnum
    reason?: string | null
    validUntil?: string | null
  }
}

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
    XpI18nPipe,
    ZardBadgeComponent,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardDatePickerComponent,
    ZardInputDirective,
    ...ZardFormImports
  ],
  template: `
    <form xpDialogLayout="standard" class="max-h-[84vh]" [formGroup]="form" (ngSubmit)="submit()">
      <header xpDialogHeader>
        <h2 xpDialogHeading>
          {{ 'XP.ModelAccess.Action.' + mode() + '.Title' | translate }}
        </h2>
        <p xpDialogDescription>{{ 'XP.ModelAccessSettings.ActionDescription' | translate }}</p>
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
        @if (target(); as target) {
          <section class="space-y-3 border-b border-border pb-4" [attr.aria-label]="'XP.ModelAccess.Model' | translate">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="break-words text-sm font-medium">
                  {{ target.modelSnapshot.modelLabel ? (target.modelSnapshot.modelLabel | i18n) : target.model }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{
                    target.modelSnapshot.providerLabel
                      ? (target.modelSnapshot.providerLabel | i18n)
                      : target.modelSnapshot.provider
                  }}
                  · {{ 'XP.ModelAccess.ModelTypeValue.' + target.modelSnapshot.modelType | translate }}
                </p>
              </div>
              <z-badge zType="outline">{{ 'XP.ModelAccess.ChannelValue.' + target.channel | translate }}</z-badge>
            </div>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt class="text-muted-foreground">{{ 'XP.ModelAccess.User' | translate }}</dt>
              <dd class="break-words">{{ target.userName || '—' }}</dd>
              <dt class="text-muted-foreground">{{ 'XP.ModelAccess.RequestScope' | translate }}</dt>
              <dd>{{ 'XP.ModelAccess.Scope.' + target.ownershipScope | translate }}</dd>
              @if (target.modelSnapshot.externalModelId) {
                <dt class="text-muted-foreground">API</dt>
                <dd class="break-all">{{ target.modelSnapshot.externalModelId }}</dd>
              }
              @if (target.validUntil) {
                <dt class="text-muted-foreground">{{ 'XP.ModelAccessSettings.CurrentExpiry' | translate }}</dt>
                <dd>{{ target.validUntil }}</dd>
              }
            </dl>
            @if (target.reason) {
              <div class="text-sm">
                <p class="text-muted-foreground">{{ 'XP.ModelAccessSettings.RequestReason' | translate }}</p>
                <p class="mt-1 whitespace-pre-wrap break-words">{{ target.reason }}</p>
              </div>
            }
          </section>
        }
        @if (showsExpiration()) {
          <z-form-field class="w-full">
            <z-form-label>
              {{ 'XP.ModelAccess.Expiration' | translate: { Default: 'Expiration date' } }}
            </z-form-label>
            <z-date-picker
              class="w-full"
              role="group"
              [attr.aria-label]="'XP.ModelAccess.Expiration' | translate"
              zFormat="yyyy-MM-dd"
              formControlName="validUntil"
            />
            <z-form-message>
              {{
                'XP.ModelAccess.ExpirationHint' | translate: { Default: 'Leave empty for a grant without expiration.' }
              }}
            </z-form-message>
          </z-form-field>
        }

        <z-form-field class="w-full">
          <label z-form-label for="model-access-action-message">
            {{
              requiresReason()
                ? ('XP.ModelAccessSettings.ReasonRequired' | translate)
                : ('XP.ModelAccess.Note' | translate: { Default: 'Note' })
            }}
          </label>
          <textarea
            z-input
            id="model-access-action-message"
            class="min-h-24 resize-y"
            formControlName="message"
            maxlength="1000"
            [attr.aria-required]="requiresReason()"
            [attr.aria-invalid]="form.controls.message.touched && form.controls.message.invalid"
            [placeholder]="
              (requiresReason() ? 'XP.ModelAccessSettings.ReasonHint' : 'XP.ModelAccessSettings.NotePlaceholder')
                | translate
            "
          ></textarea>
          @if (requiresReason() && form.controls.message.touched && form.controls.message.invalid) {
            <z-form-message zType="error">{{ 'XP.ModelAccessSettings.ReasonHint' | translate }}</z-form-message>
          }
        </z-form-field>
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
        </button>
        <button
          z-button
          type="submit"
          [zType]="requiresReason() ? 'destructive' : 'default'"
          [zDisabled]="form.invalid"
        >
          {{ 'XP.ModelAccess.Action.' + mode() + '.Submit' | translate }}
        </button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelAccessActionDialogComponent {
  readonly #dialogRef = inject<DialogRef<ModelAccessActionDialogResult | null>>(DialogRef)
  readonly #data = inject<ModelAccessActionDialogData>(DIALOG_DATA)
  readonly #formBuilder = inject(FormBuilder)

  readonly target = computed(() => this.#data.target)
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
