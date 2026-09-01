import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { IXpert, IXpertTask, IXpertWorkspace, TXpertProjectMemberSummary } from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports,
  ZardSwitchComponent,
  ZardDialogService
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { XpertAPIService } from '../../@core/services/xpert.service'
import { XpertWorkspaceService } from '../../@core/services/xpert-workspace.service'
import { ScheduleTaskStatus, Store, ToastrService, XpertTaskService, getErrorMessage } from '../../@core'
import { XpertTaskDialogService } from '../../@shared/chat/task-dialog/task-dialog.service'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectFacade } from './project.facade'
import { isProjectAssistant } from './project-assistant.constants'
import { XpertProjectAssistantsDialogComponent } from './project-assistants-dialog.component'
import { XpertProjectConnectorsDialogComponent } from './project-connectors-dialog.component'

@Component({
  standalone: true,
  selector: 'xp-project-config',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardFormImports,
    ...ZardCardImports,
    ...ZardSelectImports
  ],
  template: `
    <section class="mx-auto flex w-full max-w-screen-xl flex-col gap-8 p-4 sm:p-6">
      <header class="flex flex-col gap-2 border-b border-divider-subtle pb-5">
        <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          {{ 'XP.XProject.Governance' | translate }}
        </p>
        <h2 class="text-xl font-semibold text-text-primary">{{ 'XP.XProject.ProjectConfiguration' | translate }}</h2>
        <p class="max-w-3xl text-sm leading-6 text-text-secondary">
          {{ 'XP.XProject.ConfigurationDescription' | translate }}
        </p>
      </header>

      <section class="flex flex-col gap-4" aria-labelledby="workspace-binding-title">
        <div>
          <h3 id="workspace-binding-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.WorkspaceLabel' | translate }}
          </h3>
          <p class="mt-1 text-sm text-text-secondary">
            {{ 'XP.XProject.ProjectAssistantBindingDescription' | translate }}
          </p>
        </div>
        <div class="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1">
            @if (workspace(); as boundWorkspace) {
              <p class="truncate text-sm font-medium text-text-primary">{{ boundWorkspace.name }}</p>
              <p class="mt-1 text-xs text-text-tertiary">
                {{
                  boundWorkspace.capabilities?.canRun
                    ? ('XP.XProject.ProjectAssistantRole' | translate)
                    : ('XP.XProject.NoAccessWorkspace' | translate)
                }}
              </p>
            } @else if (facade.project()?.workspaceId) {
              <p class="text-sm text-text-secondary">{{ 'XP.XProject.NoAccessWorkspace' | translate }}</p>
            } @else {
              <p class="text-sm text-text-destructive">{{ 'XP.XProject.BindWorkspaceToAddResources' | translate }}</p>
              <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <z-select
                  class="min-w-0 flex-1"
                  [zValue]="workspaceSelection()"
                  [zDisabled]="workspacesLoading() || bindingWorkspace()"
                  [zPlaceholder]="'XP.XProject.SelectWorkspace' | translate"
                  (zSelectionChange)="selectWorkspace($event)"
                >
                  @for (availableWorkspace of availableWorkspaces(); track availableWorkspace.id) {
                    <z-select-item [zValue]="availableWorkspace.id">{{ availableWorkspace.name }}</z-select-item>
                  }
                </z-select>
                <button
                  z-button
                  zType="outline"
                  zSize="default"
                  type="button"
                  [disabled]="!workspaceSelection() || workspacesLoading() || bindingWorkspace()"
                  (click)="bindWorkspace()"
                >
                  {{ (bindingWorkspace() ? 'XP.XProject.BindingWorkspace' : 'XP.XProject.BindWorkspace') | translate }}
                </button>
              </div>
            }
          </div>
          @if (workspace()) {
            <a
              z-button
              zType="outline"
              zSize="default"
              [href]="'/xpert/w/' + workspace()?.id"
              target="_blank"
              rel="noreferrer"
            >
              {{ 'XP.XProject.OpenWorkspace' | translate }}<i class="ri-external-link-line ml-1"></i>
            </a>
          }
        </div>
      </section>

      <section class="flex flex-col gap-4 border-t border-divider-subtle pt-6" aria-labelledby="assistant-config-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="assistant-config-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectAssistant' | translate }}
            </h3>
            <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.ProjectAssistantDescription' | translate }}</p>
          </div>
          <a
            z-button
            zType="ghost"
            zSize="default"
            [routerLink]="['/project', facade.project()?.id]"
            [queryParams]="{ chat: 'open' }"
            queryParamsHandling="merge"
            ><i class="ri-chat-3-line mr-1"></i>{{ 'XP.XProject.OpenAssistantPanel' | translate }}</a
          >
        </div>
        <z-card class="border border-divider-regular bg-components-card-bg shadow-none"
          ><z-card-content class="p-4"
            ><div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-3">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
                  ><i class="ri-sparkling-2-line"></i
                ></span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-text-primary">
                    {{ assistantName() || ('XP.XProject.ProjectAssistantDefault' | translate) }}
                  </p>
                  <p class="mt-1 truncate text-xs text-text-secondary">
                    {{ 'XP.XProject.ProjectAssistantRole' | translate }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <z-badge zType="secondary">{{
                      facade.project()?.copilotModel?.model || ('XP.XProject.ProjectDefaultModel' | translate)
                    }}</z-badge
                    ><z-badge zType="outline">{{ 'XP.XProject.DefaultXpert' | translate }}</z-badge>
                  </div>
                </div>
              </div>
              <a
                z-button
                zType="outline"
                zSize="default"
                [routerLink]="['/project', facade.project()?.id]"
                [queryParams]="{ chat: 'open' }"
                queryParamsHandling="merge"
                >{{ 'XP.XProject.ValidateInAssistant' | translate }}<i class="ri-arrow-right-up-line ml-1"></i
              ></a></div></z-card-content
        ></z-card>
        <div class="flex flex-col gap-3 py-1">
          <div class="min-w-0">
            <p class="text-sm font-medium text-text-primary">{{ 'XP.XProject.ProjectAssistantBinding' | translate }}</p>
            <p class="mt-1 text-xs text-text-secondary">
              {{ 'XP.XProject.ProjectAssistantBindingDescription' | translate }}
            </p>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <z-select
              class="min-w-0 flex-1"
              [zValue]="selectedXpertId()"
              [zDisabled]="xpertsLoading() || bindingXpert()"
              [zPlaceholder]="'XP.XProject.SelectXpert' | translate"
              (zSelectionChange)="selectXpert($event)"
            >
              @for (xpert of projectAssistants(); track xpert.id) {
                <z-select-item [zValue]="xpert.id"
                  >{{ xpert.name }}<span class="ml-2 text-xs text-text-tertiary">{{ xpert.slug }}</span></z-select-item
                >
              }</z-select
            ><button
              z-button
              zType="outline"
              zSize="default"
              type="button"
              [disabled]="!selectedXpertId() || bindingXpert()"
              (click)="bindSelectedXpert()"
            >
              {{ (bindingXpert() ? 'XP.XProject.BindingXpert' : 'XP.XProject.BindXpert') | translate }}
            </button>
          </div>
          @if (xpertsLoading()) {
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.LoadingXperts' | translate }}</p>
          }
          @if (!xpertsLoading() && !availableXperts().length) {
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.NoAvailableXperts' | translate }}</p>
          }
        </div>
      </section>

      <section class="flex flex-col gap-4 border-t border-divider-subtle pt-6" aria-labelledby="experts-config-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="experts-config-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectExperts' | translate }}
            </h3>
            <p class="mt-1 text-sm text-text-secondary">
              {{ 'XP.XProject.ProjectExpertsDescription' | translate }}
            </p>
          </div>
          <button z-button zType="outline" zSize="default" type="button" (click)="openProjectExperts()">
            <i class="ri-team-line mr-1"></i>{{ 'XP.XProject.ManageExperts' | translate }}
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          @for (assistant of facade.project()?.xperts || []; track assistant.id) {
            <span
              class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-divider-subtle px-3 py-1.5 text-xs text-text-secondary"
            >
              <i class="ri-user-star-line text-text-tertiary"></i>
              <span class="max-w-48 truncate">{{ assistant.title || assistant.name }}</span>
              @if (
                assistant.id === (facade.project()?.settings?.projectAssistantId || facade.project()?.xperts?.[0]?.id)
              ) {
                <z-badge zType="secondary">{{ 'XP.XProject.DefaultXpert' | translate }}</z-badge>
              }
            </span>
          } @empty {
            <p class="text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectExperts' | translate }}</p>
          }
        </div>
      </section>

      <section class="flex flex-col gap-4 border-t border-divider-subtle pt-6" aria-labelledby="instruction-title">
        <div>
          <h3 id="instruction-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.ProjectInstructions' | translate }}
          </h3>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.ProjectInstructionDescription' | translate }}</p>
        </div>
        <z-form-field class="w-full"
          ><z-form-label>{{ 'XP.XProject.SystemGuidance' | translate }}</z-form-label
          ><textarea
            z-input
            class="min-h-36 resize-y"
            [value]="instruction()"
            (input)="instruction.set($any($event.target).value)"
            [placeholder]="'XP.XProject.GuidancePlaceholder' | translate"
          ></textarea>
        </z-form-field>
        <div>
          <button
            z-button
            zType="default"
            zSize="default"
            type="button"
            [disabled]="saving()"
            (click)="saveInstructions()"
          >
            {{ (saving() ? 'XP.XProject.Saving' : 'XP.XProject.SaveInstructions') | translate }}
          </button>
        </div>
      </section>

      <section class="flex flex-col gap-4 border-t border-divider-subtle pt-6" aria-labelledby="resources-title">
        <div>
          <h3 id="resources-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.DefaultResources' | translate }}
          </h3>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.DefaultResourcesDescription' | translate }}</p>
        </div>
        <div class="divide-y divide-divider-subtle">
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-sparkling-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.XpertsLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.xperts?.length || 0 }}</z-badge>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-tools-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.ToolsetsLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.toolsets?.length || 0 }}</z-badge>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-book-2-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.KnowledgeBasesLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.knowledges?.length || 0 }}</z-badge>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="flex min-w-0 items-center gap-3">
              <i class="ri-team-line text-text-tertiary"></i
              ><span class="text-sm text-text-secondary">{{ 'XP.XProject.MembersLabel' | translate }}</span>
            </div>
            <z-badge zType="outline">{{ facade.project()?.members?.length || 0 }}</z-badge>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-4 border-t border-divider-subtle pt-6" aria-labelledby="override-title">
        <div>
          <h3 id="override-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.SessionOverridePolicy' | translate }}
          </h3>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.SessionOverrideDescription' | translate }}</p>
        </div>
        <div class="divide-y divide-divider-subtle">
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-text-primary">
                {{ 'XP.XProject.AllowAssistantSuggestions' | translate }}
              </p>
              <p class="mt-1 text-xs text-text-tertiary">
                {{ 'XP.XProject.AllowAssistantSuggestionsDesc' | translate }}
              </p>
            </div>
            <z-switch [ngModel]="allowSuggestions()" (ngModelChange)="allowSuggestions.set($event)"></z-switch>
          </div>
          <div class="flex items-center justify-between gap-4 py-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-text-primary">
                {{ 'XP.XProject.AutoReferenceProjectAssets' | translate }}
              </p>
              <p class="mt-1 text-xs text-text-tertiary">
                {{ 'XP.XProject.AutoReferenceProjectAssetsDesc' | translate }}
              </p>
            </div>
            <z-switch [ngModel]="autoReferenceAssets()" (ngModelChange)="autoReferenceAssets.set($event)"></z-switch>
          </div>
        </div>
      </section>

      <section class="space-y-4 border-t border-divider-subtle pt-6" aria-labelledby="connectors-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="connectors-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectConnectors' | translate }}
            </h3>
            <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.ProjectConnectorsDescription' | translate }}</p>
          </div>
          <button z-button zType="outline" type="button" (click)="openConnectors()">
            <i class="ri-plug-line mr-1"></i>{{ 'XP.XProject.ManageProjectConnectors' | translate }}
          </button>
        </div>
      </section>

      <section class="space-y-4 border-t border-divider-subtle pt-6" aria-labelledby="automations-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="automations-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectAutomations' | translate }}
            </h3>
            <p class="mt-1 text-sm text-text-secondary">
              {{ 'XP.XProject.ProjectAutomationsDescription' | translate }}
            </p>
          </div>
          @if (canManage()) {
            <button
              z-button
              zType="outline"
              type="button"
              [disabled]="!facade.project()?.xperts?.length"
              (click)="openTask()"
            >
              <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddAutomation' | translate }}
            </button>
          }
        </div>
        <div class="divide-y divide-divider-subtle rounded-xl border border-divider-subtle">
          @for (task of facade.scheduledTasks(); track task.id) {
            <div class="space-y-3 p-3">
              <div class="flex items-center justify-between gap-3">
                <button
                  class="min-w-0 text-left"
                  type="button"
                  [disabled]="!canOpenTask(task)"
                  (click)="openTask(task)"
                >
                  <p class="truncate text-sm font-medium text-text-primary">{{ task.name || task.prompt }}</p>
                  <p class="truncate text-xs text-text-tertiary">
                    {{ task.scheduleDescription || task.options?.frequency }}
                  </p>
                  <p class="mt-1 truncate text-xs text-text-secondary">
                    {{ 'XP.XProject.AutomationRunAs' | translate }}:
                    {{ taskRunAsLabel(task) || ('XP.XProject.UnknownProjectMember' | translate) }}
                  </p>
                </button>
                <div class="flex items-center gap-2">
                  <z-badge [zType]="task.status === scheduledStatus ? 'default' : 'secondary'">{{
                    task.status
                  }}</z-badge>
                  @if (canManage()) {
                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      [disabled]="taskMutationId() === task.id"
                      (click)="toggleTask(task)"
                    >
                      <i [class]="task.status === scheduledStatus ? 'ri-pause-line' : 'ri-play-line'"></i>
                    </button>
                  }
                </div>
              </div>

              @if (task.pendingRunAsUserId) {
                <div
                  class="flex flex-col gap-2 rounded-lg border border-divider-subtle bg-background-default-subtle p-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p class="text-xs text-text-secondary">
                    {{ 'XP.XProject.AutomationRunAsPending' | translate }}:
                    {{ projectMemberLabel(task.pendingRunAsUserId) || task.pendingRunAsUserId }}
                  </p>
                  @if (canAcceptTaskRunAs(task)) {
                    <button
                      z-button
                      zType="default"
                      zSize="sm"
                      type="button"
                      [disabled]="runAsMutationId() === task.id"
                      (click)="acceptTaskRunAs(task)"
                    >
                      {{ 'XP.XProject.AcceptAutomationRunAs' | translate }}
                    </button>
                  }
                </div>
              }

              @if (canProposeTaskRunAs(task) && runAsTargetMembers(task).length) {
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <z-select
                    class="min-w-0 flex-1"
                    [zValue]="runAsProposalTarget(task)"
                    [zDisabled]="runAsMutationId() === task.id"
                    [zPlaceholder]="'XP.XProject.SelectAutomationRunAs' | translate"
                    (zSelectionChange)="selectRunAsTarget(task.id, $event)"
                  >
                    @for (member of runAsTargetMembers(task); track member.id) {
                      <z-select-item [zValue]="member.id">{{ projectMemberLabel(member.id) }}</z-select-item>
                    }
                  </z-select>
                  <button
                    z-button
                    zType="outline"
                    zSize="sm"
                    type="button"
                    [disabled]="runAsMutationId() === task.id || !runAsProposalTarget(task)"
                    (click)="proposeTaskRunAs(task)"
                  >
                    {{ 'XP.XProject.ProposeAutomationRunAs' | translate }}
                  </button>
                </div>
              }
            </div>
          } @empty {
            <p class="p-5 text-center text-sm text-text-tertiary">{{ 'XP.XProject.NoAutomations' | translate }}</p>
          }
        </div>
      </section>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectConfigComponent {
  readonly facade = inject(XpertProjectFacade)
  readonly workspace = signal<IXpertWorkspace | null>(null)
  readonly availableWorkspaces = signal<IXpertWorkspace[]>([])
  readonly workspaceSelection = signal('')
  readonly workspacesLoading = signal(false)
  readonly bindingWorkspace = signal(false)
  readonly instruction = signal('')
  readonly saving = signal(false)
  readonly allowSuggestions = signal(true)
  readonly autoReferenceAssets = signal(true)
  readonly availableXperts = signal<IXpert[]>([])
  readonly projectAssistants = computed(() => {
    const assistants = this.availableXperts()
    const marked = assistants.filter((xpert) => isProjectAssistant(xpert))
    if (!marked.length) return assistants

    // Keep the current binding visible while it is being migrated to the tag.
    const selectedId = this.facade.project()?.settings?.projectAssistantId
    const selected = selectedId ? assistants.find((xpert) => xpert.id === selectedId) : null
    return selected && !marked.some((xpert) => xpert.id === selected.id) ? [selected, ...marked] : marked
  })
  readonly selectedXpertId = signal('')
  readonly xpertsLoading = signal(false)
  readonly bindingXpert = signal(false)
  readonly projectMembers = signal<TXpertProjectMemberSummary[]>([])
  readonly taskMutationId = signal<string | null>(null)
  readonly runAsMutationId = signal<string | null>(null)
  readonly runAsProposalTargets = signal<Record<string, string>>({})
  readonly scheduledStatus = ScheduleTaskStatus.SCHEDULED
  readonly canManage = computed(() => this.facade.projectAccess()?.capabilities.canManage ?? false)
  readonly #xpertService = inject(XpertAPIService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly #api = inject(XpertProjectApiService)
  readonly #dialog = inject(ZardDialogService)
  readonly #taskDialog = inject(XpertTaskDialogService)
  readonly #taskService = inject(XpertTaskService)
  readonly #store = inject(Store)
  readonly #toastr = inject(ToastrService)
  #loadedWorkspaceId: string | null = null
  #loadedMembersProjectId: string | null = null

  constructor() {
    effect(
      () => {
        const value = this.facade.project()?.settings?.instruction
        if (value !== undefined && !this.saving()) this.instruction.set(value)
        const project = this.facade.project()
        if (!project) return
        if (project.id !== this.#loadedMembersProjectId) {
          this.#loadedMembersProjectId = project.id
          void this.loadProjectMembers(project.id)
        }
        const xpertId = project.settings?.projectAssistantId ?? project.xperts?.[0]?.id ?? ''
        if (!this.bindingXpert()) this.selectedXpertId.set(xpertId)
        const workspaceId = project.workspaceId ?? ''
        if (workspaceId !== this.#loadedWorkspaceId) {
          this.#loadedWorkspaceId = workspaceId
          this.workspaceSelection.set(workspaceId)
          void this.loadWorkspace(workspaceId)
          void this.loadXperts(workspaceId)
          if (!workspaceId) void this.loadAuthoringWorkspaces()
        }
      },
      { allowSignalWrites: true }
    )
  }

  async loadWorkspace(workspaceId: string) {
    if (!workspaceId) {
      this.workspace.set(null)
      return
    }
    try {
      this.workspace.set(await firstValueFrom(this.#workspaceService.getById(workspaceId)))
    } catch {
      this.workspace.set(null)
    }
  }

  async loadProjectMembers(projectId: string) {
    try {
      const members = await firstValueFrom(this.#api.members(projectId))
      if (projectId === this.facade.project()?.id) this.projectMembers.set(members)
    } catch {
      if (projectId === this.facade.project()?.id) this.projectMembers.set([])
    }
  }

  async loadAuthoringWorkspaces() {
    this.workspacesLoading.set(true)
    try {
      const response = await firstValueFrom(this.#workspaceService.getAllMy(undefined, { purpose: 'authoring' }))
      this.availableWorkspaces.set(response.items ?? [])
    } catch {
      this.availableWorkspaces.set([])
    } finally {
      this.workspacesLoading.set(false)
    }
  }

  selectWorkspace(value: string | number | Array<string | number>) {
    const selected = Array.isArray(value) ? value[0] : value
    this.workspaceSelection.set(selected == null ? '' : String(selected))
  }

  async bindWorkspace() {
    const workspaceId = this.workspaceSelection()
    if (!workspaceId) return
    this.bindingWorkspace.set(true)
    try {
      await this.facade.bindWorkspace(workspaceId)
    } finally {
      this.bindingWorkspace.set(false)
    }
  }

  async loadXperts(workspaceId: string) {
    this.xpertsLoading.set(true)
    try {
      if (!workspaceId) {
        this.availableXperts.set([])
        return
      }
      const response = await firstValueFrom(
        this.#xpertService.getAllByWorkspace(workspaceId, { where: { latest: true }, take: 100 })
      )
      this.availableXperts.set(response.items ?? [])
    } finally {
      this.xpertsLoading.set(false)
    }
  }

  assistantName() {
    const project = this.facade.project()
    const assistantId = project?.settings?.projectAssistantId
    return project?.xperts?.find((xpert) => xpert.id === assistantId)?.name ?? project?.xperts?.[0]?.name ?? ''
  }

  selectXpert(value: string | number | Array<string | number>) {
    const selected = Array.isArray(value) ? value[0] : value
    this.selectedXpertId.set(selected == null ? '' : String(selected))
  }

  async bindSelectedXpert() {
    const xpertId = this.selectedXpertId()
    if (!xpertId) return
    this.bindingXpert.set(true)
    try {
      await this.facade.bindXpert(xpertId)
    } finally {
      this.bindingXpert.set(false)
    }
  }

  async openProjectExperts() {
    const project = this.facade.project()
    if (!project) return
    await firstValueFrom(
      this.#dialog.open(XpertProjectAssistantsDialogComponent, {
        data: {
          project,
          workspaceXperts: this.availableXperts()
        },
        width: 'min(94vw, 680px)',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        backdropClass: 'backdrop-blur-sm-black',
        panelClass: 'xp-overlay-pane-card'
      }).closed
    )
    await this.facade.loadProject(project.id)
  }

  async openConnectors() {
    const projectId = this.facade.project()?.id
    if (!projectId) return
    await firstValueFrom(
      this.#dialog.open(XpertProjectConnectorsDialogComponent, {
        data: { projectId, canManage: this.canManage() },
        width: 'min(96vw, 840px)',
        maxWidth: 'calc(100vw - 24px)',
        disableClose: true,
        backdropClass: 'backdrop-blur-sm-black',
        panelClass: 'xp-overlay-pane-card'
      }).closed
    )
  }

  async saveInstructions() {
    this.saving.set(true)
    try {
      await this.facade.updateProject({
        settings: { ...(this.facade.project()?.settings ?? {}), instruction: this.instruction() }
      })
    } finally {
      this.saving.set(false)
    }
  }

  async openTask(task?: IXpertTask) {
    const project = this.facade.project()
    if (!project || (task ? !this.canOpenTask(task) : !this.canManage())) return
    const connectorOnly = !!task && !this.canManage()
    const result = await firstValueFrom(
      this.#taskDialog.openCreateTask({
        task,
        projectId: project.id,
        availableXperts: project.xperts ?? [],
        connectorOnly
      }).closed
    )
    if (result) await this.facade.reloadScheduledTasks(project.id)
  }

  async toggleTask(task: IXpertTask) {
    if (!task.id || !this.canManage()) return
    this.taskMutationId.set(task.id)
    try {
      if (task.status === this.scheduledStatus) {
        await firstValueFrom(this.#taskService.pause(task.id))
      } else {
        await firstValueFrom(this.#taskService.schedule(task.id))
      }
      const projectId = this.facade.project()?.id
      if (projectId) await this.facade.reloadScheduledTasks(projectId)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.taskMutationId.set(null)
    }
  }

  taskRunAsUserId(task: IXpertTask) {
    return task.runAsUserId?.trim() || task.createdById?.trim() || ''
  }

  canOpenTask(task: IXpertTask) {
    return this.canManage() || this.taskRunAsUserId(task) === this.#store.userId
  }

  taskRunAsLabel(task: IXpertTask) {
    const userId = this.taskRunAsUserId(task)
    const persistedUser = task.runAsUser
    return (
      this.projectMemberLabel(userId) ||
      persistedUser?.fullName ||
      [persistedUser?.firstName, persistedUser?.lastName].filter(Boolean).join(' ') ||
      persistedUser?.username ||
      persistedUser?.email ||
      userId
    )
  }

  projectMemberLabel(userId?: string | null) {
    const member = this.projectMembers().find((item) => item.id === userId)
    if (!member) return ''
    return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.username || member.email || member.id
  }

  memberRoleKey(role: TXpertProjectMemberSummary['projectRole']) {
    const suffix = role.charAt(0).toUpperCase() + role.slice(1)
    return `XP.XProject.Role${suffix}`
  }

  runAsTargetMembers(task: IXpertTask) {
    const currentRunAsUserId = this.taskRunAsUserId(task)
    return this.projectMembers().filter((member) => member.id !== currentRunAsUserId)
  }

  canProposeTaskRunAs(task: IXpertTask) {
    const currentUserId = this.#store.userId
    return !!task.id && !!currentUserId && (this.canManage() || this.taskRunAsUserId(task) === currentUserId)
  }

  canAcceptTaskRunAs(task: IXpertTask) {
    return !!task.id && !!this.#store.userId && task.pendingRunAsUserId === this.#store.userId
  }

  selectRunAsTarget(taskId: string | undefined, value: string | number | Array<string | number>) {
    if (!taskId) return
    const selected = Array.isArray(value) ? value[0] : value
    this.runAsProposalTargets.update((targets) => ({
      ...targets,
      [taskId]: selected == null ? '' : String(selected)
    }))
  }

  runAsProposalTarget(task: IXpertTask) {
    return task.id ? (this.runAsProposalTargets()[task.id] ?? '') : ''
  }

  async proposeTaskRunAs(task: IXpertTask) {
    const taskId = task.id
    const projectId = this.facade.project()?.id
    const targetUserId = this.runAsProposalTarget(task)
    if (
      !taskId ||
      !projectId ||
      !this.canProposeTaskRunAs(task) ||
      !this.runAsTargetMembers(task).some((member) => member.id === targetUserId)
    ) {
      return
    }

    this.runAsMutationId.set(taskId)
    try {
      await firstValueFrom(this.#taskService.proposeRunAs(taskId, targetUserId))
      this.runAsProposalTargets.update((targets) => ({ ...targets, [taskId]: '' }))
      this.#toastr.success('XP.XProject.AutomationRunAsProposalSent')
      await this.facade.reloadScheduledTasks(projectId)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.runAsMutationId.set(null)
    }
  }

  async acceptTaskRunAs(task: IXpertTask) {
    const taskId = task.id
    const projectId = this.facade.project()?.id
    if (!taskId || !projectId || !this.canAcceptTaskRunAs(task)) return

    this.runAsMutationId.set(taskId)
    try {
      await firstValueFrom(this.#taskService.acceptRunAs(taskId))
      this.#toastr.success('XP.XProject.AutomationRunAsAccepted')
      await this.facade.reloadScheduledTasks(projectId)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.runAsMutationId.set(null)
    }
  }
}
