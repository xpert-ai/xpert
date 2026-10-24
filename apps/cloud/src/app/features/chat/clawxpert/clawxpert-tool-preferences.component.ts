import { CommonModule } from '@angular/common'
import { Component, computed, inject, Input, signal } from '@angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectConfirmDelete, XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSwitchComponent,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { forkJoin, of } from 'rxjs'
import { catchError, map, startWith, switchMap, take } from 'rxjs/operators'
import {
  getEnabledTools,
  getErrorMessage,
  getToolLabel,
  I18nObject,
  ISkillPackage,
  ISkillRepositoryIndex,
  isMiddlewareToolEnabled,
  IWFNMiddleware,
  SkillPackageService,
  ToastrService,
  TAgentMiddlewareDescriptor,
  TAgentMiddlewareMeta,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentService,
  XpertToolsetService
} from '../../../@core'
import { XpertSkillInstallDialogComponent, XpertSkillInstallDialogResult } from '../../../@shared/skills'
import { XpertSkillUploadDialogComponent } from '../../xpert/workspace/skills/skill-upload-dialog.component'
import {
  ClawXpertFacade,
  ClawXpertToolPreferenceSourceMetadata,
  ClawXpertToolPreferenceSourceType
} from './clawxpert.facade'

type ToolPreferenceTab = 'skills' | 'tools'

type ToolPreferenceItem = {
  id: string
  sourceType: ClawXpertToolPreferenceSourceType
  nodeKey: string
  toolName: string
  label: string | I18nObject
  description?: string | null
  sourceLabel: string | I18nObject
  metadata: ClawXpertToolPreferenceSourceMetadata
}

type SkillPreferenceItem = {
  id: string
  packageId: string
  workspaceId: string
  skillId: string
  label: string | I18nObject
  summary?: string | I18nObject | null
  repositoryName?: string | null
  provider?: string | null
  skillPackage: ISkillPackage
}

type ToolPreferenceSourceError = {
  id: string
  sourceLabel: string | I18nObject
  message: string
}

type ToolPreferenceState = {
  loading: boolean
  tools: ToolPreferenceItem[]
  errors: ToolPreferenceSourceError[]
}

type SkillPreferenceState = {
  loading: boolean
  skills: SkillPreferenceItem[]
  errorMessage: string | null
}

const EMPTY_TOOL_PREFERENCE_STATE: ToolPreferenceState = {
  loading: false,
  tools: [],
  errors: []
}

const EMPTY_SKILL_PREFERENCE_STATE: SkillPreferenceState = {
  loading: false,
  skills: [],
  errorMessage: null
}

@Component({
  standalone: true,
  selector: 'xp-clawxpert-tool-preferences',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardCardImports,
    ...ZardTabsImports
  ],
  templateUrl: './clawxpert-tool-preferences.component.html'
})
export class ClawXpertToolPreferencesComponent {
  /** Render only the ClawXpert skill preferences when embedded from the workspace menu. */
  readonly #skillsOnly = signal(false)

  @Input()
  set skillsOnly(value: boolean) {
    this.#skillsOnly.set(value)
  }

  get skillsOnly() {
    return this.#skillsOnly()
  }

  readonly facade = inject(ClawXpertFacade)
  readonly #uploadDialog = inject(Dialog, { optional: true })
  readonly #dialog = inject(Dialog)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly #xpertAgentService = inject(XpertAgentService)
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #toastr = inject(ToastrService)
  readonly #confirmDelete = injectConfirmDelete()
  readonly #translate = inject(TranslateService)

