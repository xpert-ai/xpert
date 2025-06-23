import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MonacoEditorModule],
  selector: 'pac-file-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class FileEditorComponent {
  // Inputs
  readonly fileName = input<string>()
  readonly content = model<string>()
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
      lineNumbers: this.lineNumbers() ? 'on' : 'off',
      wordWrap: this.wordWrap(),
      language: this.fileName() ? this.mapFileLanguage(this.fileName()) : 'markdown',
      readOnly: !this.editable()
    }
  })

  readonly #editor = signal(null)

  // Editor
  onInit(editor: any) {
    this.#editor.set(editor)
  }

  onChange(event: string) {
    this.content.set(event)
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
