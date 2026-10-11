import { signal } from '@angular/core'
import { FormControl, FormGroup, Validators } from '@angular/forms'
export function batchTwelveFixture(scene, busy, notify, close) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = { close, onClose: close, closeEditor: close, saving: busy }
  if (scene === 'countdown')
    return {
      ...common,
      recordType: 'Document parsing',
      isEnabled: true,
      countDownConfig: { leftTime: 10 },
      continue: noop,
      handleActionEvent: noop
    }
  if (scene === 'knowledgeTask')
    return {
      ...common,
      tasks: () => [
        { taskType: 'Parse document', createdAt: '2026-10-11', executionId: 'run-20261011', status: 'success' }
      ],
      executionId: signal(null),
      openExecution: noop,
      isLoading: busy
    }
  if (scene === 'skillInstallDialog')
    return {
      ...common,
      isProject: () => false,
      showGithubInstall: signal(false),
      toggleBoolean: (v) => !v,
      workspaceId: () => 'preview',
      selectedRepository: signal({ id: 'repo', name: 'Team skills' }),
      install: noop,
      onGithubInstalled: noop
    }
  if (scene === 'assistantPreferences') {
    const sections = [
      { key: 'general', group: 'Basic', icon: 'ri-settings-line' },
      { key: 'models', group: 'Basic', icon: 'ri-cpu-line' },
      { key: 'conversation', group: 'Experience', icon: 'ri-chat-1-line' },
      { key: 'workbench', group: 'Experience', icon: 'ri-layout-line' }
    ]
    const section = signal('general')
    const source = {
      id: 'preview',
      draft: () => ({ team: { name: 'Research assistant' } }),
      saving: busy,
      error: () => null,
      unsaved: () => true
    }
    const editor = {
      section,
      data: {},
      published: () => false,
      closing: () => false,
      composing: () => false,
      publishing: busy,
      savingDraft: () => false,
      invalidSections: () => [],
      confirmDiscard: signal(false),
      saveError: () => null,
      publishError: () => null,
      draftOnly: false
    }
    return {
      ...common,
      source,
      editor,
      groups: ['Basic', 'Experience'],
      groupSections: (g) => sections.filter((s) => s.group === g),
      sections: () => sections,
      filteredSections: () => sections,
      pendingSections: () => [],
      query: signal(''),
      select: (v) => section.set(v),
      selectFromMenu: (v) => section.set(v),
      visitedSections: () => new Set(),
      invalid: () => false,
      saveCurrent: noop,
      saveChanges: noop,
      continueEditing: noop,
      personalization: () => null
    }
  }
  if (scene === 'workbenchFile')
    return {
      ...common,
      file: { name: 'Research report.pdf', mimeType: 'application/pdf' },
      previewKind: () => 'pdf',
      previewTooLarge: () => false,
      previewUrl: () => '/assets/icon.png',
      evidence: () => null,
      previewContent: () => '',
      previewData: () => ({}),
      previewError: () => null,
      previewLoading: busy,
      spreadsheet: () => null,
      downloadFile: noop,
      openExternal: noop
    }
  if (scene === 'pluginDetail') {
    const skill = {
      type: 'skill',
      name: 'research',
      displayName: 'Research assistant',
      description: 'Find trusted sources and prepare a research report.'
    }
    const assistant = {
      type: 'assistant',
      name: 'analyst',
      displayName: 'Business analyst',
      description: 'Analyze documents and produce a business summary.'
    }
    return {
      ...common,
      plugin: () => ({
        displayName: 'Research toolkit',
        description: 'Tools, skills and templates for your workspace.',
        version: '1.4.0',
        installed: true
      }),
      showActions: true,
      trialCardBackgroundImage: () => null,
      contents: () => [skill, assistant],
      contentTypeIcon: () => 'ri-file-search-line',
      contentTypeBadgeClass: () => '',
      resourceContribution: (c) => (c === skill ? skill : null),
      isAssistantTemplate: (c) => c === assistant,
      initializeResource: noop,
      initializeAssistantTemplate: noop,
      openContentDetail: noop,
      appContents: () => [],
      mcpContents: () => [],
      selectedApp: () => null
    }
  }
  if (scene === 'automationDetail')
    return {
      ...common,
      openedTask: () => ({
        name: '每日研究简报',
        status: 'scheduled',
        updatedAt: '2026-10-11',
        scheduleDescription: 'Every weekday at 09:00',
        timeZone: 'Asia/Shanghai',
        prompt: 'Review the latest research and prepare a concise summary.',
        executionCount: 12
      }),
      eXpertTaskStatus: { SCHEDULED: 'scheduled', PAUSED: 'paused', ARCHIVED: 'archived' },
      closeTask: close,
      taskExecutionTotal: () => 12,
      taskSuccessRate: () => 100,
      taskLastExecution: () => null,
      historyConversations: () => [],
      taskDetailLoading: busy,
      editTask: noop,
      pauseTask: noop,
      runTask: noop,
      scheduleTask: noop
    }
  if (scene === 'automationTemplates')
    return {
      ...common,
      templatePickerOpen: { set: close },
      newTask: noop,
      automationTemplates: [
        {
          key: 'briefing',
          icon: 'ri-news-line',
          title: 'Daily briefing',
          titleKey: 'preview.briefing',
          description: 'Read the latest updates and prepare a daily summary.',
          descriptionKey: 'preview.description',
          options: { frequency: 'daily', time: '09:00' }
        },
        {
          key: 'report',
          icon: 'ri-file-chart-line',
          title: 'Weekly report',
          titleKey: 'preview.report',
          description: 'Summarize weekly progress and highlight next steps.',
          descriptionKey: 'preview.reportDescription',
          options: { frequency: 'weekly', time: '17:00' }
        }
      ]
    }
  return {
    ...common,
    editorMode: () => (scene === 'graphEntity' ? 'edit-entity' : 'edit-relation'),
    saveEditor: noop,
    entityForm: new FormGroup({
      name: new FormControl('Xpert', Validators.required),
      type: new FormControl('Organization', Validators.required),
      aliases: new FormControl('Xpert AI'),
      description: new FormControl('An organization represented in this knowledge graph.'),
      visibility: new FormControl('active')
    }),
    relationForm: new FormGroup({
      sourceEntityId: new FormControl('xpert', Validators.required),
      targetEntityId: new FormControl('project', Validators.required),
      type: new FormControl('DEVELOPS', Validators.required),
      weight: new FormControl(0.95),
      description: new FormControl('Xpert develops the assistant platform.'),
      visibility: new FormControl('active')
    }),
    visibilities: ['active', 'hidden'],
    entityOptions: () => [
      { id: 'xpert', name: 'Xpert' },
      { id: 'project', name: 'Assistant platform' }
    ]
  }
}