  readonly activeTab = signal<ToolPreferenceTab>('skills')
  readonly pendingPreferenceItems = signal<Record<string, boolean>>({})
  readonly installingSkillPackage = signal(false)
  readonly skillSearch = signal('')
  readonly bulkManaging = signal(false)
  readonly selectedSkillIds = signal<Set<string>>(new Set())
  readonly downloadingSkillIds = signal<Set<string>>(new Set())
  readonly uninstallingSkillIds = signal<Set<string>>(new Set())
  readonly bulkUninstalling = signal(false)
  readonly bulkUpdatingSkills = signal(false)
  readonly skillRefreshTick = signal(0)
  #skillPreferenceSaveQueue: Promise<void> = Promise.resolve()
  readonly middlewareProviders = toSignal(this.#xpertAgentService.agentMiddlewares$, {
    initialValue: [] as TAgentMiddlewareDescriptor[]
  })
  readonly toolState = toSignal(
    toObservable(
      computed(() => ({
        draft: this.facade.triggerDraft(),
        middlewareProviders: this.middlewareProviders(),
        ready: this.facade.viewState() === 'ready' && !!this.facade.xpertId()
      }))
    ).pipe(
      switchMap(({ draft, middlewareProviders, ready }) => {
        if (!ready || !draft) {
          return of(EMPTY_TOOL_PREFERENCE_STATE)
        }

        const middlewareMetaMap = new Map(middlewareProviders.map((item) => [item.meta.name, item.meta]))
        const requests = [
          ...collectToolsetNodes(draft).map((node) =>
            this.#toolsetService.getOneById(node.entity.id, { relations: ['tools'] }).pipe(
              take(1),
              map((toolset) => buildToolsetPreferenceState(node, toolset)),
              catchError((error) =>
                of(
                  buildSourceErrorState(
                    node.key,
                    node.entity.name || node.entity.id,
                    getErrorMessage(error) || 'Failed to load toolset tools.'
                  )
                )
              )
            )
          ),
          ...collectMiddlewareNodes(draft).map((node) => {
            const middleware = node.entity as IWFNMiddleware
            const meta = middlewareMetaMap.get(middleware.provider)
            return this.#xpertAgentService
              .getAgentMiddleware(middleware.provider, middleware.options, this.facade.xpertId())
              .pipe(
                take(1),
                map((response) => buildMiddlewarePreferenceState(node.key, middleware, meta, response.tools ?? [])),
                catchError((error) =>
                  of(
                    buildSourceErrorState(
                      node.key,
                      meta?.label ?? middleware.provider,
                      getErrorMessage(error) || 'Failed to load middleware tools.'
                    )
                  )
                )
              )
          })
        ]

        if (!requests.length) {
          return of(EMPTY_TOOL_PREFERENCE_STATE)
        }

        return forkJoin(requests).pipe(
          map((items) => ({
            loading: false,
            tools: items.flatMap((item) => item.tools),
            errors: items.flatMap((item) => item.errors)
          })),
          startWith({
            ...EMPTY_TOOL_PREFERENCE_STATE,
            loading: true
          })
        )
      })
    ),
    { initialValue: EMPTY_TOOL_PREFERENCE_STATE }
  )
  readonly skillWorkspaceId = computed(() => this.facade.currentWorkspaceId())
  readonly skillState = toSignal(
    toObservable(
      computed(() => ({
        ready: this.facade.viewState() === 'ready' && !!this.facade.xpertId(),
        workspaceId: this.skillWorkspaceId(),
        refreshTick: this.skillRefreshTick()
      }))
    ).pipe(
      switchMap(({ ready, workspaceId }) => {
        if (!ready || !workspaceId) {
          return of(EMPTY_SKILL_PREFERENCE_STATE)
        }

        return this.#skillPackageService
          .getAllByWorkspace(workspaceId, { relations: ['skillIndex', 'skillIndex.repository'] })
          .pipe(
            take(1),
            map(({ items }) => buildSkillPreferenceState(workspaceId, items ?? [])),
            catchError((error) =>
              of({
                ...EMPTY_SKILL_PREFERENCE_STATE,
                errorMessage: getErrorMessage(error) || 'Failed to load workspace skills.'
              })
            ),
            startWith({
              ...EMPTY_SKILL_PREFERENCE_STATE,
              loading: true
            })
          )
      })
    ),
    { initialValue: EMPTY_SKILL_PREFERENCE_STATE }
  )
  readonly toolItems = computed(() => this.toolState().tools)
  readonly toolErrors = computed(() => this.toolState().errors)
  readonly skillItems = computed(() => this.skillState().skills)
  readonly filteredSkillItems = computed(() => {
    const term = this.skillSearch().trim().toLowerCase()
    if (!term) {
      return this.skillItems()
    }

    return this.skillItems().filter((item) =>
      [item.label, item.summary, item.repositoryName, item.provider, item.skillId]
        .map((value) => searchableSkillText(value))
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })
  readonly busy = computed(() => {
    return (
      Object.keys(this.pendingPreferenceItems()).length > 0 ||
      this.installingSkillPackage() ||
      this.uninstallingSkillIds().size > 0 ||
      this.bulkUninstalling() ||
      this.bulkUpdatingSkills()
    )
  })
  readonly destructiveSkillBusy = computed(
    () => this.installingSkillPackage() || this.uninstallingSkillIds().size > 0 || this.bulkUninstalling()
  )
  readonly isBlocked = computed(() => this.facade.viewState() !== 'ready' || !this.facade.xpertId())
  readonly blockedState = computed(() => {
    if (this.skillsOnly) {
      if (!this.facade.organizationId()) {
        return {
          titleKey: 'XP.Chat.ClawXpert.SkillPreferenceOrganizationRequiredTitle',
          defaultTitle: 'Choose an organization first',
          descKey: 'XP.Chat.ClawXpert.SkillPreferenceOrganizationRequiredDesc',
          defaultDesc: 'Select an organization and finish the ClawXpert setup before managing skills.'
        }
      }

      if (!this.facade.resolvedPreference()) {
        return {
          titleKey: 'XP.Chat.ClawXpert.SkillPreferenceBindingRequiredTitle',
          defaultTitle: 'Bind ClawXpert before managing skills',
          descKey: 'XP.Chat.ClawXpert.SkillPreferenceBindingRequiredDesc',
          defaultDesc: 'Once the ClawXpert binding is ready, this page will load skills from its workspace.'
        }
      }

      return {
        titleKey: 'XP.Chat.ClawXpert.SkillPreferenceUnavailableTitle',
        defaultTitle: 'Skill preferences are temporarily unavailable',
        descKey: 'XP.Chat.ClawXpert.SkillPreferenceUnavailableDesc',
        defaultDesc: 'The ClawXpert shell must be ready before skills can be managed.'
      }
    }

    if (!this.facade.organizationId()) {
      return {
        titleKey: 'XP.Chat.ClawXpert.ToolPreferenceOrganizationRequiredTitle',
        defaultTitle: 'Choose an organization first',
        descKey: 'XP.Chat.ClawXpert.ToolPreferenceOrganizationRequiredDesc',
        defaultDesc: 'Select an organization and finish the ClawXpert setup before managing skills and tools.'
      }
    }

    if (!this.facade.resolvedPreference()) {
      return {
        titleKey: 'XP.Chat.ClawXpert.ToolPreferenceBindingRequiredTitle',
        defaultTitle: 'Bind ClawXpert before managing tools',
        descKey: 'XP.Chat.ClawXpert.ToolPreferenceBindingRequiredDesc',
        defaultDesc: 'Once a ClawXpert binding is ready, this panel will load tools from the bound xpert draft.'
      }
    }

    return {
      titleKey: 'XP.Chat.ClawXpert.ToolPreferenceUnavailableTitle',
      defaultTitle: 'Tool preferences are temporarily unavailable',
      descKey: 'XP.Chat.ClawXpert.ToolPreferenceUnavailableDesc',
      defaultDesc: 'The ClawXpert shell must be in the ready state before skills and tools can be managed.'
    }
  })

  selectTab(tab: ToolPreferenceTab) {
    this.activeTab.set(tab)
  }

  isSaving(id: string) {
    return !!this.pendingPreferenceItems()[id]
  }

  async toggleTool(item: ToolPreferenceItem, enabled: boolean) {
    if (this.busy()) {
      return
    }

    this.setPreferenceItemPending(item.id, true)
    try {
      await this.facade.setToolEnabled(item.sourceType, item.nodeKey, item.metadata, item.toolName, enabled)
    } finally {
      this.setPreferenceItemPending(item.id, false)
    }
  }

  async toggleSkill(item: SkillPreferenceItem, enabled: boolean) {
    if (this.isSaving(item.id) || this.destructiveSkillBusy()) {
      return
    }

    this.setPreferenceItemPending(item.id, true)
    try {
      await this.enqueueSkillPreferenceUpdate(item, enabled)
    } finally {
      this.setPreferenceItemPending(item.id, false)
    }
  }

  isSkillToggleDisabled(skillId: string) {
    return this.isSaving(skillId) || this.destructiveSkillBusy()
  }

  startBulkManagement() {
    this.bulkManaging.set(true)
    this.clearSkillSelection()
  }

  cancelBulkManagement() {
    this.bulkManaging.set(false)
    this.clearSkillSelection()
  }

  toggleSkillSelection(skillId: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked
    this.selectedSkillIds.update((selected) => {
      const next = new Set(selected)
      if (checked) {
        next.add(skillId)
      } else {
        next.delete(skillId)
      }
      return next
    })
  }

  selectAllFilteredSkills() {
    this.selectedSkillIds.set(new Set(this.filteredSkillItems().map((item) => item.id)))
  }

  clearSkillSelection() {
    this.selectedSkillIds.set(new Set())
  }

  async setSelectedSkillsEnabled(enabled: boolean) {
    const selectedItems = this.skillItems().filter((item) => this.selectedSkillIds().has(item.id))
    if (!selectedItems.length || this.busy()) {
      return
    }

    this.bulkUpdatingSkills.set(true)
    selectedItems.forEach((item) => this.setPreferenceItemPending(item.id, true))

    try {
      let allSaved = true
      for (const item of selectedItems) {
        const saved = await this.enqueueSkillPreferenceUpdate(item, enabled)
        allSaved = saved && allSaved
      }

      if (allSaved) {
        this.#toastr.success(
          this.#translate.instant(
            enabled ? 'XP.Chat.ClawXpert.SelectedSkillsEnabled' : 'XP.Chat.ClawXpert.SelectedSkillsDisabled',
            {
              Default: enabled ? 'Selected skills enabled' : 'Selected skills disabled'
            }
          )
        )
      }
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('XP.Chat.ClawXpert.UpdateSelectedSkillsFailed', {
            Default: 'Failed to update the selected skills.'
          })
      )
    } finally {
      selectedItems.forEach((item) => this.setPreferenceItemPending(item.id, false))
      this.bulkUpdatingSkills.set(false)
    }
  }

  isDownloadingSkill(packageId: string) {
    return this.downloadingSkillIds().has(packageId)
  }

  downloadSkillPackage(item: SkillPreferenceItem) {
    if (this.isDownloadingSkill(item.packageId)) {
      return
    }

    this.setDownloadingSkill(item.packageId, true)
    this.#skillPackageService
      .downloadPackage(item.workspaceId, item.packageId)
      .pipe(take(1))
      .subscribe({
        next: (blob) => {
          this.setDownloadingSkill(item.packageId, false)
          triggerSkillPackageDownload(blob, `${toDownloadFileName(skillPackageName(item))}.zip`)
        },
        error: (error) => {
          this.setDownloadingSkill(item.packageId, false)
          this.#toastr.error(
            getErrorMessage(error) ||
              this.#translate.instant('XP.Chat.ClawXpert.DownloadSkillFailed', {
                Default: 'Failed to download the selected skill.'
              })
          )
        }
      })
  }

  uninstallSkill(item: SkillPreferenceItem) {
    if (this.busy()) {
      return
    }

    this.#confirmDelete(
      {
        title: this.#translate.instant('XP.Chat.ClawXpert.UninstallSkillTitle', {
          Default: 'Uninstall skill'
        }),
        value: searchableSkillText(item.label) || item.skillId,
        information: this.#translate.instant('XP.Chat.ClawXpert.UninstallSkillInfo', {
          Default: 'This skill will be removed from the current workspace. This action cannot be undone.'
        })
      },
      () => {
        this.setUninstallingSkill(item.packageId, true)
        return this.#skillPackageService.uninstallPackageInWorkspace(item.workspaceId, item.packageId)
      }
    ).subscribe({
      next: () => {
        this.setUninstallingSkill(item.packageId, false)
        this.removeSelectedSkill(item.id)
        this.#toastr.success(
          this.#translate.instant('XP.Chat.ClawXpert.SkillUninstalled', { Default: 'Skill uninstalled' })
        )
        this.refreshSkills()
      },
      error: (error) => {
        this.setUninstallingSkill(item.packageId, false)
        this.#toastr.error(
          getErrorMessage(error) ||
            this.#translate.instant('XP.Chat.ClawXpert.UninstallSkillFailed', {
              Default: 'Failed to uninstall the selected skill.'
            })
        )
      }
    })
  }

  uninstallSelectedSkills() {
    const selectedItems = this.skillItems().filter((item) => this.selectedSkillIds().has(item.id))
    if (!selectedItems.length || this.busy()) {
      return
    }

    this.#confirmDelete(
      {
        title: this.#translate.instant('XP.Chat.ClawXpert.UninstallSelectedSkillsTitle', {
          Default: 'Uninstall selected skills'
        }),
        value: this.#translate.instant('XP.Chat.ClawXpert.SelectedSkillsValue', {
          Default: `${selectedItems.length} skills`,
          count: selectedItems.length
        }),
        information: this.#translate.instant('XP.Chat.ClawXpert.UninstallSelectedSkillsInfo', {
          Default: 'The selected skills will be removed from the current workspace. This action cannot be undone.'
        })
      },
      () => {
        this.bulkUninstalling.set(true)
        return forkJoin(
          selectedItems.map((item) =>
            this.#skillPackageService.uninstallPackageInWorkspace(item.workspaceId, item.packageId)
          )
        )
      }
    ).subscribe({
      next: () => {
        this.bulkUninstalling.set(false)
        this.cancelBulkManagement()
        this.#toastr.success(
          this.#translate.instant('XP.Chat.ClawXpert.SelectedSkillsUninstalled', {
            Default: 'Selected skills uninstalled'
          })
        )
        this.refreshSkills()
      },
      error: (error) => {
        this.bulkUninstalling.set(false)
        this.#toastr.error(
          getErrorMessage(error) ||
            this.#translate.instant('XP.Chat.ClawXpert.UninstallSelectedSkillsFailed', {
              Default: 'Failed to uninstall the selected skills.'
            })
        )
      }
    })
  }

  private setDownloadingSkill(packageId: string, downloading: boolean) {
    this.downloadingSkillIds.update((items) => updateIdSet(items, packageId, downloading))
  }

  private setPreferenceItemPending(itemId: string, pending: boolean) {
    this.pendingPreferenceItems.update((items) => {
      const next = { ...items }
      if (pending) {
        next[itemId] = true
      } else {
        delete next[itemId]
      }
      return next
    })
  }

  private enqueueSkillPreferenceUpdate(item: SkillPreferenceItem, enabled: boolean) {
    const update = this.#skillPreferenceSaveQueue.then(() =>
      this.facade.setSkillEnabled(item.workspaceId, item.packageId, enabled)
    )
    this.#skillPreferenceSaveQueue = update.then(
      () => undefined,
      () => undefined
    )
    return update
  }

  private setUninstallingSkill(packageId: string, uninstalling: boolean) {
    this.uninstallingSkillIds.update((items) => updateIdSet(items, packageId, uninstalling))
  }

  private removeSelectedSkill(skillId: string) {
    this.selectedSkillIds.update((items) => updateIdSet(items, skillId, false))
  }

  openSkillInstallDialog() {
    if (!this.skillWorkspaceId() || this.installingSkillPackage()) {
      return
    }

    this.#dialog
      .open<XpertSkillInstallDialogResult>(XpertSkillInstallDialogComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        width: 'min(96vw, 72rem)',
        maxWidth: 'calc(100vw - 32px)',
        data: {
          workspaceId: this.skillWorkspaceId()
        }
      })
      .closed.pipe(take(1))
      .subscribe((result) => {
        if (result) {
          this.handleSkillInstallDialogResult(result)
        }
      })
  }

  openSkillUploadDialog() {
    const workspaceId = this.skillWorkspaceId()
    if (!workspaceId || this.busy() || !this.#uploadDialog) {
      return
    }

    this.#uploadDialog
      .open(XpertSkillUploadDialogComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 2rem)',
        data: { workspaceId }
      })
      .closed.pipe(take(1))
      .subscribe((result) => {
        if (result) {
          this.refreshSkills()
        }
      })
  }

  handleSkillInstallDialogResult(result: XpertSkillInstallDialogResult) {
    if (result.kind === 'repository-index') {
      this.installSkill(result.skillIndex)
      return
    }

    if (result.packages.length) {
      this.refreshSkills()
    }
  }

  installSkill(item: ISkillRepositoryIndex) {
    const workspaceId = this.skillWorkspaceId()
    if (!workspaceId || this.installingSkillPackage()) {
      return
    }

    this.installingSkillPackage.set(true)
    this.#skillPackageService
      .installPackage(workspaceId, item.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.installingSkillPackage.set(false)
          this.refreshSkills()
        },
        error: (error) => {
          this.installingSkillPackage.set(false)
          this.#toastr.error(getErrorMessage(error) || 'Failed to install the selected skill.')
        }
      })
  }

  refreshSkills() {
    this.skillRefreshTick.update((value) => value + 1)
  }
}

