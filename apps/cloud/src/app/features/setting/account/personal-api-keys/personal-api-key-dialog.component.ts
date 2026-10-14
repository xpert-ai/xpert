import { DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { PERSONAL_API_KEY_LIFETIMES, PersonalApiKeyCreateInput, PersonalApiKeyLifetime } from '@xpert-ai/contracts'
import {
  XpDialogFrameImports,
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-personal-api-key-dialog',
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ...ZardFormImports,
    ZardInputDirective,
    ...ZardSelectImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form xpDialogLayout="standard" [formGroup]="form" (ngSubmit)="submit()">
      <header xpDialogHeader>
        <h2 xpDialogHeading>{{ 'XP.PersonalApiKeys.Create' | translate }}</h2>
        <p xpDialogDescription>{{ 'XP.PersonalApiKeys.AccessHint' | translate }}</p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate"
          (click)="close()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>
      <div xpDialogBody>
        <z-form-field>
          <label z-form-label for="personal-key-name">{{ 'XP.PersonalApiKeys.Name' | translate }}</label>
          <input
            id="personal-key-name"
            z-input
            formControlName="name"
            maxlength="100"
            autocomplete="off"
            [attr.aria-invalid]="form.controls.name.touched && form.controls.name.invalid"
            aria-describedby="personal-key-name-error"
          />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <p id="personal-key-name-error" role="alert" class="text-sm text-destructive">
              {{ 'XP.PersonalApiKeys.NameRequired' | translate }}
            </p>
          }
        </z-form-field>
        <z-form-field>
          <z-form-label>{{ 'XP.PersonalApiKeys.Lifetime' | translate }}</z-form-label>
          <label class="block">
            <span class="sr-only">{{ 'XP.PersonalApiKeys.Lifetime' | translate }}</span>
            <z-select class="w-full" formControlName="lifetime">
              @for (lifetime of lifetimes; track lifetime) {
                <z-select-item [zValue]="lifetime">{{
                  'XP.PersonalApiKeys.Lifetimes.' + lifetime | translate
                }}</z-select-item>
              }
            </z-select>
          </label>
        </z-form-field>
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="close()">{{ 'XP.ACTIONS.Cancel' | translate }}</button>
        <button z-button type="submit" [zDisabled]="form.invalid">{{ 'XP.PersonalApiKeys.Create' | translate }}</button>
      </footer>
    </form>
  `
})
export class PersonalApiKeyDialogComponent {
  readonly #dialog = inject<DialogRef<PersonalApiKeyCreateInput | null>>(DialogRef)
  readonly #fb = inject(FormBuilder)
  readonly lifetimes = PERSONAL_API_KEY_LIFETIMES
  readonly form = this.#fb.nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)]],
    lifetime: this.#fb.nonNullable.control<PersonalApiKeyLifetime>('90', Validators.required)
  })

  close() {
    this.#dialog.close(null)
  }
  submit() {
    this.form.markAllAsTouched()
    if (this.form.invalid) return
    const input = this.form.getRawValue()
    this.#dialog.close({ ...input, name: input.name.trim() })
  }
}
