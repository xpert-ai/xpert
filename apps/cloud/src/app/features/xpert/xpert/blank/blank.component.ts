import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  XpDialogActionGroupDirective,
  XpDialogFrameImports,
  XpI18nPipe,
  XpSpinComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardComboboxComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardSelectImports,
  ZardStepperImports,
  ZardSwitchComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { CopilotConfigFormComponent } from 'apps/cloud/src/app/@shared/copilot'
import {
  hasJsonSchemaRequiredErrors,
  WorkflowTriggerProviderOption,
  XpertWorkflowIconComponent
} from 'apps/cloud/src/app/@shared/workflow'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { firstValueFrom, take } from 'rxjs'
import {
  getErrorMessage,
  I18nObject,
  ICopilotModel,
  IXpert,
  resolveI18nText,
  TAvatar,
  TXpertTeamDraft,
  WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER,
  XpertTypeEnum
} from '../../../../@core'
import { genAgentKey } from '../../utils'
import {
  BlankMiddlewareDefinition,
  BlankTriggerSelection,
  BlankWorkflowStarterNodeKey,
  buildBlankKnowledgeDraft,
  buildBlankWorkflowDraft,
  buildBlankXpertDraft,
  isBlankMiddlewareRequired,
  mergeBlankMiddlewareRequiredFeatures,
  normalizeBlankMiddlewareRequiredSelections,
  normalizeBlankMiddlewareSelections
} from './blank-draft.util'
import { BlankTemplateSelectionComponent } from './blank-template-selection.component'
import {
  applyAgentTemplateWizardState,
  applyKnowledgeTemplateWizardState,
  applyTemplateToolsetResolutionsToDraft,
  BlankXpertStartMode,
  extractAgentTemplateWizardState,
  extractKnowledgeTemplateWizardState
} from './blank-template.util'
import { BlankTriggerSelectionComponent } from './blank-trigger-selection.component'
import { BlankWizardCapabilitiesComponent } from './blank-wizard-capabilities'
import {
  BLANK_XPERT_DIALOG_CATEGORY,
  BlankXpertWizardResult,
  CLAWXPERT_PRIMARY_AGENT_PROMPT_TEMPLATE,
  DraftPreparationResult,
  hasBlockingChecklist,
  XPERT_AUTO_PUBLISH_RELEASE_NOTES
} from './blank-wizard-data'
import { BlankWizardResources } from './blank-wizard-resources'
import { BlankWizardStartComponent } from './blank-wizard-start'
import { shouldHideBlankWizardPrimaryAgent, shouldInitializeBlankWizardDraft } from './blank-wizard.util'
import { BlankProjectManagement } from './blank-project-management'
import { BlankProjectManagementComponent } from './blank-project-management.component'