function collectToolsetNodes(draft: TXpertTeamDraft) {
  return (draft.nodes ?? []).filter(
    (node): node is TXpertTeamNode<'toolset'> => node.type === 'toolset' && !!node.entity?.id
  )
}

function collectMiddlewareNodes(draft: TXpertTeamDraft) {
  return (draft.nodes ?? []).filter(
    (node): node is TXpertTeamNode<'workflow'> =>
      node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
  )
}

function buildToolsetPreferenceState(
  node: TXpertTeamNode<'toolset'>,
  toolset: TXpertTeamNode<'toolset'>['entity']
): ToolPreferenceState {
  const tools =
    getEnabledTools(toolset)?.map((tool) => ({
      id: buildToolPreferenceId('toolset', node.key, tool.name),
      sourceType: 'toolset' as const,
      nodeKey: node.key,
      toolName: tool.name,
      label: getToolLabel(tool),
      description: tool.description,
      sourceLabel: toolset.name,
      metadata: {
        toolsetId: toolset.id,
        toolsetName: toolset.name
      } satisfies ClawXpertToolPreferenceSourceMetadata
    })) ?? []

  return {
    loading: false,
    tools,
    errors: []
  }
}

function buildMiddlewarePreferenceState(
  nodeKey: string,
  middleware: IWFNMiddleware,
  meta: TAgentMiddlewareMeta | undefined,
  tools: Array<{ name: string; description?: string }>
): ToolPreferenceState {
  return {
    loading: false,
    tools: tools
      .filter((tool) => isMiddlewareToolEnabled(middleware.tools?.[tool.name]))
      .map((tool) => ({
        id: buildToolPreferenceId('middleware', nodeKey, tool.name),
        sourceType: 'middleware' as const,
        nodeKey,
        toolName: tool.name,
        label: tool.name,
        description: tool.description,
        sourceLabel: meta?.label ?? middleware.provider,
        metadata: {
          provider: middleware.provider
        } satisfies ClawXpertToolPreferenceSourceMetadata
      })),
    errors: []
  }
}

