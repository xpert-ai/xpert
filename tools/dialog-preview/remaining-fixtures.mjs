import { computed, signal } from '@angular/core'
import { FormControl, FormGroup } from '@angular/forms'
import { of } from 'rxjs'
export const wizardMode = signal('agent')
export function remainingFixture(key, busy, notify, close) {
  const action = () => notify('本地预览，不会修改业务数据')
  const fields = (values) =>
    new FormGroup(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, new FormControl(value)])))
  const organization = { id: 'preview', name: 'Research workspace', officialName: 'Research team' }
  if (key === 'remainingMcp')
    return {
      createForm: fields({ name: 'Research tools', slug: 'research-tools', instructions: '' }),
      saving: busy,
      createPublication: action,
      closeCreateServiceDialog: close
    }
  if (key === 'remainingMarketplace')
    return {
      sourceType: signal('github'),
      sourceName: signal('Team plugins'),
      sourceUrl: signal('xpert-ai/plugin-registry'),
      sourceRef: signal('main'),
      sourceSparsePath: signal(''),
      sourceAddError: () => '',
      sourceAdding: busy,
      confirmAddSource: action
    }
  if (key === 'remainingMove') {
    const search = signal(''),
      selected = signal(null)
    const folders = [
      { id: 'reports', name: 'Reports', path: '/Reports', depth: 0 },
      { id: '2026', name: '2026', path: '/Reports/2026', depth: 1 }
    ]
    return {
      selectionModel: { selected: ['one', 'two'] },
      closeMoveSelectedDialog: close,
      moveFolderSearch: search,
      moveTargetFolderId: selected,
      moveFolderLoading: () => false,
      filteredMoveFolderOptions: computed(() =>
        folders.filter((item) => item.path.toLowerCase().includes(search().toLowerCase()))
      ),
      moveDestinationChanged: () => !!selected(),
      movingSelectedDocuments: busy,
      moveSelectedDocuments: action
    }
  }
  if (key === 'remainingMetadata') {
    const schema = signal([{ key: 'department', type: 'string', scope: 'document', description: 'Owning department' }])
    const update = (i, key, value) =>
      schema.update((items) => items.map((item, index) => (index === i ? { ...item, [key]: value } : item)))
    return {
      isLoading: busy,
      metadataSchema: schema,
      STANDARD_METADATA_FIELDS: [],
      METADATA_FIELD_TYPES: ['string', 'number', 'enum', 'datetime'],
      addMetadataField: () => schema.update((items) => [...items, { key: '', type: 'string', scope: 'document' }]),
      removeMetadata: (i) => schema.update((items) => items.filter((_, index) => index !== i)),
      updateMetadataField: update,
      updateMetadataType: (i, type) => update(i, 'type', type),
      updateMetadataEnumValues: (i, value) => update(i, 'enumValues', value.split(',')),
      saveMetadataSchema: action
    }
  }
  if (key === 'remainingApiKeys')
    return {
      isWorkspaceBinding: () => true,
      subjectName: () => 'Research',
      showCloseButton: () => true,
      keys: () => [{ id: 'example', token: 'demo-preview-key', createdAt: '2026-10-11', lastUsedAt: null }],
      resolvedBindingType: () => 'workspace',
      resolvedBindingId: () => 'preview',
      loading: busy,
      createApiKey: action,
      copy: action,
      delete: action
    }
  if (key === 'remainingEmployee')
    return {
      data: { roles: [] },
      users: [],
      userOptions$: of([{ label: 'Alex · alex@example.com', value: 'alex' }]),
      loading: false,
      role: null,
      compareUsers: (a, b) => a === b,
      displayUser: (value) => String(value),
      onSearchTermChange: action,
      onUsersChange: action,
      onApply: action,
      cancel: close
    }
  if (key === 'remainingOrganization')
    return {
      searchTerm: signal(''),
      organizations: () => [organization],
      trackById: (_, item) => item.id,
      selectedOrganizationId: () => 'preview',
      selectedOrganization: () => organization,
      selectOrganization: action,
      cancel: close,
      apply: action
    }
  if (key === 'remainingAbout')
    return {
      xpert: {
        title: 'Research assistant',
        description: 'Find sources and prepare clear reports.',
        starters: ['Summarize a document', 'Compare research findings']
      },
      onStart: action
    }
  if (key === 'remainingMcpLegacy')
    return {
      steps: signal([0]),
      toolset: signal({ name: 'Research' }),
      mcpServer: signal({}),
      tools: signal([]),
      cancel: close,
      createTool: action
    }
  if (key === 'remainingRestart')
    return { state: () => 'error', error: () => 'The server is temporarily unavailable. Try again.', retry: action }
  if (key === 'remainingWizard') {
    const types = signal([wizardMode()]),
      startMode = signal('blank')
    return {
      eXpertTypeEnum: { Agent: 'agent', Knowledge: 'knowledge', Copilot: 'copilot' },
      eWorkflowNodeTypeEnum: { TRIGGER: 'trigger' },
      workflowMode: 'workflow',
      types,
      availableModes: () => ['agent', 'workflow', 'knowledge', 'copilot'],
      isModeDisabled: () => false,
      isAgentType: () => types()[0] === 'agent',
      isWorkflowType: () => types()[0] === 'workflow',
      isKnowledgeType: () => types()[0] === 'knowledge',
      startMode,
      setStartMode: (mode) => startMode.set(mode),
      lockStartMode: false,
      completionMode: 'create',
      skipTemplateSelectionStep: false,
      agentInitialStepIndex: 0,
      agentBasicStepIndex: () => 1,
      agentModelProviderStepIndex: () => -1,
      agentTriggerStepIndex: () => 2,
      agentSkillStepIndex: () => 4,
      agentToolsetStepIndex: () => -1,
      agentLastStepIndex: () => 4,
      allowWorkspaceSelection: true,
      workspaceId: signal('preview'),
      workspaceOptions: () => [{ value: 'preview', label: 'Research workspace' }],
      noAvailableWorkspaces: () => false,
      workspaceSelectionInvalid: () => false,
      refreshWorkspaces: action,
      name: signal('Research assistant'),
      title: signal('Research assistant'),
      description: signal('Find sources and prepare reports.'),
      avatar: signal({}),
      copilotModel: signal(null),
      isolateWorkspaceData: signal(false),
      loading: busy,
      needsModelProviderSetup: () => false,
      checkingModelProviders: () => false,
      canConfigureModelProvider: () => false,
      showClawModelProviderForm: () => false,
      primaryCopilot: () => null,
      enablingPrimaryCopilot: () => false,
      modelProviderLoadError: () => null,
      selectedTriggers: signal([]),
      selectedKnowledgeTriggers: signal([]),
      triggerProviderOptions: () => [],
      selectedTriggersInvalid: () => false,
      selectedKnowledgeTriggersInvalid: () => false,
      selectedTemplateDraft: () => null,
      selectedTemplateId: signal(null),
      templateCategory: null,
      templateChoices: () => [],
      supportsTemplateStart: () => true,
      templateLoading: () => false,
      templateLoadError: () => null,
      templateOptionsLoading: () => false,
      templateOptionsError: () => null,
      hasTemplateToolsetStep: () => false,
      installingSkillPackage: busy,
      templatePluginSkillInstallError: () => null,
      templateToolsetInstallError: () => null,
      templateToolsetsStepInvalid: () => false,
      startStepInvalid: () => false,
      basicStepInvalid: () => false,
      modelProviderStepInvalid: () => false,
      clawModelProviderSaveDisabled: () => false,
      saveClawModelProviderStep: action,
      directCreateDisabled: () => false,
      canCreateDirectly: () => false,
      create: action,
      createDirectly: action,
      onAgentStepChange: () => {},
      selectedMiddlewares: signal([]),
      middlewareSearch: signal(''),
      middlewareProviderOptions: () => [],
      filteredMiddlewareProviderOptions: () => [],
      isMiddlewareRequired: () => true,
      toggleMiddleware: action,
      toggleMiddlewareRequired: action,
      usesWorkspaceSkillDefaults: () => false,
      skillState: () => ({ loading: false, skills: [], errorMessage: null }),
      selectedSkills: () => [],
      selectedSkillItems: () => [],
      openSkillInstallDialog: action,
      removeSkill: action,
      toggleSkill: action,
      loadingTemplateToolsets: () => false,
      configuringTemplateToolsetKey: () => null,
      templateToolsetSelectionStates: () => [],
      getSelectedTemplateToolset: () => null,
      refreshTemplateToolsetStep: action,
      configureTemplateToolset: action,
      selectTemplateToolsetValue: action,
      workflowActionNodeOptions: [],
      workflowTransformNodeOptions: [],
      selectedWorkflowNodes: signal([]),
      toggleWorkflowNode: action,
      dataSourceProviderOptions: () => [],
      processorProviderOptions: () => [],
      chunkerProviderOptions: () => [],
      understandingProviderOptions: () => [],
      selectedDataSources: signal([]),
      selectedProcessors: signal([]),
      selectedChunkers: signal([]),
      selectedUnderstandings: signal([]),
      toggleDataSource: action,
      toggleProcessor: action,
      toggleChunker: action,
      toggleUnderstanding: action
    }
  }
  throw new Error(`Unknown remaining scene ${key}`)
}
