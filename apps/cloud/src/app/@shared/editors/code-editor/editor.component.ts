import { CommonModule } from '@angular/common'
import { afterNextRender, booleanAttribute, ChangeDetectorRef, Component, computed, inject, input, signal } from '@angular/core'
import { ControlValueAccessor, FormsModule } from '@angular/forms'
import { NgmResizableDirective } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { distinctUntilChanged } from 'rxjs'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MonacoEditorModule, NgmResizableDirective],
  selector: 'pac-code-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class CodeEditorComponent implements ControlValueAccessor {

  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)
  readonly #cdr = inject(ChangeDetectorRef)

  // Inputs
  readonly fileName = input<string>()
  readonly language = input<string>()
  readonly editable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly lineNumbers = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly wordWrap = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly readonly = input<boolean, boolean | string>(false, {
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
      language: this.language() || (this.fileName() ? this.mapFileLanguage(this.fileName()) : this.defaultOptions.language),
      readOnly: this.readonly() || !this.editable(),
      lineNumbers: this.lineNumbers() ? 'on' : 'off',
      wordWrap: this.wordWrap()
    }
  })

  readonly value$ = this.cva.value$

  readonly #editor = signal(null)

  onChange: ((value: string | null) => void) | null = null
  onTouched: (() => void) | null = null
  private valueChangeSub = this.cva.valueChange.pipe(distinctUntilChanged()).subscribe((value) => {
    this.onChange?.(value)
  })

  constructor() {
    afterNextRender(() => {
      setTimeout(() => {
        this.#editor()?.layout()
        this.#cdr.detectChanges()
      }, 600);
    })
  }

  // Editor
  onInit(editor: any) {
    this.#editor.set(editor)
  }

  onEditorChange(event: string) {
    this.value$.set(event)
  }

  onResized() {
    this.#editor()?.layout()
  }

  writeValue(obj: any): void {
    this.cva.writeValue(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.cva.setDisabledState(isDisabled)
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
      case 'sh':
      case 'bash':
      case 'bat':
        return 'shell'
      default:
        return 'plaintext'
    }
  }
}
