import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MonacoEditorModule],
  selector: 'pac-code-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class CodeEditorComponent {

  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)

  // Inputs
  readonly fileName = input<string>()
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly lineNumbers = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly wordWrap = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly defaultOptions = {
    theme: 'vs',
    automaticLayout: true,
    language: 'markdown',
    glyphMargin: 0,
    minimap: {
      enabled: false
    }
  }

  readonly editorOptions = computed(() => {
    return {
      ...this.defaultOptions,
      language: this.fileName() ? this.mapFileLanguage(this.fileName()) : 'markdown',
      readOnly: !this.editable(),
      lineNumbers: this.lineNumbers() ? 'on' : 'off',
      wordWrap: this.wordWrap()
    }
  })

  readonly value$ = this.cva.value$

  readonly #editor = signal(null)

  // Editor
  onInit(editor: any) {
    this.#editor.set(editor)
  }

  onChange(event: string) {
    this.value$.set(event)
  }

  onResized() {
    this.#editor()?.layout()
  }

  mapFileLanguage(url: string) {
    const extension = url.split('.').pop()?.toLowerCase()
    switch (extension) {
      case 'js':
      case 'jsx':
        return 'javascript'
      case 'ts':
      case 'tsx':
        return 'typescript'
      case 'html':
        return 'html'
      case 'css':
        return 'css'
      case 'json':
        return 'json'
      case 'md':
        return 'markdown'
      case 'xml':
        return 'xml'
      case 'yml':
      case 'yaml':
        return 'yaml'
      case 'py':
        return 'python'
      case 'java':
        return 'java'
      case 'c':
        return 'c'
      case 'cpp':
        return 'cpp'
      case 'cs':
        return 'csharp'
      case 'php':
        return 'php'
      case 'rb':
        return 'ruby'
      case 'go':
        return 'go'
      case 'rs':
        return 'rust'
      case 'swift':
        return 'swift'
      case 'kt':
        return 'kotlin'
      default:
        return 'plaintext'
    }
  }
}
