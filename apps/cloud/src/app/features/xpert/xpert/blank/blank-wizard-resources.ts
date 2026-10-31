import { Directive } from '@angular/core'
import { PLUGIN_COMPONENT_TYPE, PLUGIN_RESOURCE_RUNTIME_TYPE } from '@cloud/app/@core/state'
import { DefaultModelRole } from '@xpert-ai/contracts'
import { type ZardStepperSelectionEvent } from '@xpert-ai/headless-ui'
import { XpertSkillInstallDialogComponent, XpertSkillInstallDialogResult } from 'apps/cloud/src/app/@shared/skills'
import { firstValueFrom, take } from 'rxjs'
import {
  getErrorMessage,
  ICopilotModel,
  ISkillRepositoryIndex,
  IWFNMiddleware,
  IXpertToolset,
  OrderTypeEnum,
  TXpertTeamDraft,
  WorkflowNodeTypeEnum,
  WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER,
  XpertToolsetCategoryEnum
} from '../../../../@core'
import {
  BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER,
  normalizeBlankMiddlewareRequiredSelections,
  normalizeBlankMiddlewareSelections
} from './blank-draft.util'
import { resolveTemplatePluginSkillInstallError } from './blank-plugin-resource-error.util'
import { BlankTemplateToolsetResolution } from './blank-template.util'
import {
  BlankAgentSkillSelections,
  BlankTemplatePluginSkillBinding,
  BlankTemplatePluginSkillDependencyGroup,
  BlankTemplateToolsetDependency,
  BlankTemplateToolsetSelectionState,
  cloneRepositoryDefaultSelection,
  compareToolsetsByUpdatedAtDesc,
  readNonEmptyString
} from './blank-wizard-data'
import { BlankWizardState } from './blank-wizard-state'
import { BlankXpertMode, isBlankWizardModeDisabled } from './blank-wizard.util'

@Directive()
export abstract class BlankWizardResources extends BlankWizardState {
  async openSkillInstallDialog() {
    if (!this.workspaceId() || this.installingSkillPackage()) {
      return
    }

    const skillIndex = await firstValueFrom(
      this._dialog
        .open<XpertSkillInstallDialogResult>(XpertSkillInstallDialogComponent, {
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          width: 'min(96vw, 72rem)',
          maxWidth: 'calc(100vw - 32px)',
          data: {
            workspaceId: this.workspaceId()
          }
        })
        .closed.pipe(take(1))
    )

    if (skillIndex) {
      await this.handleSkillInstallDialogResult(skillIndex)
    }
  }

  async handleSkillInstallDialogResult(result: XpertSkillInstallDialogResult) {
    if (result.kind === 'repository-index') {
      await this.installSkill(result.skillIndex)
      return
    }

    const packageIds = result.packages.map((item) => item.id).filter((id): id is string => !!id)
    if (packageIds.length) {
      this.selectedExplicitSkills.set(Array.from(new Set([...this.selectedExplicitSkills(), ...packageIds])))
      this.refreshAgentSkillMiddlewareSelections()
      this.refreshSkills()
    }
  }

