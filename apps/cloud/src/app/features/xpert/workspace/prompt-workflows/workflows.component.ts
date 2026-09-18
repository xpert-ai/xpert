import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  signal,
  TemplateRef,
  untracked,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IPromptWorkflow,
  ITag,
  OrderTypeEnum,
  PromptWorkflowInput,
  PromptWorkflowVisibility,
  parsePromptCapabilityConfig
} from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardMenuImports,
  ZardSelectImports,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectPromptWorkflowAPI, injectToastr, injectXpertAPI } from '../../../../@core'
import { TagSelectComponent } from '../../../../@shared/tag/tag-select/tag-select.component'
import { TagDirectoryComponent } from '../../../../@shared/tag/directory/tag-directory.component'
import { XpertAssistantFacade, type PromptWorkflowRefreshEvent } from '../../assistant-shell/assistant.facade'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { PromptExpertSelectComponent, PromptWorkflowExpert } from './expert-association-select.component'
import { PromptCapabilitySelectComponent } from './capability-select.component'
import { createPromptScenarioForm } from './scenario-editor.component'
import { PromptScenarioSettingsComponent } from './scenario-settings.component'
import { PROMPT_WORKFLOW_TEMPLATES, promptTextValidator, splitPromptList, WORKFLOW_NAME_PATTERN } from './workflow-form'

