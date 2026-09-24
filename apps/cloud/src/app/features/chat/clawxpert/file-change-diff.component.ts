import { ChangeDetectionStrategy, Component, computed, effect, input, OnDestroy, output, signal } from '@angular/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import type { editor, IDisposable } from 'monaco-editor'
import type { FileChangeReport } from '@xpert-ai/chatkit-types'
import { injectEditorTheme } from '../../../@core'
import { mapFileLanguageFromPath } from '../../../@shared/files/editor/editor.component'
import type { FileDiffStats } from './file-change-review.types'

@Component({
  standalone: true,
  selector: 'xp-file-change-diff',
  imports: [MonacoEditorModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `<ngx-monaco-diff-editor
    class="block w-full"
    [style.height.px]="height()"
    [options]="initialOptions"
    [originalModel]="original()"
    [modifiedModel]="modified()"
    (onInit)="init($event)"
  />`
})
export class FileChangeDiffComponent implements OnDestroy {
  readonly report = input.required<FileChangeReport>()
  readonly sideBySide = input(true)
  readonly wordWrap = input(false)
  readonly showWhitespace = input(false)
  readonly active = input(true)
  readonly stats = output<FileDiffStats>()
  readonly theme = injectEditorTheme()
  readonly height = signal(140)
  private readonly instance = signal<editor.IStandaloneDiffEditor | null>(null)
  private subscriptions: IDisposable[] = []
  private models: editor.IDiffEditorModel | null = null
  readonly original = computed(() => ({
    code: this.report().before?.text ?? '',
    language: mapFileLanguageFromPath(this.report().workspacePath)
  }))
  readonly modified = computed(() => ({
    code: this.report().after?.text ?? '',
    language: mapFileLanguageFromPath(this.report().workspacePath)
  }))
  readonly initialOptions: editor.IDiffEditorConstructionOptions = {
    readOnly: true,
    originalEditable: false,
    automaticLayout: true,
    renderSideBySide: true,
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineHeight: 22,
    renderOverviewRuler: false
  }
  constructor() {
    effect(() => {
      const instance = this.instance()
      const options: editor.IDiffEditorConstructionOptions = {
        theme: this.theme(),
        renderSideBySide: this.sideBySide(),
        wordWrap: this.wordWrap() ? 'on' : 'off',
        diffWordWrap: this.wordWrap() ? 'on' : 'off',
        renderWhitespace: this.showWhitespace() ? 'all' : 'none'
      }
      instance?.updateOptions(options)
      if (this.active()) instance?.layout()
    })
  }
  init(instance: editor.IStandaloneDiffEditor) {
    this.disposeModels()
    this.instance.set(instance)
    this.models = instance.getModel()
    const measure = () => {
      this.height.set(
        Math.min(
          600,
          Math.max(
            120,
            Math.max(instance.getOriginalEditor().getContentHeight(), instance.getModifiedEditor().getContentHeight()) +
              24
          )
        )
      )
      const changes = instance.getLineChanges()
      if (changes)
        this.stats.emit(
          changes.reduce(
            (total, change) => ({
              added:
                total.added +
                (this.report().after?.text && change.modifiedEndLineNumber
                  ? change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1
                  : 0),
              removed:
                total.removed +
                (this.report().before?.text && change.originalEndLineNumber
                  ? change.originalEndLineNumber - change.originalStartLineNumber + 1
                  : 0)
            }),
            { added: 0, removed: 0 }
          )
        )
    }
    this.subscriptions = [
      instance.onDidUpdateDiff(measure),
      instance.getModifiedEditor().onDidContentSizeChange(measure)
    ]
    measure()
  }
  private disposeModels() {
    this.subscriptions.forEach((subscription) => subscription.dispose())
    this.subscriptions = []
    this.models?.original.dispose()
    this.models?.modified.dispose()
    this.models = null
  }
  ngOnDestroy() {
    this.instance()?.setModel(null)
    this.disposeModels()
  }
}