  async installSkill(item: ISkillRepositoryIndex) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || this.installingSkillPackage()) {
      return
    }

    this.installingSkillPackage.set(true)

    try {
      const skillPackage = await firstValueFrom(
        this._skillPackageService.installPackage(workspaceId, item.id).pipe(take(1))
      )
      if (
        !this.usesWorkspaceSkillDefaults() &&
        item.repository?.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER &&
        item.repositoryId
      ) {
        const repositoryDefault = this.selectedRepositoryDefault()
        const disabledSkillIds =
          repositoryDefault?.repositoryId === item.repositoryId
            ? repositoryDefault.disabledSkillIds.filter((id) => id !== skillPackage.id)
            : []

        this.selectedRepositoryDefault.set({
          repositoryId: item.repositoryId,
          disabledSkillIds
        })
      } else {
        this.selectedExplicitSkills.set(Array.from(new Set([...this.selectedExplicitSkills(), skillPackage.id])))
      }
      this.refreshAgentSkillMiddlewareSelections()
      this.refreshSkills()
    } catch (error) {
      this._toastr.error(getErrorMessage(error) || 'Failed to install the selected skill.')
    } finally {
      this.installingSkillPackage.set(false)
    }
  }

  removeSkill(skillId: string) {
    this.toggleSkill(skillId, false)
  }

  refreshSkills() {
    this.skillRefreshTick.update((value) => value + 1)
  }

  isModeDisabled(mode: BlankXpertMode) {
    return isBlankWizardModeDisabled(mode, this.requestedType(), this.allowedModes)
  }

  applyAgentSkillSelections(selections: BlankAgentSkillSelections) {
    this.preserveSkillsMiddleware.set(selections.preserveSkillsMiddleware ?? false)
    this.selectedExplicitSkills.set(selections.skills)
    this.selectedRepositoryDefault.set(cloneRepositoryDefaultSelection(selections.repositoryDefault))
    const middlewares = normalizeBlankMiddlewareSelections(
      selections.middlewares,
      selections.skills,
      selections.repositoryDefault,
      selections.preserveSkillsMiddleware
    )
    this.selectedMiddlewares.set(middlewares)
    this.selectedMiddlewareRequired.set(
      normalizeBlankMiddlewareRequiredSelections(middlewares, selections.middlewareRequired)
    )
  }

  clearWorkspaceScopedAgentSelections() {
    this.initializedWorkspaceSkillDefaultWorkspaces.set(new Set())
    this.templatePluginSkillInstallError.set(null)
    // Installation runtime IDs are workspace-owned. Discard both the bindings
    // and their idempotency keys so switching back to a workspace refreshes
    // the IDs instead of reusing bindings resolved for another workspace.
    this.templatePluginSkillBindings.set([])
    this.preparedTemplatePluginSkillDependencies.set(new Map())
    this.clearTemplateToolsetSelections()
    this.applyAgentSkillSelections({
      skills: [],
      repositoryDefault: null,
      middlewares: this.selectedMiddlewares(),
      middlewareRequired: this.selectedMiddlewareRequired(),
      preserveSkillsMiddleware: this.preserveSkillsMiddleware()
    })
  }

  async onAgentStepChange(event: ZardStepperSelectionEvent) {
    if (event.selectedIndex === this.agentModelProviderStepIndex()) {
      await this.prepareClawModelProviderStep()
      return
    }

    if (event.selectedIndex === this.agentSkillStepIndex()) {
      await this.prepareAgentSkillStep()
      return
    }

    if (event.selectedIndex === this.agentToolsetStepIndex()) {
      await this.prepareTemplateToolsetStep()
    }
  }

  async prepareClawModelProviderStep() {
    if (
      !this.needsModelProviderSetup() ||
      !this.canConfigureModelProvider() ||
      this.enablingPrimaryCopilot() ||
      this.primaryCopilot()?.enabled
    ) {
      return
    }

    this.enablingPrimaryCopilot.set(true)
    try {
      await firstValueFrom(this._copilotServer.prepareDefaultModelSetup(DefaultModelRole.Primary))
      this._copilotServer.refresh()
    } catch (error) {
      this._toastr.error(getErrorMessage(error))
    } finally {
      this.enablingPrimaryCopilot.set(false)
    }
  }

  hasSelectedClawModelProviderModel() {
    const model = this.copilotModel()
    return !!model?.copilotId && !!model?.model
  }

  applyClawModelProviderFormModel() {
    const model = this.clawCopilotForm()?.formGroup.value.copilotModel as ICopilotModel | null | undefined
    if (model?.copilotId && model.model) {
      this.copilotModel.set(model)
    }
  }

  async prepareAgentSkillStep() {
    const workspaceId = this.workspaceId()
    if (!workspaceId || this.installingSkillPackage()) {
      return
    }

    // Template-declared packages define its defaults; do not also select the
    // workspace's unrelated shared skills or repository-wide defaults.
    if (this.templatePluginSkillDependencyGroups().length) {
      await this.prepareTemplatePluginSkillsForCurrentWorkspace()
      return
    }

    if (this.preparedSkillWorkspaces().has(workspaceId)) {
      if (this.usesWorkspaceSkillDefaults()) {
        this.applyWorkspaceSkillDefaults(workspaceId, this.getWorkspaceSkillIds())
        await this.prepareTemplatePluginSkillsForCurrentWorkspace()
        return
      }

      if (!this.selectedRepositoryDefault()?.repositoryId) {
        const repositoryId = await this.getWorkspacePublicRepositoryId()
        if (repositoryId) {
          this.selectedRepositoryDefault.set({
            repositoryId,
            disabledSkillIds: []
          })
          this.refreshAgentSkillMiddlewareSelections()
        }
      }
      await this.prepareTemplatePluginSkillsForCurrentWorkspace()
      return
    }

    this.installingSkillPackage.set(true)
    try {
      const repositoryId = await this.getWorkspacePublicRepositoryId()
      let installedSkillIds: string[] = []
      if (repositoryId) {
        const installedSkillPackages = await firstValueFrom(
          this._skillPackageService.installRepositoryPackages(workspaceId, repositoryId).pipe(take(1))
        )
        installedSkillIds = installedSkillPackages
          .map((item) => (typeof item?.id === 'string' ? item.id.trim() : ''))
          .filter((id) => !!id)

        if (this.usesWorkspaceSkillDefaults()) {
          this.selectedRepositoryDefault.set(null)
        } else if (!this.selectedRepositoryDefault()?.repositoryId) {
          this.selectedRepositoryDefault.set({
            repositoryId,
            disabledSkillIds: []
          })
        }
      }

      this.preparedSkillWorkspaces.update((value) => new Set([...value, workspaceId]))
      this.applyWorkspaceSkillDefaults(workspaceId, [...this.getWorkspaceSkillIds(), ...installedSkillIds])
      this.refreshAgentSkillMiddlewareSelections()
      this.refreshSkills()
    } catch (error) {
      this._toastr.error(getErrorMessage(error) || 'Failed to load default workspace skills.')
    } finally {
      this.installingSkillPackage.set(false)
    }

    await this.prepareTemplatePluginSkillsForCurrentWorkspace()
  }

  async prepareTemplatePluginSkillsForCurrentWorkspace() {
    const workspaceId = this.workspaceId()
    if (!workspaceId) {
      return !this.templatePluginSkillDependencyGroups().length
    }

    return this.prepareTemplatePluginSkills(workspaceId)
  }

  async prepareTemplatePluginSkills(workspaceId: string): Promise<boolean> {
    const groups = this.templatePluginSkillDependencyGroups()
    if (!groups.length) {
      this.templatePluginSkillInstallError.set(null)
      this.templatePluginSkillBindings.set([])
      return true
    }

    const dependencyKey = this.templatePluginSkillDependencyInstallKey(workspaceId, groups)
    const isCurrentSelection = () =>
      this.workspaceId() === workspaceId &&
      this.templatePluginSkillDependencyInstallKey(workspaceId, this.templatePluginSkillDependencyGroups()) ===
        dependencyKey
    const prepared = this.preparedTemplatePluginSkillDependencies().get(dependencyKey)
    if (prepared) {
      this.restoreTemplatePluginSkillBindings(prepared)
      this.templatePluginSkillInstallError.set(null)
      return true
    }

    if (this.installingSkillPackage()) {
      return false
    }

    this.installingSkillPackage.set(true)
    this.templatePluginSkillInstallError.set(null)

    try {
      const skillBindings: BlankTemplatePluginSkillBinding[] = []
      for (const group of groups) {
        const result = await firstValueFrom(
          this._pluginAPI
            .installResourcesToWorkspace(group.pluginName, {
              workspaceId,
              components: group.components
            })
            .pipe(take(1))
        )

        // Do not bind a completed request into a different template or workspace.
        if (!isCurrentSelection()) {
          return false
        }
        const skillInstallations = result.installations.filter(
          (installation) =>
            installation.componentType === PLUGIN_COMPONENT_TYPE.SKILL &&
            installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE &&
            !!installation.runtimeId
        )
        const installedComponentKeys = new Set(skillInstallations.map((installation) => installation.componentKey))
        const missingComponentKeys = Array.from(
          new Set(group.components.map((component) => component.componentKey))
        ).filter((componentKey) => !installedComponentKeys.has(componentKey))

        if (missingComponentKeys.length) {
          const components = `${group.pluginName}/${missingComponentKeys.join(', ')}`
          throw new Error(
            this._translate.instant('XP.Xpert.TemplatePluginSkillsMissingRuntimePackages', {
              Default: `The required template skills could not be installed: ${components}.`,
              components
            }) as string
          )
        }

        for (const component of group.components) {
          const installation = skillInstallations.find((item) => item.componentKey === component.componentKey)
          if (!installation?.runtimeId) {
            continue
          }
          skillBindings.push({
            pluginName: group.pluginName,
            componentKey: component.componentKey,
            runtimeId: installation.runtimeId,
            ...(component.targetAgentKey ? { targetAgentKey: component.targetAgentKey } : {})
          })
        }
      }

      this.preparedTemplatePluginSkillDependencies.update((value) => new Map(value).set(dependencyKey, skillBindings))
      this.restoreTemplatePluginSkillBindings(skillBindings)
      this.refreshSkills()
      return true
    } catch (error) {
      if (!isCurrentSelection()) {
        return false
      }
      const localizedError = resolveTemplatePluginSkillInstallError(error)
      const message = localizedError
        ? (this._translate.instant(localizedError.key, { Default: localizedError.defaultMessage }) as string)
        : getErrorMessage(error) ||
          (this._translate.instant('XP.Xpert.TemplatePluginSkillsInstallFailedDetail', {
            Default: 'Template skills could not be initialized. Try again.'
          }) as string)
      this.templatePluginSkillInstallError.set(message)
      this._toastr.error(message)
      return false
    } finally {
      this.installingSkillPackage.set(false)
    }
  }

  restoreTemplatePluginSkillBindings(bindings: BlankTemplatePluginSkillBinding[]) {
    const primaryAgentKey = this.selectedTemplateDraft()?.team?.agent?.key
    const primarySkillIds = bindings
      .filter((binding) => !binding.targetAgentKey || binding.targetAgentKey === primaryAgentKey)
      .map((binding) => binding.runtimeId)
    this.selectedExplicitSkills.update((skills) => [...new Set([...skills, ...primarySkillIds])])
    this.templatePluginSkillBindings.set(bindings)
    this.refreshAgentSkillMiddlewareSelections()
  }

  applyTemplatePluginSkillBindings(draft: TXpertTeamDraft) {
    const nextDraft = draft

    for (const binding of this.templatePluginSkillBindings()) {
      if (!binding.targetAgentKey) {
        continue
      }
      const connectedMiddlewareKeys = new Set(
        nextDraft.connections
          .filter(
            (connection) =>
              connection.type === 'workflow' &&
              (connection.from === binding.targetAgentKey || connection.to === binding.targetAgentKey)
          )
          .map((connection) =>
            connection.from === binding.targetAgentKey ? String(connection.to) : String(connection.from)
          )
      )
      const skillsMiddlewares = nextDraft.nodes.filter((node) => {
        if (node.type !== 'workflow' || !connectedMiddlewareKeys.has(node.key)) {
          return false
        }
        const entity = node.entity as IWFNMiddleware
        return (
          entity.type === WorkflowNodeTypeEnum.MIDDLEWARE && entity.provider === BLANK_WIZARD_SKILLS_MIDDLEWARE_PROVIDER
        )
      })
      if (skillsMiddlewares.length !== 1) {
        throw new Error(
          `Template skill '${binding.pluginName}/${binding.componentKey}' requires exactly one Skills Middleware directly connected to Agent '${binding.targetAgentKey}'.`
        )
      }

      const middleware = skillsMiddlewares[0].entity as IWFNMiddleware
      const options = middleware.options && typeof middleware.options === 'object' ? middleware.options : {}
      const configuredSkills = Array.isArray(Reflect.get(options, 'skills'))
        ? (Reflect.get(options, 'skills') as unknown[]).filter((item): item is string => typeof item === 'string')
        : []
      middleware.options = {
        ...options,
        skills: Array.from(new Set([...configuredSkills, binding.runtimeId]))
      }
    }

    return nextDraft
  }

  async prepareTemplateToolsetsForCurrentWorkspace() {
    const workspaceId = this.workspaceId()
    if (!workspaceId) {
      return !this.templateToolsetDependencies().length
    }

    return this.prepareTemplateToolsets(workspaceId)
  }

  async prepareTemplateToolsets(workspaceId: string): Promise<boolean> {
    const dependencies = this.templateToolsetDependencies()
    if (!dependencies.length) {
      this.templateToolsetInstallError.set(null)
      this.preparedTemplateToolsetDependencies.set(null)
      return true
    }

    const dependencyKey = this.templateToolsetDependencyInstallKey(workspaceId, dependencies)
    const prepared = this.preparedTemplateToolsetDependencies()
    if (prepared?.key === dependencyKey) {
      this.templateToolsetInstallError.set(null)
      return true
    }

    const loaded = await this.loadTemplateToolsetSelectionStates(workspaceId)
    if (!loaded) {
      return false
    }

    try {
      const resolutions: BlankTemplateToolsetResolution[] = []
      for (const dependency of dependencies) {
        const dependencyState = this.templateToolsetSelectionStates().find(
          (state) => state.key === this.templateToolsetDependencyKey(dependency)
        )
        const toolset = dependencyState?.toolsets.find((item) => item.id === dependencyState.selectedToolsetId)
        if (!toolset) {
          throw new Error(this.getTemplateToolsetSelectionError(dependency, dependencyState?.toolsets ?? []))
        }

        resolutions.push({
          templateNodeKey: dependency.templateNodeKey,
          targetAgentKey: dependency.targetAgentKey,
          toolset
        })
      }

      this.preparedTemplateToolsetDependencies.set({
        key: dependencyKey,
        resolutions
      })
      return true
    } catch (error) {
      const message = getErrorMessage(error) || 'Failed to initialize template toolsets.'
      this.preparedTemplateToolsetDependencies.set(null)
      this.templateToolsetInstallError.set(message)
      this._toastr.error(message)
      return false
    }
  }

  async prepareTemplateToolsetStep(force = false) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !this.hasTemplateToolsetStep()) {
      return
    }

    await this.loadTemplateToolsetSelectionStates(workspaceId, { force })
  }

  async refreshTemplateToolsetStep() {
    await this.prepareTemplateToolsetStep(true)
  }

  async configureTemplateToolset(key: string) {
    const workspaceId = this.workspaceId()
    const state = this.templateToolsetSelectionStates().find((item) => item.key === key)
    if (!workspaceId || !state || this.configuringTemplateToolsetKey()) {
      return
    }

    this.configuringTemplateToolsetKey.set(key)
    try {
      const toolset = await firstValueFrom(
        this._configureBuiltinToolset(state.dependency.provider, workspaceId).pipe(take(1))
      )
      if (!toolset || typeof toolset !== 'object' || !toolset.id) {
        return
      }

      this.mergeConfiguredTemplateToolset(key, toolset)
      this._toastr.success('XP.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
    } catch (error) {
      this._toastr.error(
        getErrorMessage(error) ||
          this._translate.instant('XP.Xpert.TemplateToolsetConfigureFailed', {
            Default: 'Failed to configure the required toolset.'
          })
      )
    } finally {
      this.configuringTemplateToolsetKey.set(null)
    }
  }

  selectTemplateToolset(key: string, toolsetId: string | null) {
    this.templateToolsetSelectionStates.update((states) =>
      states.map((state) => {
        if (state.key !== key) {
          return state
        }

        const selectedId = readNonEmptyString(toolsetId) ?? null
        return {
          ...state,
          selectedToolsetId: selectedId,
          errorMessage: selectedId ? null : this.getTemplateToolsetSelectionError(state.dependency, state.toolsets)
        }
      })
    )
    this.templateToolsetInstallError.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
  }

  selectTemplateToolsetValue(key: string, value: unknown) {
    if (Array.isArray(value)) {
      this.selectTemplateToolset(key, readNonEmptyString(value[0]) ?? null)
      return
    }

    this.selectTemplateToolset(key, readNonEmptyString(value) ?? null)
  }

  getSelectedTemplateToolset(state: BlankTemplateToolsetSelectionState) {
    return state.toolsets.find((toolset) => toolset.id === state.selectedToolsetId) ?? null
  }

  async loadTemplateToolsetSelectionStates(workspaceId: string, options?: { force?: boolean }): Promise<boolean> {
    const dependencies = this.templateToolsetDependencies()
    if (!dependencies.length) {
      this.clearTemplateToolsetSelections()
      return true
    }

    const dependencyKey = this.templateToolsetDependencyInstallKey(workspaceId, dependencies)
    if (
      !options?.force &&
      this.loadedTemplateToolsetDependencyKey() === dependencyKey &&
      this.templateToolsetSelectionStates().length === dependencies.length
    ) {
      return true
    }

    const previousStates = new Map(this.templateToolsetSelectionStates().map((state) => [state.key, state]))
    this.loadingTemplateToolsets.set(true)
    this.templateToolsetInstallError.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
    this.templateToolsetSelectionStates.set(
      dependencies.map((dependency) => {
        const key = this.templateToolsetDependencyKey(dependency)
        const previous = previousStates.get(key)
        return {
          key,
          dependency,
          loading: true,
          toolsets: previous?.toolsets ?? [],
          selectedToolsetId: previous?.selectedToolsetId ?? null,
          errorMessage: null
        }
      })
    )

    try {
      const states: BlankTemplateToolsetSelectionState[] = []
      for (const dependency of dependencies) {
        const key = this.templateToolsetDependencyKey(dependency)
        const previous = previousStates.get(key)
        const toolsets = await this.loadTemplateToolsetCandidates(workspaceId, dependency)
        const selectedToolset = this.selectDefaultTemplateToolset(toolsets, dependency, previous?.selectedToolsetId)
        states.push({
          key,
          dependency,
          loading: false,
          toolsets,
          selectedToolsetId: selectedToolset?.id ?? null,
          errorMessage: selectedToolset ? null : this.getTemplateToolsetSelectionError(dependency, toolsets)
        })
      }

      this.templateToolsetSelectionStates.set(states)
      this.loadedTemplateToolsetDependencyKey.set(dependencyKey)
      return true
    } catch (error) {
      const message =
        getErrorMessage(error) ||
        this._translate.instant('XP.Xpert.TemplateToolsetsLoadFailed', {
          Default: 'Failed to load template toolsets.'
        })
      this.templateToolsetSelectionStates.update((states) =>
        states.map((state) => ({
          ...state,
          loading: false,
          errorMessage: state.errorMessage ?? message
        }))
      )
      this.loadedTemplateToolsetDependencyKey.set(null)
      this.templateToolsetInstallError.set(message)
      this._toastr.error(message)
      return false
    } finally {
      this.loadingTemplateToolsets.set(false)
    }
  }

  async loadTemplateToolsetCandidates(
    workspaceId: string,
    dependency: BlankTemplateToolsetDependency
  ): Promise<IXpertToolset[]> {
    const response = await firstValueFrom(
      this._toolsetService
        .getAllByWorkspace(workspaceId, {
          where: {
            type: dependency.provider,
            category: XpertToolsetCategoryEnum.BUILTIN
          },
          relations: ['tools'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
        .pipe(take(1))
    )

    return (Array.isArray(response) ? response : (response?.items ?? []))
      .filter((toolset) => this.isTemplateDependencyToolset(toolset, dependency))
      .sort(compareToolsetsByUpdatedAtDesc)
  }

  selectDefaultTemplateToolset(
    toolsets: IXpertToolset[],
    dependency: BlankTemplateToolsetDependency,
    previousSelectedToolsetId?: string | null
  ) {
    const previousSelected = toolsets.find((toolset) => toolset.id === previousSelectedToolsetId)
    if (previousSelected) {
      return previousSelected
    }

    if (dependency.instanceName) {
      return toolsets.find((toolset) => toolset.name === dependency.instanceName) ?? null
    }

    return toolsets.length === 1 ? toolsets[0] : null
  }

  mergeConfiguredTemplateToolset(key: string, toolset: IXpertToolset) {
    this.templateToolsetSelectionStates.update((states) =>
      states.map((state) => {
        if (state.key !== key || !this.isTemplateDependencyToolset(toolset, state.dependency)) {
          return state
        }

        const toolsets = [toolset, ...state.toolsets.filter((item) => item.id !== toolset.id)].sort(
          compareToolsetsByUpdatedAtDesc
        )

        return {
          ...state,
          toolsets,
          selectedToolsetId: toolset.id,
          errorMessage: null
        }
      })
    )
    this.templateToolsetInstallError.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
  }

  isTemplateDependencyToolset(toolset: IXpertToolset, dependency: BlankTemplateToolsetDependency) {
    return (
      toolset.type === dependency.provider &&
      (toolset.category ?? XpertToolsetCategoryEnum.BUILTIN) === XpertToolsetCategoryEnum.BUILTIN
    )
  }

  getTemplateToolsetSelectionError(dependency: BlankTemplateToolsetDependency, toolsets: IXpertToolset[]) {
    if (!toolsets.length) {
      return dependency.instanceName
        ? this._translate.instant('XP.Xpert.TemplateToolsetMissingNamed', {
            Default: `Required template toolset '${dependency.instanceName}' (${dependency.provider}) is not configured in this workspace.`,
            instanceName: dependency.instanceName,
            provider: dependency.provider
          })
        : this._translate.instant('XP.Xpert.TemplateToolsetMissingProvider', {
            Default: `Required template toolset '${dependency.provider}' is not configured in this workspace.`,
            provider: dependency.provider
          })
    }

    return this._translate.instant('XP.Xpert.TemplateToolsetSelectRequired', {
      Default: `Select a '${dependency.provider}' toolset before creating this template.`,
      provider: dependency.provider
    })
  }

  templatePluginSkillDependencyInstallKey(workspaceId: string, groups: BlankTemplatePluginSkillDependencyGroup[]) {
    return JSON.stringify({
      workspaceId,
      templateId: this.selectedTemplateId(),
      groups
    })
  }

  templateToolsetDependencyInstallKey(workspaceId: string, dependencies: BlankTemplateToolsetDependency[]) {
    return JSON.stringify({
      workspaceId,
      templateId: this.selectedTemplateId(),
      dependencies
    })
  }

  templateToolsetDependencyKey(dependency: BlankTemplateToolsetDependency) {
    return JSON.stringify({
      pluginName: dependency.pluginName,
      provider: dependency.provider,
      templateNodeKey: dependency.templateNodeKey,
      targetAgentKey: dependency.targetAgentKey ?? null,
      instanceName: dependency.instanceName ?? null
    })
  }

  clearTemplateToolsetSelections() {
    this.templateToolsetInstallError.set(null)
    this.loadedTemplateToolsetDependencyKey.set(null)
    this.preparedTemplateToolsetDependencies.set(null)
    this.templateToolsetSelectionStates.set([])
    this.loadingTemplateToolsets.set(false)
    this.configuringTemplateToolsetKey.set(null)
  }

  async getWorkspacePublicRepositoryId() {
    const existing = this.workspacePublicRepositoryId()
    if (existing) {
      return existing
    }

    const { items } = await firstValueFrom(this._skillRepositoryService.getAllInOrg().pipe(take(1)))
    const repositoryId =
      items?.find((repository) => repository.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER)?.id ?? null
    this.workspacePublicRepositoryId.set(repositoryId)
    return repositoryId
  }

  getRepositorySkillIds(repositoryId: string) {
    return this.skillState()
      .skills.filter((skill) => skill.repositoryId === repositoryId)
      .map((skill) => skill.id)
  }

  getWorkspaceSkillIds() {
    return this.skillState().skills.map((skill) => skill.id)
  }

  applyWorkspaceSkillDefaults(workspaceId: string, skillIds: string[]) {
    if (!this.usesWorkspaceSkillDefaults()) {
      return
    }

    if (this.initializedWorkspaceSkillDefaultWorkspaces().has(workspaceId)) {
      return
    }

    const normalizedSkillIds = Array.from(
      new Set(skillIds.map((skillId) => skillId?.trim()).filter((skillId): skillId is string => !!skillId))
    )
    if (normalizedSkillIds.length) {
      this.selectedExplicitSkills.set(Array.from(new Set([...this.selectedExplicitSkills(), ...normalizedSkillIds])))
    }
    this.selectedRepositoryDefault.set(null)
    this.initializedWorkspaceSkillDefaultWorkspaces.update((value) => new Set([...value, workspaceId]))
  }

  refreshAgentSkillMiddlewareSelections() {
    const middlewares = normalizeBlankMiddlewareSelections(
      this.selectedMiddlewares(),
      this.selectedExplicitSkills(),
      this.selectedRepositoryDefault(),
      this.preserveSkillsMiddleware()
    )
    this.selectedMiddlewares.set(middlewares)
    this.syncMiddlewareRequiredSelections(middlewares)
  }

  syncMiddlewareRequiredSelections(middlewares = this.selectedMiddlewares()) {
    this.selectedMiddlewareRequired.set(
      normalizeBlankMiddlewareRequiredSelections(middlewares, this.selectedMiddlewareRequired())
    )
  }
  abstract toggleSkill(skillId: string, enabled: boolean): void
}
