import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  input,
  TemplateRef,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormArray } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent, ZardSheetRef, ZardSheetService } from '@xpert-ai/headless-ui'
import { createPromptScenarioForm, PromptScenarioEditorComponent } from './scenario-editor.component'

@Component({
  selector: 'xp-prompt-scenario-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, ZardButtonComponent, ZardIconComponent, PromptScenarioEditorComponent],
  template: `
    <section class="space-y-3 border-t border-divider-regular pt-5" aria-labelledby="prompt-scenarios-summary">
      <div class="flex items-center justify-between gap-3">
        <h2 id="prompt-scenarios-summary" class="text-sm font-medium">
          {{ 'XP.PromptWorkflow.Scenarios.Title' | translate }}
          <span class="ml-2 text-text-tertiary">{{ scenarios().length }} / 20</span>
        </h2>
        <button z-button zType="outline" type="button" [disabled]="disabled()" (click)="open()">
          {{ 'XP.PromptWorkflow.Scenarios.Configure' | translate }}<z-icon zType="chevron-right" />
        </button>
      </div>
      <p class="truncate text-sm text-text-tertiary" [title]="summary()">
        {{ summary() || ('XP.PromptWorkflow.Scenarios.Empty' | translate) }}
      </p>
      @if (scenarios().invalid && scenarios().touched) {
        <p role="alert" class="text-sm text-destructive">{{ 'XP.PromptWorkflow.Scenarios.Invalid' | translate }}</p>
      }
    </section>
    <ng-template #editor>
      <div class="px-4 pb-4">
        <xp-prompt-scenario-editor [scenarios]="scenarios()" [disabled]="disabled()" />
      </div>
    </ng-template>
  `
})
export class PromptScenarioSettingsComponent {
  readonly scenarios = input.required<FormArray<ReturnType<typeof createPromptScenarioForm>>>()
  readonly disabled = input(false)
  readonly editor = viewChild.required<TemplateRef<unknown>>('editor')
  readonly #sheets = inject(ZardSheetService)
  readonly #translate = inject(TranslateService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #destroyRef = inject(DestroyRef)
  #sheetRef?: ZardSheetRef<unknown>

  constructor() {
    this.#destroyRef.onDestroy(() => this.#sheetRef?.close())
  }

  summary() {
    return this.scenarios()
      .getRawValue()
      .map(
        (scenario, index) =>
          scenario.label.trim() || this.#translate.instant('XP.PromptWorkflow.Scenarios.Number', { number: index + 1 })
      )
      .join(' · ')
  }

  open() {
    if (this.disabled() || this.#sheetRef) return
    this.#sheetRef = this.#sheets.open(this.editor(), {
      zSide: 'right',
      zSize: 'lg',
      zCustomClasses: 'sm:max-w-2xl',
      zTitle: this.#translate.instant('XP.PromptWorkflow.Scenarios.Title'),
      zDescription: this.#translate.instant('XP.PromptWorkflow.Scenarios.DraftHelp'),
      zOkText: this.#translate.instant('XP.PromptWorkflow.Scenarios.Done'),
      zCancelText: null
    })
    this.#sheetRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(() => {
        this.#sheetRef = undefined
        this.#cdr.markForCheck()
      })
  }
}
