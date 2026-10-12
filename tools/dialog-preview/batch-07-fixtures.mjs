import { computed, signal } from '@angular/core'
import { formOf } from './batch-04-fixtures.mjs'
export function batchSevenFixture(scene, busy, notify, close) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = { loading: busy, cancel: close, apply: noop, save: noop }
  if (scene === 'chatApp') {
    const enabled = signal(true),
      integration = signal('example')
    return {
      ...common,
      public: false,
      enterpriseH5Platforms: [
        {
          platform: 'dingtalk',
          appLabel: { key: 'XP.Xpert.DingTalkApp', default: 'DingTalk app' },
          integrationPlaceholder: { key: 'XP.Xpert.SelectIntegration', default: 'Select an integration' },
          hint: { key: 'XP.Xpert.IntegrationHint', default: 'Select the integration used to authorize access.' }
        }
      ],
      isEnterpriseH5Enabled: enabled,
      setEnterpriseH5Enabled: (_, value) => enabled.set(value),
      getEnterpriseH5IntegrationId: integration,
      setEnterpriseH5IntegrationId: (_, value) => integration.set(value),
      canApply: () => !enabled() || !!integration()
    }
  }
  if (scene === 'embedded') {
    const selectedType = signal('iframe')
    return {
      ...common,
      selectedType,
      types: ['iframe', 'scripts', 'chromeplugin'].map((value) => ({ value, image: value + '-option.svg' })),
      app: computed(() => ({
        caption:
          selectedType() === 'chromeplugin'
            ? '即将推出 / Coming soon'
            : '将此代码添加到网站。 / Add this code to your website.',
        code:
          selectedType() === 'iframe'
            ? '<iframe\n src="https://example.invalid/x-chatkit/x/research"\n style="width: 100%; height: 100%; min-height: 700px"\n allow="microphone">\n</iframe>'
            : '<script src="https://example.invalid/assets/embed.min.js" defer></script>'
      })),
      copy: noop
    }
  }
  if (scene === 'workspaceSettings') {
    const selectedMenus = signal(['general'])
    return {
      ...common,
      selectedMenus,
      menu: computed(() => selectedMenus()[0]),
      workspace: () => ({ id: 'example', name: '研究与协作工作空间' }),
      workspaceId: () => 'example',
      apiKeyBindingType: { WORKSPACE: 'workspace' },
      onDeleted: noop,
      onArchived: noop,
      onUpdated: noop
    }
  }
  if (scene === 'toolCreate')
    return {
      ...common,
      providerTypes: signal(['openapi']),
      configure: () => ({ isValid: () => true }),
      onValueChange: noop,
      createTool: noop
    }
  if (scene === 'projectManage')
    return {
      ...common,
      eModelType: { LLM: 'llm' },
      primaryCopilot: () => 'preview',
      copilotModel: signal('preview'),
      project: () => ({ id: 'example' }),
      integrationId: signal('example'),
      saveProject: noop,
      connectIntegration: noop,
      deleteProject: noop
    }
  if (scene === 'skillInstall') {
    const workspace = signal('example')
    return {
      ...common,
      item: { name: 'Research assistant' },
      workspace,
      workspaceOptions: () => [{ value: 'example', label: '研究与协作工作空间' }],
      workspaces: () => [{ id: 'example' }],
      selectWorkspace: (value) => workspace.set(value),
      install: noop
    }
  }
  if (scene === 'skillRepositoryIndex')
    return {
      ...common,
      repository: () => ({ id: 'example', name: '团队技能仓库', lastSyncAt: '2026-10-11T05:30:00Z' }),
      mode: signal('incremental'),
      canUploadPackages: true,
      loadingIndexes: () => false,
      indexes: () => [],
      openUploadDialog: noop,
      reloadIndexes: noop
    }
  if (scene === 'publishChannels') {
    const selected = signal({ id: 'example', name: 'Research assistant', provider: 'dingtalk' }),
      form = formOf({ name: 'Research assistant', description: '团队知识问答', options: {} })
    form.markAsDirty()
    return {
      ...common,
      integration: selected,
      selectedIntegrations: computed(() => (selected() ? [selected()] : [])),
      integrations: () => [{ id: 'example', name: 'Research assistant', provider: 'dingtalk' }],
      providers: () => [{ name: 'dingtalk', label: 'DingTalk' }],
      selectIntegration: (item) => selected.set(item),
      addIntegration: noop,
      updateIntegration: noop,
      integrationForm: () => ({ formGroup: form }),
      saveSelectedIntegration: noop,
      remove: noop,
      cancel: () => selected.set(null)
    }
  }
  if (scene === 'aiProviders')
    return {
      ...common,
      refreshing: busy,
      busy,
      refreshProviders: noop,
      aiProviders: () => [
        {
          provider: 'openai',
          label: 'OpenAI',
          description: 'Chat models for research, code and multimodal tasks.',
          supported_model_types: ['llm', 'text-embedding'],
          provider_credential_schema: []
        },
        {
          provider: 'local',
          label: 'Local models',
          description: '连接团队部署的模型服务。',
          supported_model_types: ['llm']
        },
        {
          provider: 'community',
          label: 'Community provider',
          description: 'Add support for another provider.',
          supported_model_types: ['llm'],
          not_implemented: true
        }
      ],
      helpBaseUrl: () => 'https://xpert.ai',
      openSetup: noop,
      addProvider: noop
    }
  if (scene === 'conversationFiles')
    return { ...common, conversation: { id: 'example', title: '研究项目 · 会话文件' }, loadFiles: noop, loadFile: noop }
  return common
}
