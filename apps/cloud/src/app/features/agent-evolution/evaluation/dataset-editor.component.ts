import { Dialog, type DialogRef } from '@angular/cdk/dialog'
import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { DatasetSnapshot, EvolutionCandidate, EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import {
  XpDialogFrameImports,
  XpDialogControlDirective,
  ZardButtonComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { targetLabel } from '../targets/target-directory'
import { displayOutput } from './replay-presentation'
import { CaseDraft, emptyCase, importCases, inspectDataset } from './dataset-draft'

@Component({
  selector: 'xp-replay-dataset-editor',
  standalone: true,
  imports: [
    TranslateModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardInputDirective,
    XpDialogControlDirective,
    ...XpDialogFrameImports
  ],
  templateUrl: './dataset-editor.component.html',
  host: { class: 'block min-w-0 flex-1 overflow-y-auto bg-background text-foreground' }
})
export class DatasetEditorComponent implements OnInit {
  readonly candidate = input.required<EvolutionCandidate>()
  readonly candidateTarget = input<EvolutionTargetDescriptor>()
  readonly previous = input<DatasetSnapshot>()
  readonly closed = output<void>()
  readonly created = output<string>()
  readonly facade = inject(AgentEvolutionFacade)
  private readonly i18n = inject(TranslateService)
  private readonly fb = inject(FormBuilder).nonNullable
  private readonly dialogs = inject(Dialog)
  private readonly container = inject(ViewContainerRef)
  private readonly destroy = inject(DestroyRef)
  private dialog?: DialogRef
  private readRevision = 0
  readonly prefix = 'XP.AgentEvolution.DatasetEditor.'
  readonly lang = toSignal(this.i18n.onLangChange)
  readonly name = computed(() => {
    this.lang()
    const t = this.candidateTarget()
    return t ? targetLabel(t, this.i18n.currentLang) : this.candidate().targetId
  })
  readonly details = this.fb.group({ name: '', datasetId: '', evaluatorVersion: '', metricVersion: '' })
  readonly meta = toSignal(this.details.valueChanges, { initialValue: this.details.getRawValue() })
  readonly advanced = signal(false)
  readonly drafts = signal<CaseDraft[]>([])
  readonly analysis = computed(() => inspectDataset(this.drafts()))
  readonly page = signal(1)
  readonly size = 5
  readonly pages = computed(() => Math.max(1, Math.ceil(this.drafts().length / this.size)))
  readonly visible = computed(() => {
    this.lang()
    return this.analysis()
      .rows.slice((this.page() - 1) * this.size, this.page() * this.size)
      .map((r) => ({
        ...r,
        inputPreview: r.input
          ? Object.entries(r.input)
              .map(([k, v]) => k + ': ' + v)
              .join(' · ') || '{}'
          : r.draft.input,
        expectedLabel: r.expected
          ? displayOutput(r.expected, this.candidateTarget(), this.i18n.currentLang)
          : r.draft.expected,
        expectedRaw: r.expected ? displayOutput(r.expected, undefined, this.i18n.currentLang, true) : ''
      }))
  })
  readonly rowForm = this.fb.group({
    caseId: ['', Validators.required],
    revision: new FormControl<number | null>(1, Validators.required),
    input: '',
    expected: '',
    slice: '',
    risk: '',
    evidenceRef: ''
  })
  readonly rowIndex = signal(-1)
  readonly rowErrors = signal<string[]>([])
  readonly importText = new FormControl('', { nonNullable: true })
  readonly importError = signal('')
  readonly reading = signal(false)
  readonly freezing = signal(false)
  readonly rowDialog = viewChild.required<TemplateRef<unknown>>('rowDialog')
  readonly importDialog = viewChild.required<TemplateRef<unknown>>('importDialog')
  readonly freezeDialog = viewChild.required<TemplateRef<unknown>>('freezeDialog')
  readonly defaultId = computed(() => this.candidate().targetId + '.golden')
  readonly defaultName = computed(() => {
    this.lang()
    return this.i18n.instant('XP.AgentEvolution.DefaultDatasetName', { target: this.name() })
  })
  readonly defaultMetric = computed(() => this.candidateTarget()?.metricSetId || 'default-metrics-v1')

  constructor() {
    this.destroy.onDestroy(() => {
      this.readRevision++
      this.dialog?.close()
    })
  }
  ngOnInit() {
    const d = this.previous()
    this.details.patchValue({
      datasetId: this.defaultId(),
      name: this.defaultName(),
      evaluatorVersion: d?.evaluatorVersion || '',
      metricVersion: d?.metricDefinitionVersion || this.defaultMetric()
    })
  }
  open(template: TemplateRef<unknown>, label: string, width = '42rem') {
    if (this.dialog || this.freezing()) return
    const ref = this.dialogs.open(template, {
      viewContainerRef: this.container,
      width,
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: '90dvh',
      ariaLabel: this.i18n.instant(this.prefix + label),
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
    this.dialog = ref
    ref.closed.subscribe(() => {
      if (this.dialog === ref) {
        this.dialog = undefined
        this.readRevision++
        this.reading.set(false)
      }
    })
  }
  dismiss() {
    this.dialog?.close()
  }
  openImport() {
    this.importError.set('')
    this.importText.reset('')
    this.open(this.importDialog(), 'Import')
  }
  async readFile(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const revision = ++this.readRevision
    this.reading.set(true)
    this.importError.set('')
    try {
      const text = await file.text()
      if (revision === this.readRevision) this.importText.setValue(text)
    } catch {
      if (revision === this.readRevision) this.importError.set('ReadFailed')
    } finally {
      if (revision === this.readRevision) this.reading.set(false)
    }
  }
  applyImport() {
    if (this.reading()) return
    try {
      const rows = importCases(this.importText.value)
      this.drafts.set(rows)
      this.page.set(1)
      this.dismiss()
    } catch (e) {
      this.importError.set(e instanceof RangeError ? 'EmptyArray' : 'InvalidJson')
    }
  }
  edit(index: number) {
    this.rowIndex.set(index)
    this.rowErrors.set([])
    const { caseId, revision, input, expected, slice, risk, evidenceRef } = this.drafts()[index] ?? emptyCase()
    this.rowForm.reset({ caseId, revision, input, expected, slice, risk, evidenceRef })
    if (index >= 0) this.page.set(Math.floor(index / this.size) + 1)
    this.open(this.rowDialog(), index < 0 ? 'Add' : 'Edit')
  }
  saveRow() {
    const index = this.rowIndex(),
      draft = this.rowForm.getRawValue(),
      rows = [...this.drafts()]
    const position = index < 0 ? rows.length : index
    rows[position] = draft
    const issues = inspectDataset(rows).rows[position].errors
    if (
      !issues.includes('Duplicate') &&
      rows.some((r, i) => i !== position && r.caseId === draft.caseId && r.revision === draft.revision)
    )
      issues.push('Duplicate')
    if (issues.length) {
      this.rowErrors.set(issues)
      return
    }
    this.drafts.set(rows)
    this.page.set(Math.floor(position / this.size) + 1)
    this.dismiss()
  }
  removeRow() {
    this.drafts.update((rows) => rows.filter((_, i) => i !== this.rowIndex()))
    this.page.set(Math.min(this.page(), this.pages()))
    this.dismiss()
  }
  checkFreeze() {
    if (this.analysis().valid && !this.facade.mutating()) this.open(this.freezeDialog(), 'Confirm', '34rem')
  }
  async freeze() {
    if (this.freezing() || this.facade.mutating() || !this.analysis().valid) return
    this.freezing.set(true)
    this.dismiss()
    const c = this.candidate(),
      m = this.details.getRawValue()
    try {
      const snapshot = await this.facade.createDataset({
        targetId: c.targetId,
        scope: c.targetScope,
        datasetId: m.datasetId.trim() || this.defaultId(),
        name: m.name.trim() || this.defaultName(),
        evaluatorVersion: m.evaluatorVersion.trim(),
        metricDefinitionVersion: m.metricVersion.trim() || this.defaultMetric(),
        cases: this.analysis().cases
      })
      if (snapshot && !this.destroy.destroyed && this.candidate().candidateId === c.candidateId)
        this.created.emit(snapshot.snapshotId)
    } finally {
      if (!this.destroy.destroyed) this.freezing.set(false)
    }
  }
}