function buildSourceErrorState(
  sourceId: string,
  sourceLabel: string | I18nObject,
  message: string
): ToolPreferenceState {
  return {
    loading: false,
    tools: [],
    errors: [
      {
        id: sourceId,
        sourceLabel,
        message
      }
    ]
  }
}

function buildToolPreferenceId(sourceType: ClawXpertToolPreferenceSourceType, nodeKey: string, toolName: string) {
  return `${sourceType}:${nodeKey}:${toolName}`
}

function buildSkillPreferenceState(workspaceId: string, skills: ISkillPackage[]): SkillPreferenceState {
  return {
    loading: false,
    skills: skills.map((skill) => ({
      id: buildSkillPreferenceId(workspaceId, skill.id),
      packageId: skill.id,
      workspaceId,
      skillId:
        skill.skillIndex?.skillId ?? skill.metadata?.name ?? (typeof skill.name === 'string' ? skill.name : skill.id),
      label:
        skill.metadata?.displayName ??
        normalizeI18nCandidate(skill.name) ??
        skill.metadata?.name ??
        skill.skillIndex?.name ??
        skill.skillIndex?.skillId ??
        skill.id,
      summary:
        skill.metadata?.summary ??
        skill.metadata?.description ??
        normalizeI18nCandidate(skill.metadata?.description) ??
        skill.skillIndex?.description ??
        null,
      repositoryName: skill.skillIndex?.repository?.name ?? null,
      provider: skill.skillIndex?.repository?.provider ?? null,
      skillPackage: skill
    })),
    errorMessage: null
  }
}

function buildSkillPreferenceId(workspaceId: string, skillId: string) {
  return `skill:${workspaceId}:${skillId}`
}

function normalizeI18nCandidate(value: unknown): string | I18nObject | null {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as I18nObject
  }

  return null
}

function searchableSkillText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value)
      .filter((item): item is string => typeof item === 'string')
      .join(' ')
  }
  return ''
}

function skillPackageName(item: SkillPreferenceItem): string {
  return (
    searchableSkillText(item.label) ||
    searchableSkillText(item.skillPackage.metadata?.name) ||
    searchableSkillText(item.skillPackage.name) ||
    item.skillId ||
    item.packageId
  )
}

function updateIdSet(items: Set<string>, id: string, present: boolean): Set<string> {
  const next = new Set(items)
  if (present) {
    next.add(id)
  } else {
    next.delete(id)
  }
  return next
}

function triggerSkillPackageDownload(blob: Blob, fileName: string) {
  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

function toDownloadFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'skill'
}
