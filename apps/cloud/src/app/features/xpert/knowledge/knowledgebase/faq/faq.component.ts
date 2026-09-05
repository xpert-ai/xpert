import { CommonModule } from '@angular/common'
import { SelectionModel } from '@angular/cdk/collections'
import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  injectConfirmDelete,
  XpSpinComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardMenuImports,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import {
  IKnowledgeFAQEntry,
  KnowledgebaseStatusEnum,
  KnowledgeFAQExportFormat,
  KnowledgeFAQImportResult
} from '@xpert-ai/contracts'
import { defer, finalize, firstValueFrom, timer } from 'rxjs'
import { getErrorMessage, KnowledgeFAQService, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeFAQEditorComponent } from './faq-editor.component'
import { KnowledgeFAQImportDialogComponent } from './faq-import-dialog.component'

type FAQStatusFilter = 'all' | 'enabled' | 'disabled'
type FAQInspectorMode = 'create' | 'detail' | 'edit' | null

const PAGE_SIZE = 20
const FAQ_INSPECTOR_DEFAULT_WIDTH = 480
const FAQ_INSPECTOR_MIN_WIDTH = 400
const FAQ_INSPECTOR_MAX_WIDTH = 720

@Component({
  standalone: true,
  selector: 'xp-knowledge-faq',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    XpSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardMenuImports,
    ...ZardTooltipImports,
    ...ZardTableImports,
    KnowledgeFAQEditorComponent
  ],
  templateUrl: './faq.component.html',
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeFAQComponent {
  readonly #faqService = inject(KnowledgeFAQService)
  readonly #route = inject(ActivatedRoute)
  readonly #dialog = inject(Dialog)
  readonly #knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()
  readonly knowledgebaseId = this.#knowledgebaseComponent.paramId
  readonly knowledgebase = this.#knowledgebaseComponent.knowledgebase
  readonly eKnowledgebaseStatusEnum = KnowledgebaseStatusEnum

  #loadRequestId = 0
  #requestedFAQHandled = false

  readonly loading = signal(false)
  readonly deleting = signal(false)
  readonly updatingStatus = signal(false)
  readonly reprocessing = signal(false)
  readonly reprocessingEntryIds = signal<ReadonlySet<string>>(new Set())
  readonly exporting = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly entries = signal<IKnowledgeFAQEntry[]>([])
  readonly total = signal(0)
  readonly page = signal(0)
  readonly statusFilter = signal<FAQStatusFilter>('all')
  readonly selectionModel = new SelectionModel<string>(true, [])
  readonly search = new FormControl('', { nonNullable: true })
  readonly inspectorMode = signal<FAQInspectorMode>(null)
  readonly selectedEntry = signal<IKnowledgeFAQEntry | null>(null)
  readonly inspectorWidth = signal(FAQ_INSPECTOR_DEFAULT_WIDTH)
  readonly inspectorMinWidth = FAQ_INSPECTOR_MIN_WIDTH

  readonly vectorRebuildStatus = computed(() => this.knowledgebase()?.status)
  readonly vectorMutationLocked = computed(() => this.vectorRebuildStatus() === KnowledgebaseStatusEnum.REBUILDING)
  readonly busy = computed(
    () =>
      this.loading() || this.deleting() || this.updatingStatus() || this.reprocessing() || this.vectorMutationLocked()
  )
  readonly inspectorOpen = computed(() => this.inspectorMode() !== null)
  readonly selectedEntryId = computed(() => this.selectedEntry()?.id ?? null)
  readonly canPrevious = computed(() => this.page() > 0)
  readonly canNext = computed(() => (this.page() + 1) * PAGE_SIZE < this.total())
  readonly pageStart = computed(() => (this.total() ? this.page() * PAGE_SIZE + 1 : 0))
  readonly pageEnd = computed(() => Math.min((this.page() + 1) * PAGE_SIZE, this.total()))

  constructor() {
    effect(() => {
      if (this.knowledgebaseId()) void this.load()
    })
    effect((onCleanup) => {
      if (!this.vectorMutationLocked()) return
      const subscription = timer(0, 3000).subscribe(() => this.#knowledgebaseComponent.refresh())
      onCleanup(() => subscription.unsubscribe())
    })
  }

  async load() {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId) return

    const requestId = ++this.#loadRequestId
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const status = this.statusFilter()
      const result = await firstValueFrom(
        this.#faqService.findAll(knowledgebaseId, {
          search: this.search.value.trim() || undefined,
          enabled: status === 'all' ? undefined : status === 'enabled',
          skip: this.page() * PAGE_SIZE,
          take: PAGE_SIZE
        })
      )
      if (requestId !== this.#loadRequestId) return
      this.entries.set(result.items)
      this.total.set(result.total)
      const visibleIds = new Set(result.items.map((item) => item.id))
      this.selectionModel.deselect(...this.selectionModel.selected.filter((id) => !visibleIds.has(id)))
      const selectedEntryId = this.selectedEntryId()
      const refreshedSelection = result.items.find((item) => item.id === selectedEntryId)
      if (refreshedSelection) this.selectedEntry.set(refreshedSelection)
      await this.openRequestedFAQ(result.items)
    } catch (error) {
      if (requestId === this.#loadRequestId) this.loadError.set(getErrorMessage(error))
    } finally {
      if (requestId === this.#loadRequestId) this.loading.set(false)
    }
  }

  applySearch() {
    this.page.set(0)
    void this.load()
  }

  setStatusFilter(status: FAQStatusFilter) {
    if (this.statusFilter() === status) return
    this.statusFilter.set(status)
    this.page.set(0)
    void this.load()
  }

  previousPage() {
    if (!this.canPrevious()) return
    this.page.update((page) => page - 1)
    void this.load()
  }

  nextPage() {
    if (!this.canNext()) return
    this.page.update((page) => page + 1)
    void this.load()
  }

  isAllSelected() {
    return this.entries().length > 0 && this.selectionModel.selected.length === this.entries().length
  }

  isPartialSelected() {
    return this.selectionModel.selected.length > 0 && this.selectionModel.selected.length < this.entries().length
  }

  selectAll(checked: boolean) {
    if (checked) {
      this.selectionModel.select(...this.entries().map((entry) => entry.id))
    } else {
      this.selectionModel.clear()
    }
  }

  selectedEntries() {
    return this.entries().filter((entry) => this.selectionModel.isSelected(entry.id))
  }

  async setSelectedEnabled(enabled: boolean) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || !this.selectionModel.hasValue() || this.updatingStatus()) return

    const selectedEntries = this.entries().filter((entry) => this.selectionModel.isSelected(entry.id))
    const entriesToUpdate = selectedEntries.filter((entry) => entry.enabled !== enabled)
    if (!entriesToUpdate.length) {
      this.selectionModel.clear()
      return
    }

    this.updatingStatus.set(true)
    try {
      const results = await Promise.allSettled(
        entriesToUpdate.map((entry) =>
          firstValueFrom(this.#faqService.update(knowledgebaseId, entry.id, this.faqUpdateInput(entry, enabled)))
        )
      )
      const failedUpdate = results.find((result) => result.status === 'rejected')
      if (failedUpdate?.status === 'rejected') throw failedUpdate.reason
      const updatedEntries = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const selectedEntryId = this.selectedEntryId()
      const refreshedSelection = updatedEntries.find((entry) => entry.id === selectedEntryId)
      if (refreshedSelection) this.selectedEntry.set(refreshedSelection)
      this.selectionModel.clear()
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      await this.load()
    } finally {
      this.updatingStatus.set(false)
    }
  }

  async setEntryEnabled(entry: IKnowledgeFAQEntry, enabled: boolean) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || entry.enabled === enabled || this.updatingStatus() || this.vectorMutationLocked()) {
      return
    }

    this.updatingStatus.set(true)
    try {
      const updatedEntry = await firstValueFrom(
        this.#faqService.update(knowledgebaseId, entry.id, this.faqUpdateInput(entry, enabled))
      )
      if (this.selectedEntryId() === entry.id) this.selectedEntry.set(updatedEntry)
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      await this.load()
    } finally {
      this.updatingStatus.set(false)
    }
  }

  openCreate() {
    if (!this.knowledgebaseId() || this.vectorMutationLocked()) return
    this.selectedEntry.set(null)
    this.inspectorMode.set('create')
  }

  openDetails(entry: IKnowledgeFAQEntry) {
    this.selectedEntry.set(entry)
    this.inspectorMode.set('detail')
  }

  openEdit(entry: IKnowledgeFAQEntry | null = this.selectedEntry()) {
    if (!entry) return
    this.selectedEntry.set(entry)
    this.inspectorMode.set('edit')
  }

  closeInspector() {
    this.inspectorMode.set(null)
    this.selectedEntry.set(null)
  }

  onSaved(entry: IKnowledgeFAQEntry) {
    this.selectedEntry.set(entry)
    this.inspectorMode.set('detail')
    void this.load()
  }

  openImportDialog() {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || this.vectorMutationLocked()) return

    this.#dialog
      .open<KnowledgeFAQImportResult | undefined>(KnowledgeFAQImportDialogComponent, {
        data: { knowledgebaseId },
        width: '600px',
        maxWidth: 'calc(100vw - 2rem)',
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      })
      .closed.subscribe((result) => {
        if (!result) return
        if (result.failed.length) {
          this.#toastr.warning('XP.Knowledgebase.FAQManagement.ImportPartial', {
            Default: `Imported ${result.imported} of ${result.total} FAQs; ${result.failed.length} failed.`,
            imported: result.imported,
            total: result.total,
            failed: result.failed.length
          })
        } else {
          this.#toastr.success('XP.Knowledgebase.FAQManagement.ImportSuccess', {
            Default: `Imported ${result.imported} FAQs.`,
            count: result.imported
          })
        }
        if (result.imported) {
          this.page.set(0)
          void this.load()
        }
      })
  }

  async exportFAQs(format: KnowledgeFAQExportFormat, selectedOnly = false) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || this.exporting()) return
    const ids = selectedOnly ? this.selectedEntries().map((entry) => entry.id) : undefined
    if (selectedOnly && !ids?.length) return

    this.exporting.set(true)
    try {
      const blob = await firstValueFrom(this.#faqService.exportFile(knowledgebaseId, format, ids))
      const prefix = selectedOnly ? 'faq-selected-export' : 'faq-export'
      triggerFAQDownload(blob, `${prefix}-${new Date().toISOString().slice(0, 10)}.${format}`)
      this.#toastr.success('XP.Knowledgebase.FAQManagement.ExportSuccess', {
        Default: 'FAQ export downloaded.'
      })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.exporting.set(false)
    }
  }

  async reprocessSelected() {
    const knowledgebaseId = this.knowledgebaseId()
    const entries = this.selectedEntries()
    if (!knowledgebaseId || !entries.length || this.reprocessing() || this.vectorMutationLocked()) return

    this.reprocessing.set(true)
    this.reprocessingEntryIds.set(new Set(entries.map((entry) => entry.id)))
    try {
      const results = await Promise.allSettled(
        entries.map((entry) =>
          firstValueFrom(this.#faqService.update(knowledgebaseId, entry.id, this.faqUpdateInput(entry)))
        )
      )
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      this.selectionModel.clear()
      this.#toastr.success('XP.Knowledgebase.FAQManagement.ReprocessSuccess', {
        Default: 'Selected FAQ vectors were rebuilt.'
      })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.reprocessing.set(false)
      this.reprocessingEntryIds.set(new Set())
      await this.load()
    }
  }

  async reprocessEntry(entry: IKnowledgeFAQEntry) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || this.reprocessing() || this.vectorMutationLocked()) return

    this.reprocessing.set(true)
    this.reprocessingEntryIds.set(new Set([entry.id]))
    try {
      const updatedEntry = await firstValueFrom(
        this.#faqService.update(knowledgebaseId, entry.id, this.faqUpdateInput(entry))
      )
      if (this.selectedEntryId() === entry.id) this.selectedEntry.set(updatedEntry)
      this.#toastr.success('XP.Knowledgebase.FAQManagement.ReprocessSuccess', {
        Default: 'FAQ vector was rebuilt.'
      })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.reprocessing.set(false)
      this.reprocessingEntryIds.set(new Set())
      await this.load()
    }
  }

  deleteSelected() {
    const knowledgebaseId = this.knowledgebaseId()
    const entries = this.selectedEntries()
    if (!knowledgebaseId || !entries.length || this.deleting() || this.vectorMutationLocked()) return

    this.deleting.set(true)
    this.confirmDelete(
      {
        value: this.#translate.instant('XP.Knowledgebase.FAQManagement.SelectedCount', {
          Default: `${entries.length} FAQ entries`,
          count: entries.length
        }),
        information: this.#translate.instant('XP.Knowledgebase.FAQManagement.DeleteSelectedHint', {
          Default: 'Deleting the selected FAQs also removes all of their search vectors.'
        })
      },
      () =>
        defer(async () => {
          const results = await Promise.allSettled(
            entries.map((entry) => firstValueFrom(this.#faqService.delete(knowledgebaseId, entry.id, entry.version)))
          )
          const failed = results.find((result) => result.status === 'rejected')
          if (failed?.status === 'rejected') throw failed.reason
          return results
        })
    )
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          const selectedEntryId = this.selectedEntryId()
          if (selectedEntryId && entries.some((entry) => entry.id === selectedEntryId)) this.closeInspector()
          this.selectionModel.clear()
          this.#toastr.success('XP.Messages.DeletedSuccessfully', { Default: 'FAQs deleted successfully' })
          void this.load()
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
          void this.load()
        }
      })
  }

  delete(entry: IKnowledgeFAQEntry) {
    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId || this.deleting() || this.vectorMutationLocked()) return

    this.deleting.set(true)
    this.confirmDelete(
      {
        value: entry.standardQuestion,
        information: this.#translate.instant('XP.Knowledgebase.FAQManagement.DeleteHint', {
          Default: 'Deleting this FAQ also removes all of its search vectors.'
        })
      },
      this.#faqService.delete(knowledgebaseId, entry.id, entry.version)
    )
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.#toastr.success('XP.Messages.DeletedSuccessfully', { Default: 'FAQ deleted successfully' })
          if (this.selectedEntryId() === entry.id) this.closeInspector()
          void this.load()
        },
        error: (error) => this.#toastr.error(getErrorMessage(error))
      })
  }

  startInspectorResize(event: PointerEvent) {
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = this.inspectorWidth()
    const resizeHandle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    resizeHandle?.setPointerCapture(event.pointerId)

    const onPointerMove = (moveEvent: PointerEvent) => {
      this.inspectorWidth.set(
        normalizeInspectorWidth(startWidth + startX - moveEvent.clientX, this.inspectorMaxWidth())
      )
    }
    const finishResize = (endEvent: PointerEvent) => {
      if (resizeHandle?.hasPointerCapture(endEvent.pointerId)) resizeHandle.releasePointerCapture(endEvent.pointerId)
      resizeHandle?.removeEventListener('pointermove', onPointerMove)
      resizeHandle?.removeEventListener('pointerup', finishResize)
      resizeHandle?.removeEventListener('pointercancel', finishResize)
    }

    resizeHandle?.addEventListener('pointermove', onPointerMove)
    resizeHandle?.addEventListener('pointerup', finishResize)
    resizeHandle?.addEventListener('pointercancel', finishResize)
  }

  resizeInspectorFromKeyboard(event: KeyboardEvent) {
    const resizeDelta = event.shiftKey ? 40 : 16
    const direction = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0
    if (!direction) return

    event.preventDefault()
    this.inspectorWidth.update((width) =>
      normalizeInspectorWidth(width + direction * resizeDelta, this.inspectorMaxWidth())
    )
  }

  inspectorMaxWidth() {
    if (typeof window === 'undefined') return FAQ_INSPECTOR_MAX_WIDTH
    return Math.max(FAQ_INSPECTOR_MIN_WIDTH, Math.min(FAQ_INSPECTOR_MAX_WIDTH, Math.floor(window.innerWidth * 0.55)))
  }

  private async openRequestedFAQ(items: IKnowledgeFAQEntry[]) {
    if (this.#requestedFAQHandled) return
    const requestedFAQId = this.#route.snapshot.queryParamMap.get('faqId')?.trim()
    if (!requestedFAQId) {
      this.#requestedFAQHandled = true
      return
    }

    const current = items.find((item) => item.id === requestedFAQId)
    if (current) {
      this.openDetails(current)
      this.#requestedFAQHandled = true
      return
    }

    const knowledgebaseId = this.knowledgebaseId()
    if (!knowledgebaseId) return
    try {
      this.openDetails(await firstValueFrom(this.#faqService.findOne(knowledgebaseId, requestedFAQId)))
    } catch {
      this.#toastr.warning('XP.Knowledgebase.FAQManagement.LinkedFAQNotFound', {
        Default: 'The linked FAQ no longer exists. The FAQ list is still available.'
      })
    } finally {
      this.#requestedFAQHandled = true
    }
  }

  private faqUpdateInput(entry: IKnowledgeFAQEntry, enabled = entry.enabled) {
    return {
      standardQuestion: entry.standardQuestion,
      similarQuestions: entry.similarQuestions,
      negativeQuestions: entry.negativeQuestions,
      answerBlocks: entry.answerBlocks,
      enabled,
      version: entry.version
    }
  }
}

function normalizeInspectorWidth(width: number, maxWidth: number) {
  return Math.min(Math.max(Math.round(width), FAQ_INSPECTOR_MIN_WIDTH), maxWidth)
}

function triggerFAQDownload(blob: Blob, fileName: string) {
  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}
