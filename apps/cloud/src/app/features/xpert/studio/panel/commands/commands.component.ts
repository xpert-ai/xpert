import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardAlertComponent } from '@xpert-ai/headless-ui'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardCheckboxComponent,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  injectPromptWorkflowAPI,
  injectToastr,
  IPromptWorkflow,
  ISkillPackage,
  SkillSlashCommand,
  SkillSlashCommandAction,
  TXpertCommandProfile,
  TXpertCommandProfileEntry,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { SkillPackageService } from 'apps/cloud/src/app/@core/services/skill-package.service'
import { forkJoin } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioPanelComponent } from '../panel.component'

type SkillCommandItem = {
  skillId: string
  skillLabel: string
  name: string
  label?: string
  description?: string
  command: SkillSlashCommand
}

type LocalCommandDraft = {
  name: string
  label: string
  description: string
  template: string
}

type CommandProfileRuntime = {
  hasProfile?: boolean
}

const BUILTIN_COMMANDS = new Set([
  'help',
  'clear',
  'plan',
  'skills',
  'plugins',
  'subagents',
  'model',
  'effort',
  'status',
  'mention'
])

@Component({
  selector: 'xpert-studio-panel-commands',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardAlertComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ...ZardCardImports,
    ZardCheckboxComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective
  ],
  templateUrl: './commands.component.html',
  styleUrls: ['./commands.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStudioPanelCommandsComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly xpertAPI = inject(XpertAPIService)
  readonly promptWorkflowAPI = injectPromptWorkflowAPI()
  readonly skillPackageAPI = inject(SkillPackageService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly profile = signal<TXpertCommandProfile>({ version: 1, commands: [] })
  readonly runtime = signal<CommandProfileRuntime | null>(null)
  readonly workflows = signal<IPromptWorkflow[]>([])
  readonly skills = signal<ISkillPackage[]>([])
  readonly localDraft = signal<LocalCommandDraft>({
    name: '',
    label: '',
    description: '',
    template: ''
  })

  readonly team = this.studioService.team
  readonly workspaceId = this.studioService.workspaceId
  readonly entries = computed(() => this.profile().commands ?? [])
  readonly profileConfigured = computed(() => this.isProfileConfigured(this.profile()))
  readonly activeWorkflows = computed(() => this.workflows().filter((workflow) => !workflow.archivedAt))
  readonly skillCommands = computed<SkillCommandItem[]>(() =>
    this.skills().flatMap((skill) => {
      const commands = Array.isArray(skill.metadata?.commands) ? skill.metadata.commands : []
      return commands
        .map((command) => normalizeSkillCommand(skill, command))
        .filter((item): item is SkillCommandItem => !!item)
    })
  )
  readonly conflicts = computed(() => this.collectConflicts())
  readonly conflictDescription = computed(() => this.conflicts().join('; '))

  constructor() {
    queueMicrotask(() => this.load())
  }

  load() {
    const xpertId = this.team()?.id
    const workspaceId = this.workspaceId()
    if (!xpertId || !workspaceId) {
      return
    }

    this.loading.set(true)
    forkJoin({
      commandProfile: this.xpertAPI.getCommandProfile(xpertId),
      workflows: this.promptWorkflowAPI.getAllByWorkspace(workspaceId),
      skills: this.skillPackageAPI.getAllByWorkspace(workspaceId)
    }).subscribe({
      next: ({ commandProfile, workflows, skills }) => {
        this.loading.set(false)
        this.profile.set(commandProfile.profile ?? { version: 1, commands: [] })
        this.runtime.set(commandProfile.runtime)
        this.workflows.set(workflows.items ?? [])
        this.skills.set(skills.items ?? [])
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  isWorkspaceEnabled(workflow: IPromptWorkflow) {
    const entry = this.findWorkspaceEntry(workflow)
    return entry ? entry.enabled !== false : !this.profileConfigured()
  }

  isSkillEnabled(item: SkillCommandItem) {
    const entry = this.findSkillEntry(item)
    return entry ? entry.enabled !== false : !this.profileConfigured()
  }

  toggleWorkspace(workflow: IPromptWorkflow, enabled: boolean) {
    this.updateEntry(
      (entry) => entry.source === 'workspace_prompt_workflow' && entry.workflowId === workflow.id,
      () => ({
        source: 'workspace_prompt_workflow',
        workflowId: workflow.id,
        enabled,
        order: this.nextOrder()
      }),
      (entry) => ({ ...entry, enabled })
    )
  }

  toggleSkill(item: SkillCommandItem, enabled: boolean) {
    this.updateEntry(
      (entry) => entry.source === 'skill' && (entry.skillCommandName ?? entry.name) === item.name,
      () => ({
        source: 'skill',
        skillCommandName: item.name,
        name: item.name,
        label: item.label,
        enabled,
        order: this.nextOrder()
      }),
      (entry) => ({ ...entry, enabled })
    )
  }

  updateEntryValue(index: number, patch: Partial<TXpertCommandProfileEntry>) {
    this.profile.update((profile) => {
      const commands = [...(profile.commands ?? [])]
      commands[index] = {
        ...commands[index],
        ...patch
      }
      return this.createConfiguredProfile(commands)
    })
  }

  moveEntry(index: number, direction: -1 | 1) {
    this.profile.update((profile) => {
      const commands = [...(profile.commands ?? [])]
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= commands.length) {
        return profile
      }
      const current = commands[index]
      commands[index] = commands[nextIndex]
      commands[nextIndex] = current
      return this.createConfiguredProfile(commands.map((entry, order) => ({ ...entry, order })))
    })
  }

  removeEntry(index: number) {
    this.profile.update((profile) =>
      this.createConfiguredProfile((profile.commands ?? []).filter((_, itemIndex) => itemIndex !== index))
    )
  }

  addLocalCommand() {
    const draft = this.localDraft()
    if (!draft.name?.trim() || !draft.template?.trim()) {
      return
    }
    this.profile.update((profile) => {
      const baseProfile = this.isProfileConfigured(profile) ? profile : this.createDefaultProfile()
      return this.createConfiguredProfile([
        ...(baseProfile.commands ?? []),
        {
          source: 'xpert',
          enabled: true,
          order: baseProfile.commands?.length ?? 0,
          name: draft.name.trim(),
          label: draft.label?.trim(),
          description: draft.description?.trim(),
          category: 'prompt_workflow',
          template: draft.template.trim()
        }
      ])
    })
    this.localDraft.set({ name: '', label: '', description: '', template: '' })
  }

  updateLocalDraft(patch: Partial<LocalCommandDraft>) {
    this.localDraft.update((draft) => ({ ...draft, ...patch }))
  }

  save() {
    const xpertId = this.team()?.id
    if (!xpertId) {
      return
    }
    if (!this.profileConfigured()) {
      this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
      return
    }
    this.saving.set(true)
    this.xpertAPI.updateCommandProfile(xpertId, this.profile()).subscribe({
      next: () => {
        this.saving.set(false)
        this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
        this.studioService.refresh()
        this.load()
      },
      error: (error) => {
        this.saving.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  close() {
    this.panelComponent.sidePanel.set(null)
  }

  displayEntryName(entry: TXpertCommandProfileEntry) {
    if (entry.source === 'workspace_prompt_workflow') {
      const workflow = this.workflows().find((item) => item.id === entry.workflowId)
      return entry.name || workflow?.name || entry.workflowId || 'workflow'
    }
    return entry.name || entry.skillCommandName || 'command'
  }

  displayEntryDescription(entry: TXpertCommandProfileEntry) {
    if (entry.source === 'workspace_prompt_workflow') {
      const workflow = this.workflows().find((item) => item.id === entry.workflowId)
      return entry.description || workflow?.description || workflow?.template
    }
    if (entry.source === 'skill') {
      const skillCommand = this.skillCommands().find((item) => item.name === (entry.skillCommandName ?? entry.name))
      return entry.description || skillCommand?.description || skillCommand?.skillLabel
    }
    return entry.description || entry.template
  }

  private findWorkspaceEntry(workflow: IPromptWorkflow) {
    return this.entries().find(
      (entry) => entry.source === 'workspace_prompt_workflow' && entry.workflowId === workflow.id
    )
  }

  private findSkillEntry(item: SkillCommandItem) {
    return this.entries().find(
      (entry) => entry.source === 'skill' && (entry.skillCommandName ?? entry.name) === item.name
    )
  }

  private updateEntry(
    predicate: (entry: TXpertCommandProfileEntry) => boolean,
    create: () => TXpertCommandProfileEntry,
    update: (entry: TXpertCommandProfileEntry) => TXpertCommandProfileEntry
  ) {
    this.profile.update((profile) => {
      const baseProfile = this.isProfileConfigured(profile) ? profile : this.createDefaultProfile()
      const commands = [...(baseProfile.commands ?? [])]
      const index = commands.findIndex(predicate)
      if (index >= 0) {
        commands[index] = update(commands[index])
      } else {
        commands.push(create())
      }
      return this.createConfiguredProfile(commands)
    })
  }

  private nextOrder() {
    return this.entries().length
  }

  private isProfileConfigured(profile: TXpertCommandProfile) {
    if (profile.enabled === false) {
      return false
    }
    return profile.enabled === true || !!profile.commands?.length || this.runtime()?.hasProfile === true
  }

  private createDefaultProfile(): TXpertCommandProfile {
    return this.createConfiguredProfile(this.createDefaultEntries())
  }

  private createConfiguredProfile(commands: TXpertCommandProfileEntry[]): TXpertCommandProfile {
    return {
      ...this.profile(),
      version: 1,
      enabled: true,
      commands
    }
  }

  private createDefaultEntries(): TXpertCommandProfileEntry[] {
    const commands: TXpertCommandProfileEntry[] = []
    for (const workflow of this.activeWorkflows()) {
      commands.push({
        source: 'workspace_prompt_workflow',
        workflowId: workflow.id,
        enabled: true,
        order: commands.length
      })
    }
    for (const item of this.skillCommands()) {
      commands.push({
        source: 'skill',
        skillCommandName: item.name,
        name: item.name,
        label: item.label,
        enabled: true,
        order: commands.length
      })
    }
    return commands
  }

  private collectConflicts() {
    const conflicts: string[] = []
    const seen = new Map<string, string>()
    for (const entry of this.entries().filter((item) => item.enabled !== false)) {
      const name = this.displayEntryName(entry)
      if (!name) {
        continue
      }
      if (BUILTIN_COMMANDS.has(name)) {
        conflicts.push(this.#translate.instant('PAC.PromptWorkflow.BuiltinCommandConflict', { name }))
      }
      const previous = seen.get(name)
      if (previous) {
        conflicts.push(
          this.#translate.instant('PAC.PromptWorkflow.CommandNameConflict', { name, previous, source: entry.source })
        )
      } else {
        seen.set(name, entry.source)
      }
    }
    return conflicts
  }
}

function normalizeSkillCommand(skill: ISkillPackage, value: unknown): SkillCommandItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const command = value as SkillSlashCommand
  const action = command.action as SkillSlashCommandAction
  if (!command.name || action?.type !== 'submit_prompt') {
    return null
  }

  return {
    skillId: skill.id,
    skillLabel: skill.name || skill.metadata?.name || skill.id,
    name: command.name,
    label: command.label,
    description: command.description,
    command
  }
}
