import { signal, computed } from '@angular/core'
import { pipelineStep } from './batch-08-children.mjs'
export function batchEightFixture(scene, busy, notify, close) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = { loading: busy, close, cancel: close, save: noop }
  if (scene === 'skillDetail')
    return {
      ...common,
      item: {
        skillId: 'research-assistant',
        repository: { name: 'Team skills' },
        version: '1.2.0',
        license: 'MIT',
        updatedAt: '2026-10-11T06:00:00Z',
        tags: ['research', 'analysis'],
        stats: { stars: 128, downloads: 4200, versions: 6 }
      },
      featured: { badge: '精选 / Featured' },
      title: () => 'Research assistant',
      description: () => '搜索资料、归纳要点并生成可溯源报告。Search, summarize and produce a report with sources.',
      publisherName: () => 'Xpert community',
      publisherHandle: () => '@xpert-ai',
      publisherAvatarFallback: () => 'X',
      defaultWorkspaceName: 'Research workspace',
      formatStat: (value) => value,
      install: noop
    }
  if (scene === 'pluginSkillDetail')
    return {
      ...common,
      icon: () => null,
      titleValue: () => 'Research assistant',
      descriptionValue: () => 'Collect reliable sources and summarize key findings.',
      plugin: () => ({ installed: true }),
      documentLoading: () => false,
      documentError: () => null,
      document: () => ({
        sourcePath: 'skills/research/SKILL.md',
        content:
          'Research assistant\n\nCollect reliable sources, compare findings and produce a structured research summary.\n\nUse this skill when researching a topic or reviewing a document.'
      }),
      trialSubmitting: busy,
      normalizeMarkdownLinks: () => {},
      installToWorkspace: noop,
      tryInClawXpert: noop
    }
  if (scene === 'pluginInstall')
    return {
      ...common,
      systemPluginUnavailableInCurrentScope: () => false,
      installedVersion: () => null,
      pluginVersion: () => '1.2.0',
      status: computed(() => (busy() ? 'installing' : 'ready')),
      error: () => null,
      restartRequired: () => false,
      runtimeRestart: { showManualRestart: () => false, canRestart: () => true },
      plugin: () => ({ name: 'Research tools', description: 'Connect your team’s knowledge sources.' }),
      installed: () => null,
      install: noop,
      restartNow: noop
    }
  if (scene === 'builtinConfigure') {
    const authorizing = signal(false),
      toolset = signal({ id: 'preview', name: 'Research sources' })
    return {
      ...common,
      provider: () => ({
        name: 'research',
        label: 'Research tools',
        description: '搜索团队知识与公开资料。Search team knowledge and public sources.'
      }),
      avatar: () => null,
      authorizing,
      toolset,
      credentials: signal({}),
      workspaceId: () => 'preview',
      proEnv: true,
      pro: () => false,
      notImplemented: () => false,
      openAuthorize: () => authorizing.set(true),
      closeAuthorize: () => authorizing.set(false),
      toolsets: () => [],
      builtinTools: () => [
        { identity: { name: 'search', label: 'Search' }, description: 'Find information' },
        { identity: { name: 'fetch', label: 'Read source' }, description: 'Read source content' }
      ],
      getToolEnabled: () => true,
      setToolEnabled: noop,
      pvLoading: () => false,
      error: () => null,
      helpUrl: () => null,
      dirty: () => true,
      toolsetId: () => 'preview',
      atLeastOne: () => true
    }
  }
  if (scene === 'sandboxTaskFiles')
    return {
      ...common,
      files: () => [
        { filePath: 'reports/research-summary.md', createdAt: '2026-10-11T06:00:00Z' },
        { filePath: 'datasets/source-comparison.csv', createdAt: '2026-10-11T06:00:00Z' }
      ],
      preview: noop,
      download: noop
    }
  if (scene === 'sandboxConversationFiles')
    return { ...common, projectId: () => 'preview', conversationId: () => 'preview' }
  if (scene === 'projectInstall')
    return {
      ...common,
      avatar: signal(null),
      name: signal('Research team'),
      eModelType: { LLM: 'llm' },
      primaryCopilot: () => 'preview',
      copilotModel: signal('preview'),
      workspaceId: signal('preview'),
      workspaceOptions: () => [{ value: 'preview', label: 'Research workspace' }],
      refreshWorkspaceOptions: noop,
      createdProject: () => ({ id: 'preview', workspaceId: 'preview' }),
      createProject: noop,
      xperts: () => [{ slug: 'research', title: 'Research assistant' }],
      myXperts: () => [],
      createdXpert: noop,
      toolsets: () => [{ id: 'preview', name: 'Research tools' }],
      createdToolset: noop,
      done: noop
    }
  if (scene === 'publishVersion')
    return {
      ...common,
      version: () => '1.2',
      newVersion: signal(true),
      releaseNotes: signal('Improve research quality and add source verification.'),
      releaseNotesError: () => null,
      versions: () => [
        { id: 'latest', version: '1.2', latest: true, publishAt: '2026-10-11T06:00:00Z' },
        { id: 'old', version: '1.1', latest: false, publishAt: '2026-10-10T06:00:00Z' }
      ],
      setAsLatest: noop,
      deleteVer: noop,
      environments: () => [{ value: 'preview', label: 'Production' }],
      environmentId: signal('preview'),
      businessAreaOptions: () => [{ value: 'preview', label: 'Research' }],
      businessAreaId: signal('preview'),
      businessAreaLoadFailed: () => false,
      agentMarketplaceEnabled: () => false,
      publish: noop
    }
  if (scene === 'knowledgePipeline') {
    pipelineStep.set(1)
    return { ...common, submitting: busy, step: pipelineStep, taskId: () => 'preview', parserConfig: () => ({}) }
  }
  if (scene === 'scheduledTask')
    return {
      ...common,
      task: () => ({ id: 'preview' }),
      name: signal('Daily research summary'),
      connectorOnlyMode: () => false,
      options: signal({}),
      lockXpertSelection: () => false,
      xpert: () => ({ name: 'Research assistant', avatar: null }),
      canEditSelectedXpert: () => true,
      editXpert: noop,
      runtimeStateSchema: () => null,
      projectId: () => 'preview',
      connectorOptionsLoading: () => false,
      connectorOptions: () => [{ bindingId: 'preview', label: 'Team knowledge' }],
      selectedConnectorBindingIds: () => ['preview'],
      selectConnectorBindingIds: noop,
      isConnectorAvailable: () => true,
      canManagePersonalConnectors: () => true,
      prompt: signal('Summarize the latest findings and include source links.'),
      isTrialUser: () => false,
      isSubmitDisabled: busy,
      search: signal(''),
      filteredXperts: () => [{ id: 'preview', title: 'Research assistant' }],
      bindExpert: noop,
      createTask: noop
    }
  return common
}
