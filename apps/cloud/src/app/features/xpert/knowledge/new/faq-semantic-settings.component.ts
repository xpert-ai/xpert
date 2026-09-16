import { Component, input } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type { KnowledgebaseFAQConfig } from '@xpert-ai/contracts'
import { ZardFormImports, ZardInputDirective, ZardSliderComponent, ZardSliderValue } from '@xpert-ai/headless-ui'

export function createFAQSemanticForm(config?: KnowledgebaseFAQConfig | null, disabled = false) {
  const finite: ValidatorFn = (control) =>
    control.value == null || Number.isFinite(control.value) ? null : { finite: true }
  return new FormGroup({
    threshold: new FormControl<number | null>(
      { value: config?.semanticThreshold ?? (disabled ? null : 0.85), disabled },
      [Validators.required, Validators.min(0), Validators.max(1), finite]
    ),
    margin: new FormControl<number | null>({ value: config?.semanticMargin ?? (disabled ? null : 0.05), disabled }, [
      Validators.required,
      Validators.min(Number.MIN_VALUE),
      Validators.max(2),
      finite
    ])
  })
}

@Component({
  selector: 'xp-faq-semantic-settings',
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, ...ZardFormImports, ZardInputDirective, ZardSliderComponent],
  template: `
    <div class="space-y-3" [formGroup]="form()">
      <z-form-field>
        <label z-form-label for="faq-semantic-threshold">{{ prefix + 'SemanticThreshold' | translate }}</label>
        <div class="flex items-center gap-4">
          <z-slider
            class="min-w-0 flex-1"
            [min]="0"
            [max]="1"
            [step]="0.01"
            [value]="form().controls.threshold.value"
            [disabledInput]="form().controls.threshold.disabled"
            (valueChange)="updateControl(form().controls.threshold, $event)"
          />
          <input
            z-input
            class="w-20 shrink-0 text-center"
            id="faq-semantic-threshold"
            type="number"
            min="0"
            max="1"
            step="0.01"
            formControlName="threshold"
          />
        </div>
        @if (form().controls.threshold.touched && form().controls.threshold.invalid) {
          <p class="text-sm text-text-destructive">{{ prefix + 'SemanticThresholdInvalid' | translate }}</p>
        }
      </z-form-field>
      <z-form-field>
        <label z-form-label for="faq-semantic-margin">{{ prefix + 'SemanticMargin' | translate }}</label>
        <div class="flex items-center gap-4">
          <z-slider
            class="min-w-0 flex-1"
            [min]="0.01"
            [max]="2"
            [step]="0.01"
            [value]="form().controls.margin.value"
            [disabledInput]="form().controls.margin.disabled"
            (valueChange)="updateControl(form().controls.margin, $event)"
          />
          <input
            z-input
            class="w-20 shrink-0 text-center"
            id="faq-semantic-margin"
            type="number"
            min="0"
            max="2"
            step="0.01"
            formControlName="margin"
          />
        </div>
        @if (form().controls.margin.touched && form().controls.margin.invalid) {
          <p class="text-sm text-text-destructive">{{ prefix + 'SemanticMarginInvalid' | translate }}</p>
        }
      </z-form-field>
      <p class="text-sm text-text-tertiary">{{ prefix + 'SemanticParametersHelp' | translate }}</p>
    </div>
  `
})
export class FAQSemanticSettingsComponent {
  readonly form = input.required<ReturnType<typeof createFAQSemanticForm>>()
  readonly prefix = 'XP.Knowledgebase.WorkspaceConfiguration.FAQ.'

  updateControl(control: FormControl<number | null>, value: ZardSliderValue) {
    if (control.disabled || typeof value !== 'number') return
    control.setValue(value)
    control.markAsDirty()
    control.markAsTouched()
  }
}
