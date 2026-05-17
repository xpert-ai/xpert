import { Clipboard } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardAlertComponent } from '@xpert-ai/headless-ui/components/alert'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  injectPromptWorkflowAPI,
  injectToastr,
  IPromptWorkflow,
  OrderTypeEnum,
  PromptWorkflowVisibility,
  TPromptWorkflow
} from '../../../../@core'
import { XpertAssistantFacade, type PromptWorkflowRefreshEvent } from '../../assistant-shell/assistant.facade'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

type PromptWorkflowDraft = Partial<TPromptWorkflow> & {
  id?: string
  tagsText?: string
  aliasesText?: string
  runtimeCapabilitiesText?: string
}

const WORKFLOW_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

const PROMPT_WORKFLOW_TEMPLATES: Array<{
  name: string
  label: string
  description: string
  argsHint: string
  template: string
  tags: string[]
}> = [
  {
    name: 'review',
    label: 'Review',
    description: 'Review selected context and return actionable findings.',
    argsHint: '<path or context>',
    template: 'Review {{args}}. Return actionable findings grouped by severity.',
    tags: ['code', 'quality']
  },
  {
    name: 'explain',
    label: 'Explain',
    description: 'Explain a file, query, error, or concept.',
    argsHint: '<target>',
    template: 'Explain {{args}} clearly. Include the relevant assumptions and edge cases.',
    tags: ['learning']
  },
  {
    name: 'test',
    label: 'Test',
    description: 'Design or update tests for the selected target.',
    argsHint: '<path or feature>',
    template: 'Create or update tests for {{args}}. Focus on meaningful behavior and regressions.',
    tags: ['test', 'quality']
  },
  {
    name: 'debug',
    label: 'Debug',
    description: 'Debug an error, failing test, or unexpected behavior.',
    argsHint: '<error or context>',
    template: 'Debug {{args}}. Identify likely causes, propose checks, and suggest a minimal fix.',
    tags: ['debug']
  },
  {
    name: 'summarize',
    label: 'Summarize',
    description: 'Summarize long context into a compact brief.',
    argsHint: '<context>',
    template: 'Summarize {{args}} into concise bullets with open questions and decisions.',
    tags: ['writing']
  },
  {
    name: 'rewrite',
    label: 'Rewrite',
    description: 'Rewrite content for clarity, tone, or structure.',
    argsHint: '<content>',
    template: 'Rewrite {{args}} for clarity. Preserve meaning and call out important changes.',
    tags: ['writing']
  }
]

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardAlertComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ...ZardCardImports,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardSelectImports
  ],
  selector: 'xp-workspace-prompt-workflows',
  templateUrl: './workflows.component.html',
  styleUrls: ['./workflows.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspacePromptWorkflowsComponent {
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly api = injectPromptWorkflowAPI()
  readonly #toastr = injectToastr()
  readonly #clipboard = inject(Clipboard)
  readonly #translate = inject(TranslateService)
  readonly #assistantFacade = inject(XpertAssistantFacade, { optional: true })

  readonly workspace = this.homeComponent.workspace
  readonly canWriteWorkspace = this.homeComponent.canWriteWorkspace
  readonly searchText = this.homeComponent.searchText

  readonly templates = PROMPT_WORKFLOW_TEMPLATES
  readonly workflows = signal<IPromptWorkflow[]>([])
  readonly selectedId = signal<string | null>(null)
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly usage = signal<Array<{
    id?: string
    name?: string
    title?: string
    version?: string
    latest?: boolean
  }> | null>(null)
  readonly draft = signal<PromptWorkflowDraft>(this.createEmptyDraft())

  readonly activeWorkflows = computed(() => this.workflows().filter((workflow) => !workflow.archivedAt))
  readonly filteredWorkflows = computed(() => {
    const term = (this.searchText() ?? '').trim().toLowerCase()
    if (!term) {
      return this.activeWorkflows()
    }
    return this.activeWorkflows().filter((workflow) =>
      [
        workflow.name,
        workflow.label,
        workflow.description,
        workflow.category,
        workflow.argsHint,
        ...(workflow.tags ?? []),
        ...(workflow.aliases ?? [])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })
  readonly selectedWorkflow = computed(
    () => this.workflows().find((workflow) => workflow.id === this.selectedId()) ?? null
  )
  readonly validationMessage = computed(() => {
    const draft = this.draft()
    const name = draft.name?.trim() ?? ''
    if (!WORKFLOW_NAME_PATTERN.test(name)) {
      return this.#translate.instant('PAC.PromptWorkflow.InvalidCommandName')
    }
    if (!draft.template?.trim()) {
      return this.#translate.instant('PAC.PromptWorkflow.TemplateRequired')
    }
    if (draft.runtimeCapabilitiesText?.trim()) {
      try {
        JSON.parse(draft.runtimeCapabilitiesText)
      } catch {
        return this.#translate.instant('PAC.PromptWorkflow.RuntimeCapabilitiesJsonRequired')
      }
    }
    return null
  })

  constructor() {
    effect(() => {
      if (this.workspace()?.id) {
        this.refresh()
      }
    })

    effect(() => {
      const refreshEvent = this.#assistantFacade?.promptWorkflowRefresh()
      const workspaceId = this.workspace()?.id
      if (!refreshEvent || !workspaceId || refreshEvent.workspaceId !== workspaceId) {
        return
      }

      this.refresh(refreshEvent)
    })
  }

  refresh(selection?: PromptWorkflowRefreshEvent) {
    const workspaceId = this.workspace()?.id
    if (!workspaceId) {
      return
    }

    this.loading.set(true)
    this.api.getAllByWorkspace(workspaceId, { order: { updatedAt: OrderTypeEnum.DESC } }).subscribe({
      next: ({ items }) => {
        this.loading.set(false)
        this.workflows.set(items ?? [])
        const target = this.findWorkflow(selection)
        if (target && !target.archivedAt) {
          this.selectWorkflow(target)
          return
        }

        if (selection?.operation === 'deleted') {
          this.selectWorkflow(this.activeWorkflows()[0] ?? null)
          return
        }

        const selected = this.selectedWorkflow()
        if (!selected || selected.archivedAt) {
          this.selectWorkflow(this.activeWorkflows()[0] ?? null)
        }
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  createFromTemplate(template = PROMPT_WORKFLOW_TEMPLATES[0]) {
    this.selectedId.set(null)
    this.usage.set(null)
    this.draft.set({
      name: this.nextAvailableName(template.name),
      label: this.templateText(template, 'Label', template.label),
      description: this.templateText(template, 'Description', template.description),
      category: 'prompt_workflow',
      argsHint: this.templateText(template, 'ArgsHint', template.argsHint),
      template: this.templateText(template, 'Template', template.template),
      visibility: 'team',
      tagsText: template.tags.join(', '),
      aliasesText: '',
      runtimeCapabilitiesText: ''
    })
  }

  selectWorkflow(workflow: IPromptWorkflow | null) {
    this.selectedId.set(workflow?.id ?? null)
    this.usage.set(null)
    this.draft.set(workflow ? this.workflowToDraft(workflow) : this.createEmptyDraft())
  }

  save() {
    const workspaceId = this.workspace()?.id
    const body = this.draftToPayload()
    if (!workspaceId || !body || this.validationMessage()) {
      return
    }

    this.saving.set(true)
    const request = this.selectedId()
      ? this.api.updateInWorkspace(workspaceId, this.selectedId(), body)
      : this.api.createInWorkspace(workspaceId, body)

    request.subscribe({
      next: (workflow) => {
        this.saving.set(false)
        this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
        this.refresh()
        this.selectWorkflow(workflow)
      },
      error: (error) => {
        this.saving.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  duplicate(workflow: IPromptWorkflow) {
    const workspaceId = this.workspace()?.id
    if (!workspaceId || !workflow.id) {
      return
    }
    this.api.duplicateInWorkspace(workspaceId, workflow.id).subscribe({
      next: (copy) => {
        this.refresh()
        this.selectWorkflow(copy)
      },
      error: (error) => this.#toastr.error(getErrorMessage(error))
    })
  }

  archive(workflow: IPromptWorkflow) {
    const workspaceId = this.workspace()?.id
    if (!workspaceId || !workflow.id) {
      return
    }
    this.api.archiveInWorkspace(workspaceId, workflow.id).subscribe({
      next: () => {
        this.refresh()
        this.selectWorkflow(null)
      },
      error: (error) => this.#toastr.error(getErrorMessage(error))
    })
  }

  loadUsage(workflow = this.selectedWorkflow()) {
    const workspaceId = this.workspace()?.id
    if (!workspaceId || !workflow?.id) {
      return
    }
    this.api.getUsage(workspaceId, workflow.id).subscribe({
      next: (usage) => this.usage.set(usage),
      error: (error) => this.#toastr.error(getErrorMessage(error))
    })
  }

  copySkillCommand(workflow = this.selectedWorkflow()) {
    if (!workflow) {
      return
    }
    const command = this.api.exportSkillCommand(workflow)
    this.#clipboard.copy(JSON.stringify(command, null, 2))
    this.#toastr.success('PAC.Messages.CopiedToClipboard', { Default: 'Copied to clipboard' })
  }

  updateDraft(patch: Partial<PromptWorkflowDraft>) {
    this.draft.update((draft) => ({ ...draft, ...patch }))
  }

  displayTemplateLabel(template: (typeof PROMPT_WORKFLOW_TEMPLATES)[number]) {
    return this.templateText(template, 'Label', template.label)
  }

  displayVisibility(visibility: PromptWorkflowVisibility | undefined) {
    const value = visibility ?? 'team'
    const key = `PAC.PromptWorkflow.Visibility.${value}`
    const label = this.#translate.instant(key)
    return label === key ? value : label
  }

  displayUsageVersion(version: string | undefined) {
    return version || this.#translate.instant('PAC.PromptWorkflow.Draft')
  }

  private createEmptyDraft(): PromptWorkflowDraft {
    return {
      name: '',
      label: '',
      description: '',
      category: 'prompt_workflow',
      argsHint: '<args>',
      template: '',
      visibility: 'team',
      tagsText: '',
      aliasesText: '',
      runtimeCapabilitiesText: ''
    }
  }

  private workflowToDraft(workflow: IPromptWorkflow): PromptWorkflowDraft {
    return {
      ...workflow,
      tagsText: workflow.tags?.join(', ') ?? '',
      aliasesText: workflow.aliases?.join(', ') ?? '',
      runtimeCapabilitiesText: workflow.runtimeCapabilities ? JSON.stringify(workflow.runtimeCapabilities, null, 2) : ''
    }
  }

  private findWorkflow(selection?: PromptWorkflowRefreshEvent) {
    if (!selection) {
      return null
    }

    return (
      this.workflows().find((workflow) => Boolean(selection.workflowId && workflow.id === selection.workflowId)) ??
      this.workflows().find((workflow) => Boolean(selection.key && workflow.name === selection.key)) ??
      null
    )
  }

  private draftToPayload(): Partial<TPromptWorkflow> | null {
    const draft = this.draft()
    const runtimeCapabilitiesText = draft.runtimeCapabilitiesText?.trim()
    return {
      name: draft.name?.trim(),
      label: draft.label?.trim(),
      description: draft.description?.trim(),
      category: draft.category?.trim() || 'prompt_workflow',
      aliases: splitList(draft.aliasesText),
      argsHint: draft.argsHint?.trim(),
      template: draft.template?.trim(),
      tags: splitList(draft.tagsText),
      visibility: (draft.visibility as PromptWorkflowVisibility) ?? 'team',
      runtimeCapabilities: runtimeCapabilitiesText ? JSON.parse(runtimeCapabilitiesText) : undefined
    }
  }

  private nextAvailableName(baseName: string) {
    const existing = new Set(this.activeWorkflows().map((workflow) => workflow.name))
    if (!existing.has(baseName)) {
      return baseName
    }
    for (let index = 2; index < 100; index++) {
      const name = `${baseName}-${index}`
      if (!existing.has(name)) {
        return name
      }
    }
    return `${baseName}-${Date.now()}`
  }

  private templateText(
    template: (typeof PROMPT_WORKFLOW_TEMPLATES)[number],
    field: 'Label' | 'Description' | 'ArgsHint' | 'Template',
    fallback: string
  ) {
    const key = `PAC.PromptWorkflow.Templates.${template.name}.${field}`
    const label = this.#translate.instant(key, { args: '{{args}}' })
    return label === key ? fallback : label
  }
}

function splitList(value: string | undefined) {
  return Array.from(
    new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}
