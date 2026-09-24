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
import type { FUniver, IDisposable, IWorkbookData, Univer } from '@univerjs/presets'
import { firstValueFrom } from 'rxjs'
import { exportSpreadsheetFile, importSpreadsheetFile } from './spreadsheet-file.utils'
import { ensureUniverStylesheet } from './univer-styles'
import {
  assertUnchangedSpreadsheet,
  exportXlsxEdits,
  hydrateXlsxSnapshot,
  spreadsheetBytes,
  XlsxEditSession
} from './spreadsheet-xlsx-preservation'

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
  #editListener: IDisposable | null = null
  #historyListeners: IDisposable[] = []
  #permissionTask: Promise<void> = Promise.resolve()
  #loadToken = 0
  #destroyed = false
  #viewReady = false
  #userInteracted = false
  #xlsxSession: XlsxEditSession | null = null
  #pendingExport: { file: File; snapshot: IWorkbookData } | null = null

  readonly #markUserInteraction = () => {
    this.#userInteracted = true
  }

  readonly #editableEffect = effect(() => {
    const editable = this.editable()
    untracked(() => {
      if (!editable) void this.finishEditing()
      this.applyEditable()
    })
  })

  ngAfterViewInit() {
    this.#viewReady = true
    const container = this.container().nativeElement
    container.addEventListener('pointerdown', this.#markUserInteraction)
    container.addEventListener('keydown', this.#markUserInteraction)
    container.addEventListener('paste', this.#markUserInteraction)
    container.addEventListener('cut', this.#markUserInteraction)
    container.addEventListener('keydown', this.#blockReadOnlyInput, true)
    container.addEventListener('paste', this.#blockReadOnlyInput, true)
    container.addEventListener('cut', this.#blockReadOnlyInput, true)
    container.addEventListener('beforeinput', this.#blockReadOnlyInput, true)
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
    container.removeEventListener('keydown', this.#blockReadOnlyInput, true)
    container.removeEventListener('paste', this.#blockReadOnlyInput, true)
    container.removeEventListener('cut', this.#blockReadOnlyInput, true)
    container.removeEventListener('beforeinput', this.#blockReadOnlyInput, true)
    this.disposeUniver()
  }

  async reload() {
    const loadToken = ++this.#loadToken
    this.loading.set(true)
    this.error.set(null)
    this.#userInteracted = false
    this.#xlsxSession = null
    this.#pendingExport = null
    this.disposeUniver()

    try {
      const [blob] = await Promise.all([
        firstValueFrom(this.#httpClient.get(this.sourceUrl(), { responseType: 'blob' })),
        ensureUniverStylesheet()
      ])
      const workbookData = await importSpreadsheetFile(blob, this.fileName())
      const xlsxSource = /\.xlsx$/i.test(this.fileName()) ? await hydrateXlsxSnapshot(blob, workbookData) : null
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
      this.applyEditable()
      this.#historyListeners = [univerAPI.Event.BeforeUndo, univerAPI.Event.BeforeRedo].map((eventName) =>
        univerAPI.addEvent(eventName, (event) => {
          if (!this.editable()) event.cancel = true
        })
      )
      this.#editListener = univerAPI.addEvent(univerAPI.Event.BeforeSheetEditStart, (event) => {
        if (!this.editable()) event.cancel = true
      })
      await waitForUniverSteady(univerAPI)
      await waitForInitializationMutations()
      if (this.#destroyed || loadToken !== this.#loadToken) {
        return
      }
      await this.applyEditable()
      if (this.#destroyed || loadToken !== this.#loadToken) return
      if (xlsxSource) this.#xlsxSession = { source: xlsxSource, baseline: structuredClone(workbook.save()) }
      this.#commandListener = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
        const params: unknown = event.params
        // The cell input is a separate Univer document; its transient mutations are not workbook edits.
        if (
          this.editable() &&
          this.#userInteracted &&
          event.type === CommandType.MUTATION &&
          params &&
          typeof params === 'object' &&
          'unitId' in params &&
          params.unitId === workbook.getId()
        ) {
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

  async exportFile(finishEditing = true) {
    const workbook = this.#univerAPI?.getActiveWorkbook()
    if (!workbook) {
      throw new Error('Spreadsheet editor is not ready')
    }

    if (finishEditing) await workbook.endEditingAsync(true)
    if (this.#xlsxSession) {
      const sourceUrl = this.sourceUrl()
      const params = sourceUrl.startsWith('blob:') ? undefined : { _xlsxRevisionCheck: String(Date.now()) }
      const current = await firstValueFrom(this.#httpClient.get(sourceUrl, { responseType: 'blob', params }))
      assertUnchangedSpreadsheet(this.#xlsxSession.source, await spreadsheetBytes(current))
      const snapshot = workbook.save()
      const hasFormulas = snapshot.sheetOrder.some((id) => {
        const data = snapshot.sheets[id].cellData
        return Object.keys(data).some((r) => Object.keys(data[Number(r)]).some((c) => data[Number(r)][Number(c)]?.f))
      })
      if (hasFormulas) {
        const formula = this.#univerAPI.getFormula()
        const applied = formula.onCalculationResultApplied(20000)
        formula.executeCalculation()
        await applied
      }
      const calculated = workbook.save()
      const file = await exportXlsxEdits(this.#xlsxSession, calculated, this.fileName())
      this.#pendingExport = { file, snapshot: structuredClone(calculated) }
      return file
    }
    return exportSpreadsheetFile(workbook.save(), this.fileName())
  }

  async finishEditing() {
    const workbook = this.#univerAPI?.getActiveWorkbook()
    if (workbook?.isCellEditing()) await workbook.endEditingAsync(true)
  }

  private applyEditable() {
    const api = this.#univerAPI
    if (!api) return
    api.setPermissionDialogVisible(this.editable())
    const workbook = api.getActiveWorkbook()
    if (!workbook) return
    workbook.setEditable(this.editable())
    // WorkbookEditable alone does not disable structural actions such as creating sheets.
    this.#permissionTask = this.#permissionTask
      .then(async () => {
        if (api !== this.#univerAPI) return
        const permission = workbook.getWorkbookPermission()
        await permission.setMode(this.editable() ? 'editor' : 'viewer')
        await permission.setPoint(api.Enum.WorkbookPermissionPoint.CopyContent, true)
        await permission.setPoint(api.Enum.WorkbookPermissionPoint.Export, true)
      })
      .catch((error: unknown) => {
        if (api === this.#univerAPI)
          this.error.set(error instanceof Error ? error.message : 'Failed to set editing mode')
      })
    return this.#permissionTask
  }

  readonly #blockReadOnlyInput = (event: Event) => {
    if (this.editable()) return
    if (event instanceof KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey) {
        if (['c', 'a', 'f', 'p', '+', '-', '0', '='].includes(key)) return
      } else if (!['backspace', 'delete', 'enter', 'f2'].includes(key) && event.key.length !== 1) {
        return
      }
    }
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  async markSaved() {
    if (this.#pendingExport) {
      this.#xlsxSession = {
        source: await spreadsheetBytes(this.#pendingExport.file),
        baseline: this.#pendingExport.snapshot
      }
      this.#pendingExport = null
    }
    this.#userInteracted = false
    this.dirtyChange.emit(false)
  }

  private disposeUniver() {
    this.#historyListeners.forEach((listener) => listener.dispose())
    this.#historyListeners = []
    this.#editListener?.dispose()
    this.#editListener = null
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
