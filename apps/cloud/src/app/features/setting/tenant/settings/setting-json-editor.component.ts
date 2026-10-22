import { Component, computed, input } from '@angular/core'
import { FormControl, ReactiveFormsModule, ValidatorFn } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { injectEditorTheme } from '../../../../@core/theme/theme-signal'

export const jsonSyntaxValidator: ValidatorFn = (control) => {
  try {
    JSON.parse(control.value)
    return null
  } catch (error) {
    return { jsonSyntax: error instanceof Error ? error.message : 'Invalid JSON' }
  }
}

@Component({
  standalone: true,
  selector: 'xp-setting-json-editor',
  imports: [ReactiveFormsModule, TranslateModule, ZardButtonComponent, MonacoEditorModule],
  host: { class: 'block min-w-0' },
  template: `
    <div class="overflow-hidden rounded-md border border-border">
      <div class="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-3 py-2">
        <span class="text-sm font-medium">JSON</span>
        <button
          z-button
          zType="outline"
          zSize="sm"
          type="button"
          [zDisabled]="control().invalid || readonly()"
          (click)="format()"
        >
          <i class="ri-code-s-slash-line" aria-hidden="true"></i>
          {{ 'XP.SettingsValue.FormatJson' | translate }}
        </button>
      </div>
      <ngx-monaco-editor class="block h-80! lg:h-96!" [options]="options()" [formControl]="control()" />
      <div class="border-t border-border px-3 py-2 text-sm" aria-live="polite">
        @if (control().hasError('jsonSyntax')) {
          <p class="text-destructive">{{ 'XP.SettingsValue.InvalidJson' | translate }}</p>
          <p class="mt-1 break-words font-mono text-xs text-destructive">{{ control().getError('jsonSyntax') }}</p>
        } @else {
          <p class="text-muted-foreground">{{ 'XP.SettingsValue.ValidJson' | translate }}</p>
        }
      </div>
    </div>
  `
})
export class SettingJsonEditorComponent {
  readonly control = input.required<FormControl<string>>()
  readonly label = input.required<string>()
  readonly readonly = input(false)
  readonly theme = injectEditorTheme()
  readonly options = computed(() => ({
    theme: this.theme(),
    language: 'json',
    readOnly: this.readonly(),
    ariaLabel: this.label(),
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    formatOnPaste: true,
    formatOnType: true
  }))

  format() {
    const control = this.control()
    if (control.invalid || this.readonly()) return
    control.setValue(JSON.stringify(JSON.parse(control.value), null, 2))
    control.markAsDirty()
  }
}