export { BLANK_XPERT_DIALOG_CATEGORY, normalizeBlankXpertDialogCategory } from './blank-wizard-data'
export type {
  BlankXpertDialogCategory,
  BlankXpertDialogData,
  BlankXpertWizardResult,
  BlankXpertWizardStatus
} from './blank-wizard-data'
@Component({
  selector: 'xpert-new-blank',
  standalone: true,
  imports: [
    XpDialogActionGroupDirective,
    ...XpDialogFrameImports,
    BlankWizardCapabilitiesComponent,
    BlankProjectManagementComponent,
    BlankWizardStartComponent,
    TranslateModule,
    RouterModule,
    DragDropModule,
    ...ZardStepperImports,
    ...ZardTooltipImports,
    FormsModule,
    CdkListboxModule,
    XpI18nPipe,
    XpSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardComboboxComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardSelectImports,
    ZardSwitchComponent,
    XpertBasicFormComponent,
    CopilotConfigFormComponent,
    XpertWorkflowIconComponent,
    BlankTriggerSelectionComponent,
    BlankTemplateSelectionComponent
  ],
  templateUrl: './blank.component.html',
  providers: [BlankProjectManagement],
  styleUrl: './blank.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertNewBlankComponent extends BlankWizardResources {
  readonly projectManagement = inject(BlankProjectManagement)

  async create() {
    if (this.loading() || this.creationInvalid(!!this.basicStepInvalid())) {
      return
    }

    await this.runCreate()
  }

  async createDirectly() {
    if (this.directCreateDisabled()) {
      return
    }

    const name = this.name()?.trim()
    if (!name) {
      return
    }

    await this.runCreate(async () => {
      const nameAvailable = await firstValueFrom(this.xpertService.validateName(name).pipe(take(1)))
      if (!nameAvailable) {
        this._toastr.error(this._translate.instant('XP.Xpert.IDNotAvailable', { Default: 'ID not available' }))
        return false
      }

      await this.prepareAgentSkillStep()
      return this.name()?.trim() === name && !this.creationInvalid(!!this.directBasicStepInvalid())
    })
  }

  creationInvalid(basicStepInvalid: boolean) {
    return (
      this.startStepInvalid() ||
      this.modelProviderStepInvalid() ||
      basicStepInvalid ||
      (this.isAgentType() && this.selectedTriggersInvalid()) ||
      (this.isKnowledgeType() && this.selectedKnowledgeTriggersInvalid()) ||
      this.installingSkillPackage() ||
      this.loadingTemplateToolsets() ||
      !!this.templatePluginSkillInstallError() ||
      !!this.templateToolsetInstallError()
    )
  }

  async runCreate(preflight?: () => Promise<boolean>) {
    this.loading.set(true)
    try {
      if (preflight && !(await preflight())) {
        return
      }

      if (this.isAgentType()) {
        const template = this.selectedTemplateDraft()
        await this.projectManagement.validate(
          this.copilotModel() ?? template?.team.agent?.copilotModel ?? template?.team.copilotModel
        )
        const templatePluginSkillsReady = await this.prepareTemplatePluginSkillsForCurrentWorkspace()
        if (!templatePluginSkillsReady) {
          return
        }

        const templateToolsetsReady = await this.prepareTemplateToolsetsForCurrentWorkspace()
        if (!templateToolsetsReady) {
          return
        }
      }

      const result = this.startMode() === 'template' ? await this.createFromTemplate() : await this.createBlankXpert()

      this._toastr.success(
        result.status === 'published' ? 'XP.Xpert.CreatedAndPublishedSuccessfully' : 'XP.Messages.CreatedSuccessfully',
        {
          Default: result.status === 'published' ? 'Created and published successfully' : 'Created Successfully'
        }
      )
      this.close(result)
    } catch (error) {
      this._toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  modelProviderStepInvalid() {
    if (!this.needsModelProviderSetup()) {
      return false
    }

    return (
      !this.canConfigureModelProvider() ||
      this.enablingPrimaryCopilot() ||
      !this.showClawModelProviderForm() ||
      !this.hasSelectedClawModelProviderModel()
    )
  }

  clawModelProviderSaveDisabled() {
    const form = this.clawCopilotForm()
    return (
      this.loading() ||
      this.enablingPrimaryCopilot() ||
      !this.canConfigureModelProvider() ||
      !this.showClawModelProviderForm() ||
      !form?.canSubmit() ||
      !form?.hasSelectedModel()
    )
  }

  async saveClawModelProviderStep() {
    const form = this.clawCopilotForm()
    if (!form || this.clawModelProviderSaveDisabled()) {
      return
    }

    const saved = await form.submit()
    if (!saved) {
      return
    }

    this.applyClawModelProviderFormModel()
    this.modelProviderSetupCompleted.set(true)
    this._copilotServer.refresh()
  }

  setStartMode(mode: BlankXpertStartMode) {
    if (this.lockStartMode && mode !== this.startMode()) {
      return
    }

    if (mode === this.startMode()) {
      return
    }

    if (mode === 'template' && !this.supportsTemplateStart()) {
      return
    }

    this.startMode.set(mode)
    this.resetTemplateFlow({ preserveStartMode: true })
    this.applyBlankDefaults()
  }

  async createBlankXpert(): Promise<BlankXpertWizardResult> {
    const selectedType = this.selectedType()
    const selectedMode = this.selectedMode()
    const selectedMiddlewareDefinitions = this.getSelectedMiddlewareDefinitions()
    const selectedMiddlewares = this.selectedMiddlewares()
    const defaultSandboxProvider =
      await this.getDefaultSandboxProviderForMiddlewareDefinitions(selectedMiddlewareDefinitions)
    const primaryAgentPrompt = this.buildInitialPrimaryAgentPrompt()
    const features = mergeBlankMiddlewareRequiredFeatures(
      undefined,
      selectedMiddlewares,
      selectedMiddlewareDefinitions,
      defaultSandboxProvider
    )

    const xpert = await firstValueFrom(
      this.xpertService.create({
        type: selectedType,
        name: this.name(),
        title: this.title(),
        description: this.description(),
        copilotModel: this.copilotModel(),
        workspaceDataScope: this.isolateWorkspaceData() ? 'user' : 'shared',
        latest: true,
        workspaceId: this.workspaceId() ?? undefined,
        avatar: this.avatar(),
        ...(features ? { features } : {}),
        agent: {
          key: genAgentKey(),
          avatar: this.avatar(),
          ...(primaryAgentPrompt ? { prompt: primaryAgentPrompt } : {}),
          options: {
            ...(shouldHideBlankWizardPrimaryAgent(selectedMode)
              ? {
                  hidden: true
                }
              : {}),
            vision: {
              enabled: true
            }
          }
        }
      })
    )
    const hydratedXpert = this.withInitialPrimaryAgentPrompt(xpert, primaryAgentPrompt)
    const mergedFeatures = features
      ? mergeBlankMiddlewareRequiredFeatures(
          hydratedXpert.features,
          selectedMiddlewares,
          selectedMiddlewareDefinitions,
          defaultSandboxProvider
        )
      : hydratedXpert.features
    const preparedXpert = await this.provisionKnowledgebaseIfNeeded({
      ...hydratedXpert,
      ...(mergedFeatures ? { features: mergedFeatures } : {})
    })
    return this.completeCreation(preparedXpert)
  }

  async createFromTemplate(): Promise<BlankXpertWizardResult> {
    const draft = this.selectedTemplateDraft()
    if (!draft) {
      throw new Error('Select a template before continuing.')
    }

    const primaryAgentPrompt = this.buildInitialPrimaryAgentPrompt()
    const defaultSandboxProvider = await this.getDefaultSandboxProviderForMiddlewareDefinitions(
      this.getSelectedMiddlewareDefinitions()
    )
    const nextDraft = this.withInitialPrimaryAgentPromptInDraft(
      this.applyTemplatePluginSkillBindings(
        this.buildTemplateImportDraftWithTemplateToolsets(draft, defaultSandboxProvider)
      ),
      primaryAgentPrompt
    )
    const xpert = await firstValueFrom(
      this.xpertService.importDSL(nextDraft, {
        templateId: this.selectedTemplate()?.id ?? this.selectedTemplateId() ?? undefined,
        workspaceDataScope: this.isolateWorkspaceData() ? 'user' : 'shared'
      })
    )
    const hydratedXpert = this.withInitialPrimaryAgentPrompt(xpert, primaryAgentPrompt)
    const preparedXpert = await this.provisionKnowledgebaseIfNeeded(hydratedXpert)
    return this.completeImportedCreation(preparedXpert)
  }

  toggleMiddleware(provider: string, enabled: boolean) {
    const middlewares = normalizeBlankMiddlewareSelections(
      this.toggleValue(this.selectedMiddlewares(), provider, enabled),
      this.selectedExplicitSkills(),
      this.selectedRepositoryDefault(),
      this.preserveSkillsMiddleware()
    )
    this.selectedMiddlewares.set(middlewares)
    this.syncMiddlewareRequiredSelections(middlewares)
  }

  toggleMiddlewareRequired(provider: string, required: boolean) {
    if (!this.selectedMiddlewares().includes(provider)) {
      return
    }

    this.selectedMiddlewareRequired.update((current) => {
      const next = { ...current }
      if (required) {
        delete next[provider]
      } else {
        next[provider] = false
      }
      return normalizeBlankMiddlewareRequiredSelections(this.selectedMiddlewares(), next)
    })
  }

  isMiddlewareRequired(provider: string) {
    return isBlankMiddlewareRequired(provider, this.selectedMiddlewareRequired())
  }

  toggleSkill(skillId: string, enabled: boolean) {
    if (this.usesWorkspaceSkillDefaults()) {
      this.selectedExplicitSkills.set(this.toggleValue(this.selectedExplicitSkills(), skillId, enabled))
      this.refreshAgentSkillMiddlewareSelections()
      return
    }

    const skill = this.skillState().skills.find((item) => item.id === skillId)
    if (!skill) {
      this.selectedExplicitSkills.set(this.toggleValue(this.selectedExplicitSkills(), skillId, enabled))
      this.refreshAgentSkillMiddlewareSelections()
      return
    }

    if (skill.repositoryProvider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER && skill.repositoryId) {
      const current = this.selectedRepositoryDefault()
      const publicSkillIds = this.getRepositorySkillIds(skill.repositoryId)
      const disabledSkillIds = new Set(
        current?.repositoryId === skill.repositoryId ? current.disabledSkillIds : publicSkillIds
      )

      if (enabled) {
        disabledSkillIds.delete(skillId)
      } else {
        disabledSkillIds.add(skillId)
      }

      this.selectedRepositoryDefault.set({
        repositoryId: skill.repositoryId,
        disabledSkillIds: Array.from(disabledSkillIds)
      })
      this.refreshAgentSkillMiddlewareSelections()
      return
    }

    this.selectedExplicitSkills.set(this.toggleValue(this.selectedExplicitSkills(), skillId, enabled))
    this.refreshAgentSkillMiddlewareSelections()
  }

  toggleDataSource(provider: string, enabled: boolean) {
    this.selectedDataSources.set(this.toggleValue(this.selectedDataSources(), provider, enabled))
  }

  toggleProcessor(provider: string, enabled: boolean) {
    this.selectedProcessors.set(this.toggleValue(this.selectedProcessors(), provider, enabled))
  }

  toggleChunker(provider: string, enabled: boolean) {
    this.selectedChunkers.set(this.toggleValue(this.selectedChunkers(), provider, enabled))
  }

  toggleUnderstanding(provider: string, enabled: boolean) {
    this.selectedUnderstandings.set(this.toggleValue(this.selectedUnderstandings(), provider, enabled))
  }

  toggleWorkflowNode(node: BlankWorkflowStarterNodeKey, enabled: boolean) {
    this.selectedWorkflowNodes.set(this.toggleValue(this.selectedWorkflowNodes(), node, enabled))
  }

  close(value?: BlankXpertWizardResult) {
    this._dialogRef.close(value)
  }

  async completeCreation(xpert: IXpert): Promise<BlankXpertWizardResult> {
    const result = await this.prepareProjectManagement(await this.initializeDraftIfNeeded(xpert))
    if (this.completionMode !== 'publish') {
      return { xpert: result.xpert, status: 'created' as const }
    }

    if (result.preparationFailed || result.hasBlockingChecklist) {
      this.showAutoPublishInterruptedWarning()
      return { xpert: result.xpert, status: 'created' as const }
    }

    try {
      const publishedXpert = await this.publishCreatedXpert(result.xpert)
      return { xpert: publishedXpert, status: 'published' as const }
    } catch (error) {
      this.showAutoPublishFailedWarning(getErrorMessage(error))
      console.error(error)
      return { xpert: result.xpert, status: 'created' as const }
    }
  }

  async completeImportedCreation(xpert: IXpert): Promise<BlankXpertWizardResult> {
    const prepared = await this.prepareProjectManagement({
      xpert,
      draftSaved: true,
      hasBlockingChecklist: false,
      preparationFailed: false
    })
    xpert = prepared.xpert
    if (prepared.preparationFailed) return { xpert, status: 'created' }
    if (this.completionMode !== 'publish') {
      return { xpert, status: 'created' as const }
    }

    try {
      const draftTeam = await firstValueFrom(this.xpertService.getTeam(xpert.id, { relations: ['agent'] }))
      if (hasBlockingChecklist(draftTeam.draft?.checklist)) {
        this.showAutoPublishInterruptedWarning()
        return { xpert, status: 'created' as const }
      }

      try {
        const publishedXpert = await this.publishCreatedXpert(xpert)
        return { xpert: publishedXpert, status: 'published' as const }
      } catch (error) {
        this.showAutoPublishFailedWarning(getErrorMessage(error))
        console.error(error)
        return { xpert, status: 'created' as const }
      }
    } catch (error) {
      this.showAutoPublishInterruptedWarning(getErrorMessage(error))
      console.error(error)
      return { xpert, status: 'created' as const }
    }
  }

  buildTemplateImportDraft(draft: TXpertTeamDraft, defaultSandboxProvider?: string | null) {
    const selectedCopilotModel =
      this.copilotModel() ?? draft.team.agent?.copilotModel ?? draft.team.copilotModel ?? null
    const finalDraft = this.isAgentType()
      ? applyAgentTemplateWizardState(draft, this.getSelections(), {
          defaultCopilotModel: selectedCopilotModel,
          defaultSandboxProvider,
          middlewareDefinitions: this.getSelectedMiddlewareDefinitions()
        })
      : this.isKnowledgeType()
        ? applyKnowledgeTemplateWizardState(draft, this.getKnowledgeSelections())
        : draft
    const features = this.isAgentType()
      ? mergeBlankMiddlewareRequiredFeatures(
          finalDraft.team.features,
          this.selectedMiddlewares(),
          this.getSelectedMiddlewareDefinitions(),
          defaultSandboxProvider
        )
      : finalDraft.team.features

    return {
      ...finalDraft,
      team: {
        ...finalDraft.team,
        type: this.selectedType(),
        latest: true,
        workspaceId: this.workspaceId() ?? undefined,
        name: this.name(),
        title: this.title(),
        description: this.description(),
        avatar: this.avatar(),
        copilotModel: selectedCopilotModel,
        ...(features ? { features } : {})
      }
    }
  }

  buildTemplateImportDraftWithTemplateToolsets(draft: TXpertTeamDraft, defaultSandboxProvider?: string | null) {
    const nextDraft = this.buildTemplateImportDraft(draft, defaultSandboxProvider)
    const resolutions = this.getPreparedTemplateToolsetResolutions()

    return resolutions.length ? applyTemplateToolsetResolutionsToDraft(nextDraft, resolutions) : nextDraft
  }

  getPreparedTemplateToolsetResolutions() {
    const workspaceId = this.workspaceId()
    const dependencies = this.templateToolsetDependencies()
    if (!workspaceId || !dependencies.length) {
      return []
    }

    const dependencyKey = this.templateToolsetDependencyInstallKey(workspaceId, dependencies)
    const prepared = this.preparedTemplateToolsetDependencies()
    return prepared?.key === dependencyKey ? prepared.resolutions : []
  }

  applyTemplateDefaults(draft: TXpertTeamDraft) {
    if (this.isAgentType()) {
      const state = extractAgentTemplateWizardState(draft)
      this.applyTemplateBasicInfo(state.basic)
      this.selectedTriggers.set(state.selections.triggers)
      this.applyAgentSkillSelections(state.selections)
      return
    }

    if (this.isKnowledgeType()) {
      const state = extractKnowledgeTemplateWizardState(draft)
      this.applyTemplateBasicInfo(state.basic)
      this.selectedKnowledgeTriggers.set(state.selections.triggers)
      this.selectedDataSources.set(state.selections.sourceProviders)
      this.selectedProcessors.set(state.selections.processorProviders)
      this.selectedChunkers.set(state.selections.chunkerProviders)
      this.selectedUnderstandings.set(state.selections.understandingProviders)
    }
  }

  applyTemplateBasicInfo(basic: {
    name?: string
    title?: string
    description?: string | I18nObject
    avatar?: TAvatar
    copilotModel?: ICopilotModel
  }) {
    this.name.set(basic.name)
    this.title.set(basic.title)
    this.description.set(resolveI18nText(basic.description, this._translate.currentLang) ?? undefined)
    this.avatar.set(basic.avatar)
    this.copilotModel.set(basic.copilotModel)
  }

  applyBlankDefaults() {
    this.templatePluginSkillBindings.set([])
    this.name.set(undefined)
    this.description.set(undefined)
    this.avatar.set(undefined)
    this.title.set(undefined)
    this.copilotModel.set(undefined)
    this.templatePluginSkillInstallError.set(null)
    this.clearTemplateToolsetSelections()
    this.resetSelections()
  }

  resetSelections() {
    this.selectedTriggers.set([])
    this.applyAgentSkillSelections({
      skills: [],
      repositoryDefault: null,
      middlewares: []
    })
    this.selectedKnowledgeTriggers.set([])
    this.selectedDataSources.set([])
    this.selectedProcessors.set([])
    this.selectedChunkers.set([])
    this.selectedUnderstandings.set([])
    this.selectedWorkflowNodes.set([])
  }

  resetTemplateFlow(options?: { preserveStartMode?: boolean }) {
    if (!options?.preserveStartMode) {
      this.startMode.set('blank')
    }
    this.selectedTemplateId.set(null)
    this.selectedTemplate.set(null)
    this.selectedTemplateDraft.set(null)
    this.templateLoading.set(false)
    this.templateLoadError.set(null)
    this.templatePluginSkillInstallError.set(null)
    this.clearTemplateToolsetSelections()
    this.preparedTemplatePluginSkillDependencies.set(new Map())
  }

  async initializeDraftIfNeeded(xpert: IXpert): Promise<DraftPreparationResult> {
    if (
      !shouldInitializeBlankWizardDraft(
        this.selectedMode(),
        this.hasAdvancedSelections() || this.projectManagement.enabled(),
        this.completionMode
      )
    ) {
      return {
        xpert,
        draftSaved: false,
        hasBlockingChecklist: false,
        preparationFailed: false
      } satisfies DraftPreparationResult
    }

    if (this.isKnowledgeType()) {
      try {
        const draft = await buildBlankKnowledgeDraft(xpert, this.getKnowledgeSelections())
        const savedDraft = await firstValueFrom(this.xpertService.saveDraft(xpert.id, draft))
        return {
          xpert: {
            ...xpert,
            draft: savedDraft
          },
          draftSaved: true,
          hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
          preparationFailed: false
        }
      } catch (error) {
        this.showPreconfigurationNotSavedWarning()
        console.error(error)
        return {
          xpert,
          draftSaved: false,
          hasBlockingChecklist: false,
          preparationFailed: true
        } satisfies DraftPreparationResult
      }
    }

    if (this.isWorkflowType()) {
      try {
        const team = await this.getDraftTeam(xpert)
        const draft = await buildBlankWorkflowDraft(team, this.getWorkflowSelections())
        const savedDraft = await firstValueFrom(this.xpertService.saveDraft(xpert.id, draft))
        return {
          xpert: {
            ...xpert,
            draft: savedDraft
          },
          draftSaved: true,
          hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
          preparationFailed: false
        }
      } catch (error) {
        this.showPreconfigurationNotSavedWarning()
        console.error(error)
        return {
          xpert,
          draftSaved: false,
          hasBlockingChecklist: false,
          preparationFailed: true
        } satisfies DraftPreparationResult
      }
    }

    try {
      const team = await this.getDraftTeam(xpert)
      const selectedMiddlewareDefinitions = this.getSelectedMiddlewareDefinitions()
      const defaultSandboxProvider =
        await this.getDefaultSandboxProviderForMiddlewareDefinitions(selectedMiddlewareDefinitions)
      const draft = await buildBlankXpertDraft(team, this.getSelections(), {
        defaultCopilotModel: team.agent?.copilotModel ?? team.copilotModel ?? this.copilotModel() ?? null,
        defaultSandboxProvider,
        middlewareDefinitions: selectedMiddlewareDefinitions
      })
      const savedDraft = await firstValueFrom(this.xpertService.saveDraft(xpert.id, draft))
      return {
        xpert: {
          ...xpert,
          draft: savedDraft
        },
        draftSaved: true,
        hasBlockingChecklist: hasBlockingChecklist(savedDraft?.checklist),
        preparationFailed: false
      }
    } catch (error) {
      this.showPreconfigurationNotSavedWarning()
      console.error(error)
      return {
        xpert,
        draftSaved: false,
        hasBlockingChecklist: false,
        preparationFailed: true
      } satisfies DraftPreparationResult
    }
  }

  async publishCreatedXpert(xpert: IXpert): Promise<IXpert> {
    const workspaceId = xpert.workspaceId ?? this.workspaceId() ?? null
    let environmentId: string | null = null

    if (workspaceId) {
      try {
        environmentId = (await firstValueFrom(this.environmentService.getDefaultByWorkspace(workspaceId)))?.id ?? null
      } catch {
        environmentId = null
      }
    }

    return firstValueFrom(
      this.xpertService.publish(xpert.id, false, {
        environmentId,
        releaseNotes: XPERT_AUTO_PUBLISH_RELEASE_NOTES
      })
    )
  }

  async prepareProjectManagement(result: DraftPreparationResult): Promise<DraftPreparationResult> {
    if (!this.isAgentType() || !this.projectManagement.enabled() || result.preparationFailed) return result
    try {
      const xpert = await this.projectManagement.apply(result.xpert)
      return { ...result, xpert, draftSaved: true, hasBlockingChecklist: hasBlockingChecklist(xpert.draft?.checklist) }
    } catch (error) {
      this.showPreconfigurationNotSavedWarning()
      this._toastr.error(getErrorMessage(error))
      return { ...result, preparationFailed: true }
    }
  }

  async provisionKnowledgebaseIfNeeded(xpert: IXpert): Promise<IXpert> {
    if (xpert.type !== XpertTypeEnum.Knowledge) {
      return xpert
    }

    if (xpert.knowledgebase?.id) {
      return xpert
    }

    try {
      const knowledgebase = await firstValueFrom(
        this.knowledgebaseService.create({
          name: xpert.title || xpert.name,
          description: xpert.description,
          avatar: xpert.avatar,
          workspaceId: xpert.workspaceId ?? this.workspaceId() ?? undefined,
          copilotModel: xpert.copilotModel
        })
      )

      try {
        await firstValueFrom(this.knowledgebaseService.update(knowledgebase.id, { pipelineId: xpert.id }))
        return {
          ...xpert,
          knowledgebase: {
            ...knowledgebase,
            pipelineId: xpert.id
          }
        }
      } catch (error) {
        return this.rollbackKnowledgePipelineCreation(xpert.id, knowledgebase.id, error)
      }
    } catch (error) {
      return this.rollbackKnowledgeXpertCreation(xpert.id, error)
    }
  }

  async rollbackKnowledgeXpertCreation(xpertId: string, error: unknown): Promise<never> {
    try {
      await firstValueFrom(this.xpertService.delete(xpertId))
    } catch {
      // Ignore rollback errors and surface the original failure.
    }

    throw error
  }

  async rollbackKnowledgePipelineCreation(xpertId: string, knowledgebaseId: string, error: unknown): Promise<never> {
    try {
      await firstValueFrom(this.knowledgebaseService.delete(knowledgebaseId))
    } catch {
      // Ignore rollback errors and surface the original failure.
    }

    return this.rollbackKnowledgeXpertCreation(xpertId, error)
  }

  async getDraftTeam(xpert: IXpert): Promise<IXpert> {
    if (xpert.agent?.key) {
      return xpert
    }

    return firstValueFrom(this.xpertService.getTeam(xpert.id, { relations: ['agent'] }))
  }

  showAutoPublishInterruptedWarning(detail?: string) {
    this.showTranslatedWarning(
      'XP.Xpert.AutoPublishInterrupted',
      'Expert created, but auto publish was not completed. You can continue in Studio.',
      detail
    )
  }

  showAutoPublishFailedWarning(detail?: string) {
    this.showTranslatedWarning(
      'XP.Xpert.AutoPublishFailed',
      'Expert created, but auto publish was not completed. You can continue in Studio.',
      detail
    )
  }

  showPreconfigurationNotSavedWarning(detail?: string) {
    this.showTranslatedWarning(
      'XP.Xpert.PreconfigurationNotSaved',
      'Expert created, but the preconfiguration could not be saved. You can continue in Studio.',
      detail
    )
  }

  showTranslatedWarning(key: string, defaultMessage: string, detail?: string) {
    const message = this._translate.instant(key, { Default: defaultMessage })
    this._toastr.warning(detail ? `${message}: ${detail}` : message)
  }

  getSelections() {
    return {
      triggers: this.selectedTriggers(),
      skills: this.selectedExplicitSkills(),
      repositoryDefault: this.selectedRepositoryDefault(),
      middlewares: this.selectedMiddlewares(),
      middlewareRequired: this.selectedMiddlewareRequired(),
      preserveSkillsMiddleware: this.preserveSkillsMiddleware()
    }
  }

  buildInitialPrimaryAgentPrompt(): string | undefined {
    if (this.templateCategory !== BLANK_XPERT_DIALOG_CATEGORY.CLAW) {
      return undefined
    }

    return CLAWXPERT_PRIMARY_AGENT_PROMPT_TEMPLATE
  }

  withInitialPrimaryAgentPromptInDraft(draft: TXpertTeamDraft, prompt?: string): TXpertTeamDraft {
    const primaryAgentKey = draft.team?.agent?.key
    if (!prompt || !primaryAgentKey) {
      return draft
    }

    return {
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.type === 'agent' && node.key === primaryAgentKey
          ? {
              ...node,
              entity: {
                ...node.entity,
                prompt: node.entity?.prompt || prompt
              }
            }
          : node
      )
    }
  }

  withInitialPrimaryAgentPrompt(xpert: IXpert, prompt?: string): IXpert {
    if (!prompt || !xpert.agent) {
      return xpert
    }

    return {
      ...xpert,
      agent: {
        ...xpert.agent,
        prompt: xpert.agent.prompt ?? prompt
      }
    }
  }

  getSelectedMiddlewareDefinitions(): BlankMiddlewareDefinition[] {
    const selected = new Set(this.selectedMiddlewares())
    return this.middlewareProviders()
      .map(({ meta }) => ({
        name: meta.name,
        configSchema: meta.configSchema,
        features: meta.features
      }))
      .filter((definition) => selected.has(definition.name))
  }

  async getDefaultSandboxProviderForMiddlewareDefinitions(
    middlewareDefinitions: BlankMiddlewareDefinition[]
  ): Promise<string | null> {
    const requiresSandbox = middlewareDefinitions.some((definition) => definition.features?.includes('sandbox'))
    if (!requiresSandbox) {
      return null
    }

    const providers = await firstValueFrom(this.xpertService.getSandboxProviders())
    return providers[0]?.type ?? null
  }

  getKnowledgeSelections() {
    return {
      triggers: this.selectedKnowledgeTriggers(),
      sourceProviders: this.selectedDataSources(),
      processorProviders: this.selectedProcessors(),
      chunkerProviders: this.selectedChunkers(),
      understandingProviders: this.selectedUnderstandings()
    }
  }

  getWorkflowSelections() {
    return {
      nodes: this.selectedWorkflowNodes()
    }
  }

  hasInvalidTriggerSelections(
    selections: BlankTriggerSelection[],
    providers: WorkflowTriggerProviderOption[]
  ): boolean {
    return selections.some((selection) => {
      const provider = providers.find((item) => item.name === selection.provider)
      if (!provider || provider.name === 'chat') {
        return false
      }

      return hasJsonSchemaRequiredErrors(provider.configSchema, selection.config ?? {})
    })
  }

  toggleValue<T extends string>(values: T[], value: T, enabled: boolean): T[] {
    if (enabled) {
      return values.includes(value) ? values : [...values, value]
    }

    return values.filter((item) => item !== value)
  }
}