type Panel = 'templates' | 'archive' | 'discard' | 'tags' | 'export'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardMenuImports,
    ...ZardSelectImports,
    ...ZardTableImports,
    ...ZardTooltipImports,
    TagSelectComponent,
    TagDirectoryComponent,
    PromptExpertSelectComponent,
    PromptCapabilitySelectComponent,
    PromptScenarioSettingsComponent
  ],
  selector: 'xp-workspace-prompt-workflows',
  templateUrl: './workflows.component.html',
  styleUrls: ['./workflows.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspacePromptWorkflowsComponent {
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly api = injectPromptWorkflowAPI()
  readonly #xperts = injectXpertAPI()
  readonly #toastr = injectToastr()
  readonly #clipboard = inject(Clipboard)
  readonly #translate = inject(TranslateService)
  readonly #dialog = inject(Dialog)
  readonly #fb = inject(FormBuilder)
  readonly #assistantFacade = inject(XpertAssistantFacade, { optional: true })
  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
  readonly canWriteWorkspace = this.homeComponent.canWriteWorkspace
  readonly searchText = this.homeComponent.searchText
  readonly templates = PROMPT_WORKFLOW_TEMPLATES
  readonly workflows = signal<IPromptWorkflow[]>([])
  readonly experts = signal<PromptWorkflowExpert[]>([])
  readonly loading = signal(false)
  readonly expertsLoading = signal(false)
  readonly expertError = signal('')
  readonly loadError = signal('')
  readonly saveError = signal('')
  readonly saving = signal(false)
  readonly editing = signal(false)
  readonly selectedId = signal<string | null>(null)
  readonly expertFilter = signal('all')
  readonly sort = signal<'updated' | 'name'>('updated')
  readonly showAdvanced = signal(false)
  readonly panel = signal<Panel>('templates')
  readonly panelWorkflow = signal<IPromptWorkflow | null>(null)
  readonly panelError = signal('')
  readonly exportExpertId = signal('')
  readonly exportExperts = computed(() => {
    const ids = this.panelWorkflow()?.associatedXpertIds ?? []
    return this.experts().filter((expert) => !ids.length || ids.includes(expert.id))
  })
  readonly dialogTemplate = viewChild.required<TemplateRef<unknown>>('dialogTemplate')
  readonly form = this.#fb.nonNullable.group({
    label: ['', [promptTextValidator, Validators.maxLength(120)]],
    name: ['', [Validators.required, Validators.pattern(WORKFLOW_NAME_PATTERN)]],
    description: ['', Validators.maxLength(255)],
    category: ['prompt_workflow', Validators.maxLength(80)],
    argsHint: ['', Validators.maxLength(120)],
    template: ['', promptTextValidator],
    scenarios: new FormArray<ReturnType<typeof createPromptScenarioForm>>([]),
    visibility: this.#fb.nonNullable.control<PromptWorkflowVisibility>('team'),
    aliasesText: '',
    runtimeCapabilities: this.#fb.control<unknown>(null),
    organizationTags: this.#fb.nonNullable.control<ITag[]>([]),
    associatedXpertIds: this.#fb.nonNullable.control<string[]>([])
  })
  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() })
  readonly selected = computed(() => this.workflows().find((workflow) => workflow.id === this.selectedId()) ?? null)
  readonly activeWorkflows = computed(() => this.workflows().filter((workflow) => !workflow.archivedAt))
  readonly filteredWorkflows = computed(() => {
    const query = (this.searchText() ?? '').trim().toLocaleLowerCase()
    const selectedTags = this.homeComponent.tags()
    const scope = this.expertFilter()
    return this.activeWorkflows()
      .filter((workflow) => {
        const search = [
          workflow.label,
          workflow.name,
          workflow.description,
          ...(workflow.tags ?? []),
          ...(workflow.organizationTags ?? []).map((tag) => tag.name),
          ...(workflow.aliases ?? [])
        ]
          .join(' ')
          .toLocaleLowerCase()
        const tagsMatch = selectedTags.every((tag) => workflow.organizationTags?.some((item) => item.id === tag.id))
        const experts = workflow.associatedXpertIds ?? []
        return (
          (!query || search.includes(query)) &&
          tagsMatch &&
          (scope === 'all' || (scope === 'shared' ? !experts.length : !experts.length || experts.includes(scope)))
        )
      })
      .sort((a, b) =>
        this.sort() === 'name'
          ? (a.label || a.name).localeCompare(b.label || b.name)
          : new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
      )
  })
  #request = 0
  #ref: DialogRef<unknown> | null = null
  #legacyTags: string[] = []

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId()
      untracked(() => {
        this.#request++
        this.#ref?.close()
        this.editing.set(false)
        this.workflows.set([])
        this.experts.set([])
        this.form.markAsPristine()
        if (workspaceId) void this.refresh()
      })
    })
    effect(() => {
      const event = this.#assistantFacade?.promptWorkflowRefresh()
      if (event?.workspaceId === this.workspace()?.id) untracked(() => void this.refresh(event))
    })
    effect(() => {
      if (this.canWriteWorkspace() && !this.saving()) this.form.enable({ emitEvent: false })
      else this.form.disable({ emitEvent: false })
    })
    inject(DestroyRef).onDestroy(() => {
      this.#request++
      this.#ref?.close()
    })
  }

  async refresh(selection?: PromptWorkflowRefreshEvent) {
    const workspaceId = this.workspace()?.id
    if (!workspaceId) return
    const request = ++this.#request
    this.loading.set(true)
    this.loadError.set('')
    void this.loadExperts(workspaceId, request)
    try {
      const { items } = await firstValueFrom(
        this.api.getAllByWorkspace(workspaceId, { order: { updatedAt: OrderTypeEnum.DESC } })
      )
      if (request !== this.#request) return
      this.workflows.set(items ?? [])
      if (selection && !this.form.dirty && selection.operation !== 'deleted') {
        const target = items?.find(
          (workflow) => workflow.id === selection.workflowId || workflow.name === selection.key
        )
        if (target && !target.archivedAt) this.setEditor(target)
      }
    } catch (error) {
      if (request === this.#request) this.loadError.set(getErrorMessage(error))
    } finally {
      if (request === this.#request) this.loading.set(false)
    }
  }

  private async loadExperts(workspaceId: string, request: number) {
    this.expertsLoading.set(true)
    this.expertError.set('')
    try {
      const { items } = await firstValueFrom(
        this.#xperts.getAllByWorkspace(workspaceId, {
          select: ['id', 'name', 'title'],
          where: { latest: true }
        })
      )
      if (request === this.#request)
        this.experts.set(items.filter((expert): expert is typeof expert & { id: string } => !!expert.id))
    } catch (error) {
      if (request === this.#request) this.expertError.set(getErrorMessage(error))
    } finally {
      if (request === this.#request) this.expertsLoading.set(false)
    }
  }

  async edit(workflow?: IPromptWorkflow) {
    if (!(await this.confirmLeave())) return
    this.setEditor(workflow)
  }

  private setEditor(workflow?: IPromptWorkflow) {
    this.selectedId.set(workflow?.id ?? null)
    this.#legacyTags = workflow?.tags ?? []
    this.saveError.set('')
    this.showAdvanced.set(false)
    this.form.reset({
      label: workflow?.label || workflow?.name || '',
      name: workflow?.name ?? '',
      description: workflow?.description ?? '',
      category: workflow?.category ?? 'prompt_workflow',
      argsHint: workflow?.argsHint ?? '',
      template: workflow?.template ?? '',
      visibility: workflow?.visibility ?? 'team',
      aliasesText: workflow?.aliases?.join(', ') ?? '',
      runtimeCapabilities: workflow?.runtimeCapabilities ?? null,
      organizationTags: workflow?.organizationTags ?? [],
      associatedXpertIds: workflow?.associatedXpertIds ?? []
    })
    this.editing.set(true)
    this.form.controls.scenarios.clear()
    for (const scenario of workflow?.scenarios ?? [])
      this.form.controls.scenarios.push(createPromptScenarioForm(scenario))
  }

  async back() {
    if (await this.confirmLeave()) {
      this.editing.set(false)
      this.form.markAsPristine()
    }
  }

  async confirmLeave(): Promise<boolean> {
    if (this.saving()) return false
    if (!this.editing() || !this.form.dirty) return true
    this.openPanel('discard')
    return (await firstValueFrom(this.#ref.closed)) === true
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.editing() && this.form.dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  async save(): Promise<boolean> {
    this.form.markAllAsTouched()
    if (this.form.invalid || !this.canWriteWorkspace() || this.saving()) return false
    const workspaceId = this.workspace()?.id
    if (!workspaceId) return false
    const draft = this.form.getRawValue()
    const body: PromptWorkflowInput = {
      name: draft.name.trim(),
      label: draft.label.trim(),
      description: draft.description.trim(),
      template: draft.template.trim(),
      scenarios: draft.scenarios.map((scenario) => ({
        ...scenario,
        label: scenario.label.trim(),
        args: scenario.args.trim()
      })),
      category: draft.category.trim(),
      argsHint: draft.argsHint.trim(),
      aliases: splitPromptList(draft.aliasesText),
      visibility: draft.visibility,
      runtimeCapabilities: draft.runtimeCapabilities,
      tags: this.#legacyTags,
      organizationTagIds: draft.organizationTags.map((tag) => tag.id),
      associatedXpertIds: draft.associatedXpertIds
    }
    this.saving.set(true)
    this.saveError.set('')
    try {
      const id = this.selectedId()
      const workflow = await firstValueFrom(
        id ? this.api.updateInWorkspace(workspaceId, id, body) : this.api.createInWorkspace(workspaceId, body)
      )
      if (workspaceId !== this.workspace()?.id) return false
      this.workflows.update((items) => [workflow, ...items.filter((item) => item.id !== workflow.id)])
      this.selectedId.set(workflow.id)
      this.form.markAsPristine()
      this.#toastr.success('XP.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
      void this.refresh()
      return true
    } catch (error) {
      if (workspaceId === this.workspace()?.id) this.saveError.set(getErrorMessage(error))
      return false
    } finally {
      this.saving.set(false)
    }
  }

  async saveAndLeave() {
    if (await this.save()) this.closePanel(true)
  }

  async createFromTemplate(template: (typeof PROMPT_WORKFLOW_TEMPLATES)[number]) {
    this.closePanel()
    if (!(await this.confirmLeave())) return
    this.setEditor()
    this.form.patchValue({
      name: this.nextName(template.name),
      label: this.templateText(template, 'Label'),
      description: this.templateText(template, 'Description'),
      argsHint: this.templateText(template, 'ArgsHint'),
      template: this.templateText(template, 'Template')
    })
    this.form.markAsDirty()
  }

  async duplicate(workflow: IPromptWorkflow) {
    if (!this.canWriteWorkspace() || !(await this.confirmLeave())) return
    this.setEditor(workflow)
    this.selectedId.set(null)
    this.form.patchValue({
      name: this.nextName(`${workflow.name.slice(0, 54)}-copy`),
      label: this.#translate.instant('XP.PromptWorkflow.CopyLabel', { name: workflow.label || workflow.name })
    })
    this.form.markAsDirty()
  }

  openPanel(panel: Panel, workflow: IPromptWorkflow | null = null) {
    this.#ref?.close()
    this.panel.set(panel)
    this.panelWorkflow.set(workflow)
    this.panelError.set('')
    this.#ref = this.#dialog.open(this.dialogTemplate(), {
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      maxWidth: '95vw',
      maxHeight: '90vh',
      disableClose: panel === 'discard',
      ariaLabel: this.#translate.instant('XP.PromptWorkflow.Panel.' + panel)
    })
  }

  closePanel(result?: boolean) {
    this.#ref?.close(result)
    this.#ref = null
  }

  async archive() {
    const workflow = this.panelWorkflow()
    const workspaceId = this.workspace()?.id
    if (!workspaceId || !workflow?.id || !this.canWriteWorkspace() || this.saving()) return
    this.saving.set(true)
    try {
      await firstValueFrom(this.api.archiveInWorkspace(workspaceId, workflow.id))
      if (workspaceId !== this.workspace()?.id) return
      this.workflows.update((items) => items.filter((item) => item.id !== workflow.id))
      this.closePanel()
      void this.refresh()
    } catch (error) {
      this.panelError.set(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  copySkillCommand(workflow: IPromptWorkflow, xpertId?: string) {
    if (parsePromptCapabilityConfig(workflow.runtimeCapabilities)?.experts.length && !xpertId) {
      this.exportExpertId.set('')
      this.openPanel('export', workflow)
      return
    }
    const exported = xpertId ? this.api.exportSkillCommand(workflow, xpertId) : this.api.exportSkillCommand(workflow)
    const copied = this.#clipboard.copy(JSON.stringify(exported, null, 2))
    if (copied) this.#toastr.success('XP.Messages.CopiedToClipboard', { Default: 'Copied to clipboard' })
    else this.#toastr.error(this.#translate.instant('XP.PromptWorkflow.CopyFailed'))
    if (copied && this.panel() === 'export') this.closePanel()
  }

  setCapabilities(value: unknown) {
    this.form.controls.runtimeCapabilities.setValue(value)
    this.form.markAsDirty()
  }

  setExperts(ids: string[]) {
    this.form.controls.associatedXpertIds.setValue(ids)
    this.form.markAsDirty()
  }
  expertName(id: string) {
    const expert = this.experts().find((item) => item.id === id)
    return expert?.title || expert?.name || this.#translate.instant('XP.PromptWorkflow.Unavailable')
  }
  expertNames(workflow: IPromptWorkflow) {
    return (workflow.associatedXpertIds ?? []).map((id) => this.expertName(id)).join(', ')
  }
  clearFilters() {
    this.expertFilter.set('all')
    this.homeComponent.tags.set([])
    this.homeComponent.searchControl.setValue('')
  }
  templateText(
    template: (typeof PROMPT_WORKFLOW_TEMPLATES)[number],
    field: 'Label' | 'Description' | 'ArgsHint' | 'Template'
  ) {
    return this.#translate.instant(`XP.PromptWorkflow.Templates.${template.name}.${field}`, { args: '{{args}}' })
  }
  private nextName(base: string) {
    const names = new Set(this.workflows().map((item) => item.name))
    let name = base
    let index = 2
    while (names.has(name)) name = `${base.slice(0, 54)}-${index++}`
    return name
  }
}
