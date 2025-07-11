import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, effect, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { ButtonGroupDirective, NgmThemeService } from '@metad/ocap-angular/core'
import { EditorThemeMap } from '@metad/ocap-angular/formula'
import { isBlank } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { BehaviorSubject } from 'rxjs'

export interface ConfirmCodeEditorData {
  language?: string
  model: any
  onApply?: (model: any) => void
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, DragDropModule, MatButtonModule, MonacoEditorModule, ButtonGroupDirective],
  selector: 'ngm-confirm-code-editor',
  templateUrl: './confirm-code-editor.component.html',
  styleUrls: ['./confirm-code-editor.component.scss']
})
export class NgmConfirmCodeEditorComponent {
  readonly themeService = inject(NgmThemeService)
  readonly data = inject<ConfirmCodeEditorData>(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  public editor$ = new BehaviorSubject(null)
  editorOptions = {
    theme: 'vs',
    language: 'json',
    automaticLayout: true
  }

  statement: string | null = ''

  constructor() {
    effect(() => {
      this.editorOptions = {
        ...this.editorOptions,
        theme: EditorThemeMap[this.themeService.themeClass()]
      }
    })

    this.editorOptions = {
      ...this.editorOptions,
      language: this.data?.language ?? this.editorOptions.language
    }

    this.onReset()
  }

  onReset() {
    this.statement =
      this.editorOptions.language === 'json' ? JSON.stringify(this.data.model || undefined, null, 2) : this.data.model
  }

  onClear() {
    this.statement = null
  }

  onApply() {
    this.data?.onApply?.(this.parse())
  }

  onOk() {
    this.dialogRef.close(this.parse())
  }

  onCancel() {
    this.dialogRef.close()
  }

  parse() {
    return this.editorOptions.language === 'json' && this.statement ? parse(this.statement) : this.statement
  }
}

/**
 */
function parse(value: string) {
  return isBlank(value) ? null : JSON.parse(value)
}
