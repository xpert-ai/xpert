import { signal, computed } from '@angular/core'
import { FormGroup, FormControl, FormArray, Validators } from '@angular/forms'
import {
  SETTINGS_SECTIONS,
  SETTINGS_BLOCKS
} from '../../apps/cloud/src/app/features/setting/assistant/assistant-settings.data.ts'
const formOf = (fields) =>
  new FormGroup(Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, new FormControl(value)])))
export function batchNineFixture(scene, busy, notify, close) {
  const noop = () => notify('预览操作，不会提交业务数据'),
    common = { loading: busy, close, save: noop, submit: noop, cancel: close }
  if (scene === 'mcpManage') {
    const tools = [
        {
          name: 'search',
          description: 'Search the team knowledge base and return cited results.',
          schema: { parameters: [{ name: 'query', type: 'text' }] }
        }
      ],
      selected = signal(null)
    return {
      ...common,
      avatar: signal(null),
      name: signal('Research MCP'),
      description: signal('Connect team knowledge and research tools.'),
      tags: signal([]),
      privacyPolicy: signal(''),
      customDisclaimer: signal(''),
      eTagCategoryEnum: { TOOLSET: 'toolset' },
      tools: () => tools,
      tool: () => tools.find((t) => t.name === selected()),
      selectedTool: selected,
      selectTool: (t) => selected.set(t?.name),
      disableToolDefault: signal(false),
      atLeastOne: () => true,
      toolset: () => ({ id: 'preview', name: 'Research MCP' }),
      canSave: () => true,
      toolsDirty: () => true,
      dirty: () => true,
      deleteToolset: noop,
      upsertToolset: noop,
      updateTool: noop,
      workspaceId: () => 'preview',
      environment: () => [],
      mcpServer: signal({}),
      updateMcpServer: noop,
      onToolsChange: noop,
      capabilityLoading: busy,
      capabilityError: () => null,
      capabilityServers: () => [],
      discoverCapabilities: noop,
      saveParametersAsDefault: noop
    }
  }
  if (scene === 'pluginResources') {
    const components = [
        { componentKey: 'research-search', componentType: 'mcp', sourcePath: 'mcp/search' },
        { componentKey: 'report-writer', componentType: 'skill', sourcePath: 'skills/report' }
      ],
      selectedKeys = signal(components.map((c) => c.componentKey))
    return {
      ...common,
      plugin: () => ({ name: 'Research tools', meta: { displayName: 'Research tools' } }),
      availableInstallModes: ['workspace', 'xpert'],
      installMode: signal('workspace'),
      isInstallModeAvailable: (m) => m !== 'organization',
      workspaceLoading: () => false,
      workspaceError: () => null,
      workspaces: () => [{ id: 'preview', name: 'Research workspace' }],
      workspaceLabel: (w) => w.name,
      selectedWorkspaceId: signal('preview'),
      xpertLoading: () => false,
      xpertError: () => null,
      xperts: () => [{ id: 'assistant', name: 'Research assistant' }],
      xpertLabel: (x) => x.name,
      selectedXpertId: signal('assistant'),
      selectedAgentKey: signal('main'),
      agentOptionsForSelectedXpert: () => [{ key: 'main', label: 'Main agent' }],
      componentsLoading: () => false,
      componentStatesLoading: () => false,
      componentStatesError: () => null,
      resourceLoading: () => false,
      resourceError: () => null,
      components: () => components,
      targetComponents: () => components,
      installableComponents: () => components,
      groupedComponents: () => [{ type: 'mcp', labelKey: 'XP.MCP.Tools', defaultLabel: 'Tools', items: components }],
      componentTypeBadge: (c) => ({ labelKey: c.componentType, defaultLabel: c.componentType }),
      isSelected: (c) => selectedKeys().includes(c.componentKey),
      selectedKeys,
      onComponentCheckedChange: (c, e) =>
        selectedKeys.update((v) => (e.target.checked ? [...v, c.componentKey] : v.filter((k) => k !== c.componentKey))),
      selectAllInstallable: () => selectedKeys.set(components.map((c) => c.componentKey)),
      clearSelection: () => selectedKeys.set([]),
      isInstalled: () => false,
      isInstalledCurrent: () => false,
      isUpdateAvailable: () => false,
      isPendingAuth: () => false,
      submitting: busy,
      actionError: () => null,
      resultSummary: () => null,
      canSubmit: () => !!selectedKeys().length && !busy()
    }
  }
  if (scene === 'xpertBasic') {
    const form = formOf({
      avatar: null,
      title: 'Research assistant',
      description: 'Find sources and create a well-supported report.',
      tags: [],
      copilotModel: 'preview'
    })
    form.markAsDirty()
    return {
      ...common,
      form,
      name: 'research-assistant',
      eTagCategoryEnum: { XPERT: 'xpert' },
      eModelType: { LLM: 'llm' },
      allowedModels: new FormArray([]),
      eXpertTypeEnum: { Agent: 'agent' },
      type: () => 'agent',
      workspaceDataScope: () => 'user',
      addAllowedModel: noop,
      dropAllowedModel: noop,
      saveDraft: noop
    }
  }
  if (scene === 'knowledgeNew') {
    const activeSection = signal('basic'),
      wikiEnabled = signal(false),
      graphEnabled = signal(false),
      type = signal('standard')
    return {
      ...common,
      i18nPrefix: 'XP.Knowledgebase.WorkspaceConfiguration',
      isEditMode: () => false,
      activeSection,
      selectSection: (v) => activeSection.set(v),
      groupedSections: () => [
        {
          group: 'Basic',
          items: [
            { key: 'basic', labelKey: 'Sections.Basic', icon: 'ri-settings-line', status: 'supported' },
            { key: 'models', labelKey: 'Sections.Models', icon: 'ri-robot-line', status: 'supported' },
            { key: 'storage', labelKey: 'Sections.Storage', icon: 'ri-hard-drive-line', status: 'preview' }
          ]
        }
      ],
      sectionStatusKey: () => 'XP.Knowledgebase.WorkspaceConfiguration.Statuses.Preview',
      type,
      KnowledgebaseTypeEnum: { Standard: 'standard', FAQ: 'faq' },
      isFAQ: () => type() === 'faq',
      isWiki: wikiEnabled,
      wikiEnabled,
      graphEnabled,
      toggleWiki: () => wikiEnabled.update((v) => !v),
      toggleGraph: () => graphEnabled.update((v) => !v),
      indexStrategyLocked: () => false,
      name: signal('Team knowledge'),
      description: signal('Policies, research notes and product documentation.'),
      avatar: signal(null),
      validation: () => ({}),
      copilotModel: signal(null),
      visionModel: signal(null),
      wikiModel: signal(null),
      eAiModelTypeEnum: { TEXT_EMBEDDING: 'embedding', LLM: 'llm' },
      config: () => ({}),
      wikiConfig: () => ({ extractionGranularity: 'standard', contentGenerationRequirements: '', extractionFocus: '' }),
      updateWikiConfig: noop,
      faqConfig: () => ({ indexMode: 'question_only', questionIndexMode: 'combined', negativeMatchMode: 'exact' }),
      updateFAQConfig: noop,
      faqConfigurationDisabled: () => false,
      processing: { strategiesLoading: () => false },
      previewOpen: signal(false),
      vectorStoreOptions: () => ({ default: 'pgvector', stores: [] }),
      vectorStore: signal('pgvector'),
      workspaceId: () => 'preview',
      keywordAnalyzerLocked: () => false
    }
  }
  if (scene === 'documentImport') {
    const section = signal('tags'),
      sections = [
        { id: 'tags', key: 'Tags', icon: 'ri-price-tag-line', available: true },
        { id: 'chunks', key: 'Chunks', icon: 'ri-file-text-line', available: false }
      ],
      selectedTagIds = signal(['research']),
      tagSearch = signal('')
    return {
      ...common,
      busy,
      prefix: 'XP.Knowledgebase.Import',
      titleKey: 'XP.Knowledgebase.Import.Title',
      total: () => 2,
      pipelineDocument: null,
      editing: false,
      data: { knowledgebase: {}, locked: () => false },
      selectedFolder: signal(null),
      selectFolder: noop,
      folderTree: () => [],
      foldersLoading: () => false,
      folderError: () => null,
      loadFolders: noop,
      uploads: () => [],
      documents: () => [
        { id: 'one', name: 'research-notes.pdf' },
        { id: 'two', name: 'team-handbook.md' }
      ],
      externalDocuments: () => [
        { id: 'one', name: 'research-notes.pdf' },
        { id: 'two', name: 'team-handbook.md' }
      ],
      removeExternal: noop,
      sections,
      section,
      activeSection: () => sections.find((s) => s.id === section()),
      activeParserConfig: () => ({}),
      processing: { questionGenerationEnabled: () => false, config: () => ({}) },
      processingSection: () => 'chunks',
      chunkSize: () => 1024,
      tagSearch,
      clearTags: () => selectedTagIds.set([]),
      tagsLoading: () => false,
      tagsError: () => null,
      loadTags: noop,
      tagsEditable: () => true,
      selectedTagIds,
      tagOptions: () => [
        { id: 'research', name: 'Research' },
        { id: 'team', name: 'Team' }
      ],
      filteredTags: () =>
        [
          { id: 'research', name: 'Research' },
          { id: 'team', name: 'Team' }
        ].filter((t) => t.name.toLowerCase().includes(tagSearch().toLowerCase())),
      toggleTag: (id) => selectedTagIds.update((v) => (v.includes(id) ? v.filter((i) => i !== id) : [...v, id])),
      onlySheet: () => false,
      documentsWithParserConfig: () => [],
      pendingDocuments: () => [],
      configurationError: () => null,
      error: () => null,
      ready: () => !busy(),
      addFiles: noop
    }
  }
  if (scene === 'documentSource') {
    const results = signal([]),
      selected = signal(new Set()),
      form = formOf({ url: 'https://example.com/knowledge' })
    return {
      ...common,
      mode: 'url',
      prefix: 'XP.Knowledgebase.Import',
      title: () => 'XP.Knowledgebase.Import.Url',
      form,
      busy,
      loadingSchema: () => false,
      error: () => null,
      results,
      selected,
      toggle: (i, v) =>
        selected.update((old) => {
          const next = new Set(old)
          v ? next.add(i) : next.delete(i)
          return next
        }),
      load: () => {
        results.set([{ name: 'Team knowledge overview' }, { name: 'Getting started' }])
        selected.set(new Set([0]))
      },
      confirm: noop
    }
  }
  if (scene === 'emailTemplate')
    return {
      ...common,
      languageCode: signal('zh-Hans'),
      templateNames: () => [
        { key: 'welcome', caption: 'Welcome' },
        { key: 'invite', caption: 'Invitation' }
      ],
      name: signal('welcome'),
      create: noop,
      closeNewTemplate: close
    }
  if (scene === 'capabilityPicker') {
    const kind = signal('skill'),
      search = signal(''),
      chosen = signal(false)
    return {
      ...common,
      eligibleExperts: () => [{ id: 'preview', title: 'Research assistant' }],
      expertId: signal('preview'),
      selectExpert: noop,
      kinds: ['skill', 'subAgent', 'connector'],
      kind,
      search,
      activeCatalog: () => ({ loading: busy() }),
      catalogError: () => null,
      visibleOptions: () => [
        {
          kind: kind(),
          id: 'research',
          label: 'Research sources',
          description: 'Search trusted sources and summarize the results.'
        }
      ],
      isSelected: () => chosen(),
      toggle: () => chosen.update((v) => !v),
      disabled: () => false,
      load: noop
    }
  }
  if (scene === 'assistantSettings' || scene === 'assistantMemory') {
    const activeSection = signal('memory'),
      sheet = signal('ManageMemory'),
      form = formOf({ GenerateMemory: true, ManageMemory: '' })
    return {
      ...common,
      activeSection,
      sections: SETTINGS_SECTIONS,
      blocks: SETTINGS_BLOCKS,
      selectSection: (k) => activeSection.set(k),
      get title() {
        return SETTINGS_SECTIONS.find((s) => s.key === activeSection()).title
      },
      notice: () => null,
      form,
      openSheet: noop,
      closeSettings: close,
      sheet,
      sheetInput: new FormControl('Prefer concise summaries with source links.'),
      closeSheet: close,
      finishSheet: noop
    }
  }
}
