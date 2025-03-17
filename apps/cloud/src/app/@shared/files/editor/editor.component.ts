import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
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
  readonly content = input<string>()

  // States
  readonly defaultOptions = {
    theme: 'vs',
    automaticLayout: true,
    language: 'markdown',
    lineNumbers: 'off',
    glyphMargin: 0,
    wordWrap: false,
    minimap: {
      enabled: false
    },
    readOnly: true
  }

  readonly editorOptions = computed(() => {
    return {
      ...this.defaultOptions,
      language: this.fileName() ? this.mapFileLanguage(this.fileName()) : 'markdown'
    }
  })

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
