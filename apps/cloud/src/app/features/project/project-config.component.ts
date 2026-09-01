import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { PermissionsEnum } from '@xpert-ai/contracts'
import type { IXpert, IXpertTask, TXpertProjectMemberSummary } from '@xpert-ai/contracts'
import type { TXpertProjectSkillSummary } from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogService,
  ZardFormImports,
  ZardInputDirective,
  ZardMenuImports,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { ScheduleTaskStatus, Store, ToastrService, XpertTaskService, getErrorMessage } from '../../@core'
import { XpertTaskDialogService } from '../../@shared/chat/task-dialog/task-dialog.service'
import { XpertSkillInstallDialogComponent, type XpertSkillInstallDialogResult } from '../../@shared/skills'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectAssistantsDialogComponent } from './project-assistants-dialog.component'
import { XpertProjectConnectorsDialogComponent } from './project-connectors-dialog.component'
import { XpertProjectMembersDialogComponent } from './project-members-dialog.component'
import { XpertProjectSkillsDialogComponent } from './project-skills-dialog.component'
import { XpertProjectFacade } from './project.facade'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { UserAvatarComponent } from '../../@shared/user/avatar/avatar.component'

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
    EmojiAvatarComponent,
    UserAvatarComponent,
    ...ZardFormImports,
    ...ZardMenuImports,
    ...ZardSelectImports
  ],
  template: `
    <section class="mx-auto flex w-full max-w-screen-xl flex-col gap-8 p-4 sm:p-6">
      <header class="flex flex-col gap-2 border-b border-divider-subtle pb-5">
        <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          {{ 'XP.XProject.Governance' | translate }}
        </p>
        <h2 class="text-xl font-semibold text-text-primary">{{ 'XP.XProject.ProjectConfiguration' | translate }}</h2>
      </header>

      <section class="space-y-4" aria-labelledby="project-experts-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 id="project-experts-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectExperts' | translate }}
            </h3>
          </div>
          @if (canManage()) {
            <button z-button zType="outline" type="button" (click)="openProjectExperts()">
              <i class="ri-team-line mr-1"></i>{{ 'XP.XProject.ManageExperts' | translate }}
            </button>
          }
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (xpert of facade.project()?.xperts ?? []; track xpert.id) {
            <div class="flex min-w-0 items-center gap-3 rounded-xl border border-divider-subtle p-3">
              <emoji-avatar
                [avatar]="xpert.avatar"
                [fallbackLabel]="xpert.title || xpert.name"
                small
                class="size-9 shrink-0 overflow-hidden rounded-lg"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-text-primary">{{ xpert.title || xpert.name }}</p>
                <p class="truncate text-xs text-text-tertiary">{{ xpert.slug }}</p>
              </div>
              <a
                z-button
                zType="ghost"
                zSize="sm"
                [routerLink]="['/project', facade.project()?.id]"
                [queryParams]="{ chat: 'open', xpert: xpert.id, threadId: null }"
                queryParamsHandling="merge"
                [attr.aria-label]="'XP.XProject.StartConversation' | translate"
                [title]="'XP.XProject.StartConversation' | translate"
              >
                <i class="ri-chat-3-line"></i>
              </a>
            </div>
          } @empty {
            <p class="text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectExperts' | translate }}</p>
          }
        </div>
      </section>

      <section class="space-y-4 border-t border-divider-subtle pt-6" aria-labelledby="members-title">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h3 id="members-title" class="text-base font-semibold text-text-primary">
                {{ 'XP.XProject.ProjectMembers' | translate }}
              </h3>
              <z-badge zType="outline">{{ memberCount() }}</z-badge>
            </div>
          </div>
          @if (canManage()) {
            <button z-button zType="outline" type="button" (click)="openMembers()">
              <i class="ri-user-add-line mr-1"></i>{{ 'XP.XProject.ManageMembers' | translate }}
            </button>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          @for (member of projectMembers(); track member.id) {
            <div
              class="flex max-w-full items-center gap-2 rounded-full border border-divider-subtle bg-components-card-bg py-1 pl-1 pr-3"
            >
              <xp-user-avatar [user]="member" class="size-7 rounded-full bg-background-default-subtle" />
              <span class="max-w-48 truncate text-sm text-text-primary">{{ projectMemberLabel(member.id) }}</span>
              <span class="text-xs text-text-tertiary">{{ memberRoleKey(member.projectRole) | translate }}</span>
            </div>
          } @empty {
            <p class="text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectMembers' | translate }}</p>
          }
        </div>
      </section>

      <section class="space-y-4 border-t border-divider-subtle pt-6" aria-labelledby="instruction-title">
        <div>
          <h3 id="instruction-title" class="text-base font-semibold text-text-primary">
            {{ 'XP.XProject.ProjectInstructions' | translate }}
          </h3>
        </div>
        <z-form-field class="w-full">
          <textarea
            z-input
            class="min-h-40 resize-y"
            [disabled]="!canEdit()"
            [ngModel]="instruction()"
            (ngModelChange)="instruction.set($event)"
            [attr.aria-label]="'XP.XProject.ProjectInstructions' | translate"
            [placeholder]="'XP.XProject.GuidancePlaceholder' | translate"
          ></textarea>
        </z-form-field>
        @if (canEdit()) {
          <button z-button zType="default" type="button" [disabled]="savingInstruction()" (click)="saveInstructions()">
            {{ (savingInstruction() ? 'XP.XProject.Saving' : 'XP.XProject.SaveInstructions') | translate }}
          </button>
        }
      </section>

      <section class="space-y-4 border-t border-divider-subtle pt-6" aria-labelledby="skills-title">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 id="skills-title" class="text-base font-semibold text-text-primary">
              {{ 'XP.XProject.ProjectSkills' | translate }}
            </h3>
          </div>
          <div class="flex items-center gap-2">
            <z-badge zType="outline">{{ facade.projectSkills().length }}</z-badge>
            @if (canEdit()) {
              <button
                z-button
                zType="outline"
                zSize="sm"
                type="button"
                z-menu
                [zMenuTriggerFor]="addSkillMenu"
                [disabled]="skillMutationInProgress()"
              >
                <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddProjectSkill' | translate }}
              </button>
            }
            <button z-button zType="outline" zSize="sm" type="button" (click)="openProjectSkills()">
              {{ 'XP.XProject.ManageProjectSkills' | translate }}
            </button>
          </div>
        </div>
        <input
          #skillPackageInput
          class="hidden"
          type="file"
          accept=".zip,application/zip"
          (change)="uploadSkillPackage($event)"
        />
        <ng-template #addSkillMenu>
          <div z-menu-content class="w-56">
            <button type="button" z-menu-item (click)="skillPackageInput.click()">
              <i class="ri-upload-2-line mr-2"></i>{{ 'XP.XProject.UploadProjectSkillPackage' | translate }}
            </button>
            <button type="button" z-menu-item (click)="installProjectSkillFromRepository()">
              <i class="ri-search-line mr-2"></i>{{ 'XP.XProject.InstallProjectSkillFromRepository' | translate }}
            </button>
          </div>
        </ng-template>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (skill of facade.projectSkills(); track skill.id) {
            <div class="flex min-w-0 items-start gap-3 rounded-xl border border-divider-subtle p-3">
              <i class="ri-sparkling-2-line mt-0.5 text-text-tertiary"></i>
              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-2">
                  <p class="truncate text-sm font-medium text-text-primary">{{ skill.name }}</p>
                  <z-badge zType="outline">{{ skillSourceKey(skill.source) | translate }}</z-badge>
                </div>
                @if (skill.description) {
                  <p class="mt-1 line-clamp-2 text-xs text-text-secondary">{{ skill.description }}</p>
                }
                <p class="mt-1 text-xs text-text-tertiary">
                  {{
                    (skill.enabled ? 'XP.XProject.ProjectSkillEnabled' : 'XP.XProject.ProjectSkillDisabled') | translate
                  }}
                </p>
              </div>
            </div>
          } @empty {
            <p class="col-span-full rounded-xl border border-divider-subtle p-5 text-center text-sm text-text-tertiary">
              {{ 'XP.XProject.NoProjectSkills' | translate }}
            </p>
          }
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
  readonly #api = inject(XpertProjectApiService)
  readonly #dialog = inject(ZardDialogService)
  readonly #taskDialog = inject(XpertTaskDialogService)
  readonly #taskService = inject(XpertTaskService)
  readonly #store = inject(Store)
  readonly #toastr = inject(ToastrService)
  readonly availableXperts = signal<IXpert[]>([])
  readonly projectMembers = signal<TXpertProjectMemberSummary[]>([])
  readonly memberCount = signal(0)
  readonly instruction = signal('')
  readonly savingInstruction = signal(false)
  readonly skillMutationInProgress = signal(false)
  readonly taskMutationId = signal<string | null>(null)
  readonly runAsMutationId = signal<string | null>(null)
  readonly runAsProposalTargets = signal<Record<string, string>>({})
  readonly scheduledStatus = ScheduleTaskStatus.SCHEDULED
  readonly canManage = computed(() => this.facade.projectAccess()?.capabilities.canManage ?? false)
  readonly canEdit = computed(() => this.facade.projectAccess()?.capabilities.canEdit ?? false)
  readonly #rolePermissions = toSignal(this.#store.userRolePermissions$, {
    initialValue: this.#store.userRolePermissions
  })
  readonly canInviteOrganizationMembers = computed(() => {
    this.#rolePermissions()
    return this.#store.hasPermission(PermissionsEnum.ORG_INVITE_EDIT)
  })
  #loadedProjectId: string | null = null

  constructor() {
    effect(() => {
      const project = this.facade.project()
      const content = this.facade.projectInstruction()
      if (!this.savingInstruction()) this.instruction.set(content)
      if (!project?.id || project.id === this.#loadedProjectId) return
      this.#loadedProjectId = project.id
      void this.loadConfiguration(project.id)
    })
  }

  async loadConfiguration(projectId: string) {
    const [xperts, members] = await Promise.allSettled([
      firstValueFrom(this.#api.availableXperts(projectId)),
      firstValueFrom(this.#api.members(projectId))
    ])
    if (projectId !== this.facade.project()?.id) return
    this.availableXperts.set(xperts.status === 'fulfilled' ? (xperts.value.items ?? []) : [])
    const projectMembers = members.status === 'fulfilled' ? members.value : []
    this.projectMembers.set(projectMembers)
    this.memberCount.set(projectMembers.length)
  }

  async openProjectExperts() {
    const project = this.facade.project()
    if (!project || !this.canManage()) return
    await firstValueFrom(
      this.#dialog.open(XpertProjectAssistantsDialogComponent, {
        data: { project, availableXperts: this.availableXperts() },
        width: 'min(94vw, 680px)',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        backdropClass: 'backdrop-blur-sm-black',
        panelClass: 'xp-overlay-pane-card'
      }).closed
    )
    await this.facade.loadProject(project.id)
    await this.loadConfiguration(project.id)
  }

  async openMembers() {
    const projectId = this.facade.project()?.id
    if (!projectId || !this.canManage()) return
    await firstValueFrom(
      this.#dialog.open(XpertProjectMembersDialogComponent, {
        data: {
          projectId,
          canTransferOwnership: this.facade.projectAccess()?.role === 'owner',
          canInviteOrganizationMembers: this.canInviteOrganizationMembers()
        },
        width: 'min(94vw, 760px)',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        backdropClass: 'backdrop-blur-sm-black',
        panelClass: 'xp-overlay-pane-card'
      }).closed
    )
    await this.facade.loadProject(projectId)
    await this.loadConfiguration(projectId)
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
    if (!this.canEdit()) return
    this.savingInstruction.set(true)
    try {
      await this.facade.saveProjectInstructions(this.instruction())
      this.#toastr.success('XP.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.savingInstruction.set(false)
    }
  }

  async installProjectSkillFromRepository() {
    const projectId = this.facade.project()?.id
    if (!projectId || !this.canEdit() || this.skillMutationInProgress()) return
    const result = await firstValueFrom(
      this.#dialog.open(XpertSkillInstallDialogComponent, {
        data: { scope: 'project' },
        width: 'min(96vw, 72rem)',
        maxWidth: '72rem',
        disableClose: true,
        backdropClass: 'backdrop-blur-sm-black',
        panelClass: 'xp-overlay-pane-card'
      }).closed
    )
    if (!result || result.kind !== 'repository-index') return
    await this.installProjectSkill(projectId, result)
  }

  async uploadSkillPackage(event: Event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const file = input.files?.[0]
    input.value = ''
    const projectId = this.facade.project()?.id
    if (!file || !projectId || !this.canEdit() || this.skillMutationInProgress()) return

    this.skillMutationInProgress.set(true)
    try {
      await firstValueFrom(this.#api.uploadSkills(projectId, file))
      await this.facade.reloadProjectContent(projectId)
      this.#toastr.success('XP.XProject.ProjectSkillPackageUploaded')
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.skillMutationInProgress.set(false)
    }
  }

  async openProjectSkills() {
    const projectId = this.facade.project()?.id
    if (!projectId) return
    const changed = await firstValueFrom(
      this.#dialog.open(XpertProjectSkillsDialogComponent, {
        data: { projectId, skills: this.facade.projectSkills(), canEdit: this.canEdit() },
        width: 'min(94vw, 760px)',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        backdropClass: 'backdrop-blur-sm-black',
        panelClass: 'xp-overlay-pane-card'
      }).closed
    )
    if (changed) await this.facade.reloadProjectContent(projectId)
  }

  skillSourceKey(source: TXpertProjectSkillSummary['source']) {
    switch (source) {
      case 'repository':
        return 'XP.XProject.ProjectSkillSourceRepository'
      case 'upload':
        return 'XP.XProject.ProjectSkillSourceUpload'
      default:
        return 'XP.XProject.ProjectSkillSourceLegacy'
    }
  }

  private async installProjectSkill(projectId: string, result: XpertSkillInstallDialogResult) {
    if (result.kind !== 'repository-index') return
    this.skillMutationInProgress.set(true)
    try {
      await firstValueFrom(this.#api.installSkill(projectId, result.skillIndex.id))
      await this.facade.reloadProjectContent(projectId)
      this.#toastr.success('XP.XProject.ProjectSkillInstalled')
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.skillMutationInProgress.set(false)
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
