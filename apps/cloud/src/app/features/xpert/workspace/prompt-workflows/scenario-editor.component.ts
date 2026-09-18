import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { letterStartSUID, type PromptWorkflowScenario } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardFormImports, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { promptTextValidator } from './workflow-form'

export function createPromptScenarioForm(value?: PromptWorkflowScenario) {
  return new FormGroup({
    id: new FormControl(value?.id ?? letterStartSUID('scenario'), { nonNullable: true }),
    label: new FormControl(value?.label ?? '', {
      nonNullable: true,
      validators: [promptTextValidator, Validators.maxLength(120)]
    }),
    args: new FormControl(value?.args ?? '', {
      nonNullable: true,
      validators: [promptTextValidator, Validators.maxLength(20000)]
    })
  })
}

@Component({
  selector: 'xp-prompt-scenario-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardFormImports
  ],
  template: `
    <section class="space-y-4" [attr.aria-label]="'XP.PromptWorkflow.Scenarios.Title' | translate">
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm text-text-tertiary">{{ scenarios().length }} / 20</span>
        <button
          z-button
          zType="outline"
          type="button"
          [disabled]="disabled() || scenarios().length >= 20"
          (click)="add()"
        >
          <z-icon zType="plus" />{{ 'XP.PromptWorkflow.Scenarios.Add' | translate }}
        </button>
      </div>
      <p class="text-xs text-text-tertiary">{{ 'XP.PromptWorkflow.Scenarios.Help' | translate }}</p>
      @for (scenario of scenarios().controls; track scenario; let index = $index) {
        <div [formGroup]="scenario" class="space-y-3 border-b border-divider-regular pb-4">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm text-text-secondary">{{
              'XP.PromptWorkflow.Scenarios.Number' | translate: { number: index + 1 }
            }}</span>
            <div class="flex gap-1">
              <button
                z-button
                zType="ghost"
                zSize="icon"
                type="button"
                [disabled]="disabled() || index === 0"
                (click)="move(index, -1)"
                [attr.aria-label]="'XP.PromptWorkflow.Scenarios.MoveUp' | translate"
              >
                <z-icon zType="arrow-up" />
              </button>
              <button
                z-button
                zType="ghost"
                zSize="icon"
                type="button"
                [disabled]="disabled() || index === scenarios().length - 1"
                (click)="move(index, 1)"
                [attr.aria-label]="'XP.PromptWorkflow.Scenarios.MoveDown' | translate"
              >
                <z-icon zType="arrow-down" />
              </button>
              <button
                z-button
                zType="ghost"
                zSize="icon"
                type="button"
                [disabled]="disabled()"
                (click)="remove(index)"
                [attr.aria-label]="'XP.PromptWorkflow.Scenarios.Remove' | translate"
              >
                <z-icon zType="trash" />
              </button>
            </div>
          </div>
          <z-form-field>
            <label z-form-label [for]="'scenario-label-' + index"
              >{{ 'XP.PromptWorkflow.Scenarios.Name' | translate }} *</label
            >
            <input
              z-input
              class="col-span-full"
              [id]="'scenario-label-' + index"
              formControlName="label"
              maxlength="120"
              [readonly]="disabled()"
              [placeholder]="'XP.PromptWorkflow.Scenarios.NamePlaceholder' | translate"
            />
            <z-form-control
              [errorMessage]="
                scenario.controls.label.touched && scenario.controls.label.invalid
                  ? ('XP.PromptWorkflow.Scenarios.NameRequired' | translate)
                  : ''
              "
            />
          </z-form-field>
          <z-form-field>
            <label z-form-label [for]="'scenario-args-' + index"
              >{{ 'XP.PromptWorkflow.Scenarios.Content' | translate }} *</label
            >
            <textarea
              z-input
              class="col-span-full"
              [id]="'scenario-args-' + index"
              formControlName="args"
              rows="3"
              maxlength="20000"
              [readonly]="disabled()"
              [placeholder]="'XP.PromptWorkflow.Scenarios.ContentPlaceholder' | translate"
            ></textarea>
            <z-form-control
              [errorMessage]="
                scenario.controls.args.touched && scenario.controls.args.invalid
                  ? ('XP.PromptWorkflow.Scenarios.ContentRequired' | translate)
                  : ''
              "
            />
          </z-form-field>
        </div>
      } @empty {
        <p class="text-sm text-text-tertiary">{{ 'XP.PromptWorkflow.Scenarios.Empty' | translate }}</p>
      }
    </section>
  `
})
export class PromptScenarioEditorComponent {
  readonly scenarios = input.required<FormArray<ReturnType<typeof createPromptScenarioForm>>>()
  readonly disabled = input(false)
  add() {
    if (this.disabled() || this.scenarios().length >= 20) return
    this.scenarios().push(createPromptScenarioForm())
    this.scenarios().markAsDirty()
  }
  remove(index: number) {
    if (this.disabled()) return
    this.scenarios().removeAt(index)
    this.scenarios().markAsDirty()
  }
  move(index: number, offset: number) {
    const array = this.scenarios()
    const target = index + offset
    if (this.disabled() || target < 0 || target >= array.length) return
    const control = array.at(index)
    array.removeAt(index)
    array.insert(target, control)
    array.markAsDirty()
  }
}
