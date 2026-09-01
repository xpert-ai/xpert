import { HttpClient } from '@angular/common/http'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import type { FUniver, IDisposable, Univer } from '@univerjs/presets'
import { firstValueFrom } from 'rxjs'
import { exportSpreadsheetFile, importSpreadsheetFile } from './spreadsheet-file.utils'
import { ensureUniverStylesheet } from './univer-styles'

@Component({
  standalone: true,
  selector: 'xp-spreadsheet-editor',
  imports: [TranslateModule, XpSpinComponent],
  templateUrl: './spreadsheet-editor.component.html',
  styleUrl: './spreadsheet-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SpreadsheetEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly #httpClient = inject(HttpClient)

  readonly sourceUrl = input.required<string>()
  readonly fileName = input.required<string>()
  readonly editable = input(true)
  readonly dirtyChange = output<boolean>()

  readonly loading = signal(true)
  readonly error = signal<string | null>(null)
  readonly ready = computed(() => !this.loading() && !this.error())

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container')
  #univer: Univer | null = null
  #univerAPI: FUniver | null = null
  #commandListener: IDisposable | null = null
  #loadToken = 0
  #destroyed = false
  #viewReady = false
  #userInteracted = false

  readonly #markUserInteraction = () => {
    this.#userInteracted = true
  }

  readonly #editableEffect = effect(() => {
    const editable = this.editable()
    untracked(() => this.#univerAPI?.getActiveWorkbook()?.setEditable(editable))
  })

  ngAfterViewInit() {
    this.#viewReady = true
    const container = this.container().nativeElement
    container.addEventListener('pointerdown', this.#markUserInteraction)
    container.addEventListener('keydown', this.#markUserInteraction)
    container.addEventListener('paste', this.#markUserInteraction)
    container.addEventListener('cut', this.#markUserInteraction)
    void this.reload()
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.#viewReady && (changes['sourceUrl'] || changes['fileName'])) {
      void this.reload()
    }
  }

  ngOnDestroy() {
    this.#destroyed = true
    this.#viewReady = false
    this.#loadToken++
    const container = this.container().nativeElement
    container.removeEventListener('pointerdown', this.#markUserInteraction)
    container.removeEventListener('keydown', this.#markUserInteraction)
    container.removeEventListener('paste', this.#markUserInteraction)
    container.removeEventListener('cut', this.#markUserInteraction)
    this.disposeUniver()
  }

  async reload() {
    const loadToken = ++this.#loadToken
    this.loading.set(true)
    this.error.set(null)
    this.#userInteracted = false
    this.disposeUniver()

    try {
      const [blob] = await Promise.all([
        firstValueFrom(this.#httpClient.get(this.sourceUrl(), { responseType: 'blob' })),
        ensureUniverStylesheet()
      ])
      const workbookData = await importSpreadsheetFile(blob, this.fileName())
      const [{ createUniver, LocaleType, mergeLocales, CommandType }, { UniverSheetsCorePreset }, locale] =
        await Promise.all([
          import('@univerjs/presets'),
          import('@univerjs/preset-sheets-core'),
          import('@univerjs/preset-sheets-core/locales/zh-CN')
        ])

      if (this.#destroyed || loadToken !== this.#loadToken) {
        return
      }

      const { univer, univerAPI } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: mergeLocales(locale.default)
        },
        presets: [
          UniverSheetsCorePreset({
            container: this.container().nativeElement,
            header: true,
            toolbar: true,
            footer: {}
          })
        ]
      })

      this.#univer = univer
      this.#univerAPI = univerAPI
      const workbook = univerAPI.createWorkbook(workbookData)
      workbook.setEditable(this.editable())
      await waitForUniverSteady(univerAPI)
      await waitForInitializationMutations()
      if (this.#destroyed || loadToken !== this.#loadToken) {
        return
      }
      this.#commandListener = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
        if (this.#userInteracted && event.type === CommandType.MUTATION) {
          this.dirtyChange.emit(true)
        }
      })
      this.dirtyChange.emit(false)
    } catch (error) {
      if (!this.#destroyed && loadToken === this.#loadToken) {
        this.error.set(error instanceof Error ? error.message : 'Failed to open spreadsheet')
      }
    } finally {
      if (!this.#destroyed && loadToken === this.#loadToken) {
        this.loading.set(false)
      }
    }
  }

  async exportFile() {
    const workbook = this.#univerAPI?.getActiveWorkbook()
    if (!workbook) {
      throw new Error('Spreadsheet editor is not ready')
    }

    await workbook.endEditingAsync(true)
    return exportSpreadsheetFile(workbook.save(), this.fileName())
  }

  markSaved() {
    this.#userInteracted = false
    this.dirtyChange.emit(false)
  }

  private disposeUniver() {
    this.#commandListener?.dispose()
    this.#commandListener = null
    this.#univerAPI = null
    this.#univer?.dispose()
    this.#univer = null

    const container = this.container()?.nativeElement
    if (container) {
      container.replaceChildren()
    }
  }
}

async function waitForUniverSteady(univerAPI: FUniver) {
  const steadyStage = univerAPI.Enum.LifecycleStages.Steady
  if (univerAPI.getCurrentLifecycleStage() >= steadyStage) {
    return
  }

  await new Promise<void>((resolve) => {
    const listener = univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }) => {
      if (stage >= steadyStage) {
        listener.dispose()
        resolve()
      }
    })
  })
}

function waitForInitializationMutations() {
  return new Promise<void>((resolve) => setTimeout(resolve, 200))
}
