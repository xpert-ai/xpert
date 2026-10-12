import { signal } from '@angular/core'

export function fixtureFor(scene, busy, notify) {
  const noop = () => notify('预览操作，不会提交业务数据')
  if (scene === 'setup')
    return {
      llmCopilots: signal([]),
      hasSelectedCopilotModel: () => true,
      defaultCopilotModelLabel: () => 'GPT-4.1',
      enablingPrimaryCopilot: () => false,
      isolateWorkspaceData: signal(false),
      hasCopilotFeature: () => true,
      recommendedTemplateItems: () => [
        {
          template: {
            id: 'a',
            title: '数据分析助手',
            category: '分析与洞察',
            description: '理解业务数据，生成分析报告与可视化。'
          }
        },
        {
          template: {
            id: 'b',
            title: '知识问答助手',
            category: '团队知识',
            description: '连接企业知识库，协助团队检索与整理信息。'
          }
        }
      ],
      recommendedTemplateCardClass: () => 'relative min-w-0 rounded-xl border border-divider-regular p-4',
      isRecommendedTemplateSelected: () => false,
      setRecommendedTemplateSelected: noop,
      creatingXpert: busy,
      canCreateXpert: () => true,
      initializationError: () => null,
      initializationStatus: () => null,
      hasLoadedLlmModelProviders: () => true,
      selectedRecommendedTemplateCount: () => 0,
      modelProviderSaveDisabled: () => false,
      savingModelProvider: busy,
      completeInitialization: noop,
      saveModelProvider: noop
    }
  if (scene === 'members')
    return {
      data: { canTransferOwnership: true, canInviteOrganizationMembers: true },
      members: () => [
        { id: 'one', fullName: '林晓', email: 'lin@example.com', projectRole: 'owner' },
        { id: 'two', fullName: '陈远', email: 'chen@example.com', projectRole: 'editor' }
      ],
      displayUser: (u) => u.fullName || u.email,
      roles: ['manager', 'editor', 'member'],
      roleLabel: (r) => `XP.XProject.Role${r[0].toUpperCase()}${r.slice(1)}`,
      availableUsers: () => [{ id: 'three', fullName: '周宁', email: 'zhou@example.com' }],
      selectedUserId: signal('three'),
      selectedRole: signal('member'),
      inviteEmail: signal(''),
      inviteRole: signal('member'),
      pendingInvitations: () => [],
      busy,
      add: noop,
      remove: noop,
      transferOwnership: noop,
      changeRole: noop,
      invite: noop,
      revoke: noop,
      selectUser: noop,
      selectRole: noop,
      selectInviteRole: noop
    }
  if (scene === 'upload') {
    const files = signal([{ name: 'business-analysis.zip' }, { name: 'team-knowledge.zip' }])
    return {
      files,
      loading: busy,
      fileTrackBy: (i, f) => f.name + i,
      openFilePicker: noop,
      onFileChange: noop,
      removeFile: (i) => files.update((list) => list.filter((_, idx) => idx !== i)),
      upload: noop
    }
  }
  if (scene === 'confirm')
    return {
      title: () => '确认删除',
      value: () => '示例资源',
      information: () => '删除后，该资源及其关联配置将无法恢复。\n请确认是否继续。'
    }
  if (scene === 'registry') {
    const item = { id: 'demo', displayName: '业务分析工具', packageName: '@xpert-ai/business-analysis' }
    return {
      registryItems: () => [
        item,
        { id: 'another', displayName: '知识库连接器', packageName: '@xpert-ai/knowledge-tools' }
      ],
      registryEditingId: signal('demo'),
      registryLoading: () => false,
      registryDeleting: () => null,
      registrySaving: busy,
      registrySaveDisabled: () => busy(),
      selectedRegistryItem: () => item,
      registryFormSubmitted: () => false,
      registryTargetAppsMissing: () => false,
      registryTargetAppMetaInvalid: () => false,
      registryFormError: () => null,
      registryFormInvalid: () => false,
      registryRequiredFieldsMissing: () => false,
      registryCategoryOptions: ['developer-tools'],
      registrySectionOptions: ['featured', 'all'],
      registryPackageName: signal(item.packageName),
      registryVersion: signal('1.0.0'),
      registryDisplayName: signal('Business Analysis'),
      registryDisplayNameZhHans: signal('业务分析工具'),
      registryAuthor: signal('Xpert'),
      registryCategory: signal('developer-tools'),
      registrySection: signal('featured'),
      registryTargetApps: signal('xpert'),
      registryIcon: signal(''),
      registryKeywords: signal('analysis, reports'),
      registryDescription: signal('Business analytics and reporting for your team.'),
      registryDescriptionZhHans: signal('为团队提供业务分析与报告能力。'),
      registryHomepage: signal(''),
      registryPriority: signal(10),
      registryEnabled: signal(true),
      registryTargetAppMetaJson: signal('{\n  "xpert": { "types": ["business-app"] }\n}'),
      resetRegistryForm: noop,
      editRegistryItem: noop,
      deleteRegistryItem: noop,
      saveRegistryItem: noop
    }
  }
  throw new Error(`Unknown scene: ${scene}`)
}
