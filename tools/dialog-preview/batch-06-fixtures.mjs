import { computed, signal } from '@angular/core'
import { formOf } from './batch-04-fixtures.mjs'
export function batchSixFixture(scene, busy, notify, close) {
  const noop = () => notify('预览操作，不会提交业务数据')
  const common = { loading: busy, cancel: close, apply: noop, save: noop, error: () => '' }
  const authTypes = { NONE: 'none', BASIC: 'basic', API_KEY: 'api_key' }
  if (scene === 'mcpImport') {
    const value = signal(JSON.stringify({ mcpServers: { research: { url: 'https://example.invalid/sse' } } }, null, 2))
    return { ...common, value, updateValue: (text) => value.set(text), importJson: noop }
  }
  if (scene === 'toolAuth') {
    const formGroup = formOf({
      auth_type: ['api_key'],
      api_key_header_prefix: ['custom'],
      api_key_header: 'X-API-Key',
      api_key_value: 'preview-key',
      username: '',
      password: ''
    })
    return { ...common, formGroup, eApiProviderAuthType: authTypes }
  }
  if (scene === 'workflowAuth')
    return {
      ...common,
      eApiProviderAuthType: authTypes,
      authType: signal('api_key'),
      api_key_type: signal('custom'),
      api_key_header: signal('X-API-Key'),
      api_key_value: signal('{{environment.API_KEY}}'),
      username: signal(''),
      password: signal(''),
      variables: () => [],
      AuthSelectOptions: [
        { value: 'none', label: 'None' },
        { value: 'api_key', label: 'API Key' },
        { value: 'basic', label: 'Basic' }
      ],
      PrefixSelectOptions: [
        { value: '', label: 'Basic' },
        { value: 'bearer', label: 'Bearer' },
        { value: 'custom', label: 'Custom' }
      ]
    }
  if (scene === 'memoryImport') {
    const file = signal(null)
    return {
      ...common,
      file,
      type: () => 'qa',
      eLongTermMemoryTypeEnum: { QA: 'qa', PROFILE: 'profile' },
      onFileDropped: noop,
      onFileSelected: (event) => file.set(event.target.files?.[0]),
      downloadTemplate: noop,
      upload: noop
    }
  }
  if (scene === 'knowledgeReference')
    return {
      ...common,
      selected: signal(['research']),
      knowledgebases: () => [
        { id: 'research', name: '团队研究与协作知识库' },
        { id: 'products', name: '产品操作指南与常见问题 · Product documentation' },
        { id: 'support', name: '客户支持参考资料' }
      ]
    }
  if (scene === 'database') {
    const searchTerm = signal(''),
      selectedNav = signal('all'),
      selectedOwner = signal('all'),
      selectedOrder = signal('createdAt')
    const tables = [
      {
        id: 'projects',
        name: 'Project research notes',
        description: '团队研究项目、分析结果与引用来源。',
        database: 'workspace',
        schema: 'public'
      },
      {
        id: 'tasks',
        name: 'Task activity',
        description: '工作流执行状态与审阅记录。',
        database: 'workspace',
        schema: 'public'
      }
    ]
    const navItems = [
      { value: 'all', label: 'All Databases', icon: 'ri-database-2-line' },
      {
        value: 'workspace',
        label: 'Workspace Databases',
        icon: 'ri-archive-stack-line',
        description: 'Databases from the current workspace'
      }
    ]
    const ownerOptions = [
        { value: 'all', label: 'Everyone' },
        { value: 'me', label: 'Created by me' }
      ],
      orderOptions = [
        { value: 'createdAt', label: 'Created time' },
        { value: 'updatedAt', label: 'Updated time' },
        { value: 'name', label: 'Name' }
      ]
    return {
      ...common,
      title: () => 'Select Database',
      description: () => 'Select a database resource to connect',
      searchTerm,
      selectedNav,
      selectedOwner,
      selectedOrder,
      navItems: () => navItems,
      ownerOptions: () => ownerOptions,
      orderOptions: () => orderOptions,
      selectedCollectionLabel: computed(() => navItems.find((x) => x.value === selectedNav()).label),
      selectedOwnerLabel: computed(() => ownerOptions.find((x) => x.value === selectedOwner()).label),
      selectedOrderLabel: computed(() => orderOptions.find((x) => x.value === selectedOrder()).label),
      filteredDatabases: computed(() =>
        tables.filter((t) => t.name.toLowerCase().includes(searchTerm().toLowerCase()))
      ),
      updateSearch: (value) => searchTerm.set(value),
      selectNav: (value) => selectedNav.set(value),
      pickOwner: (value) => selectedOwner.set(value),
      pickOrder: (value) => selectedOrder.set(value),
      requestCreate: noop,
      requestRefresh: noop,
      requestLoadMore: noop,
      hasMore: () => true,
      emptyHint: () => 'No more items',
      selectDatabase: noop,
      trackByTable: (_, table) => table.id
    }
  }
  if (scene === 'mcpTest' || scene === 'toolTest')
    return {
      ...common,
      tool: () => ({
        name: scene === 'mcpTest' ? 'MCP · Search research notes' : '查询项目资料 · Search project documents'
      }),
      enableAuthorization: () => true,
      credentials: signal({ auth_type: 'api_key' })
    }
  if (scene === 'environments') {
    const environments = signal([
      {
        id: 'dev',
        name: 'Development',
        isDefault: true,
        variables: [
          { name: 'API_ENDPOINT', type: 'default', value: 'https://example.invalid' },
          { name: 'API_KEY', type: 'secret', value: 'preview-secret' }
        ]
      },
      { id: 'prod', name: 'Production', variables: [] }
    ])
    const selected = signal('dev'),
      dirty = signal(false)
    const environment = computed(() => environments().find((e) => e.id === selected()))
    const update = (fn) => {
      environments.update((list) => list.map((env) => (env.id === selected() ? fn(env) : env)))
      dirty.set(true)
    }
    const editing = signal(false),
      environmentName = signal('')
    return {
      ...common,
      environments,
      environment,
      dirty,
      editing,
      environmentName,
      VariableTypeOptions: [
        { value: 'default', label: 'Default' },
        { value: 'secret', label: 'Secret' }
      ],
      setEnvironment: (env) => selected.set(env.id),
      setDefault: noop,
      addEnvironment: noop,
      addVar: () =>
        update((env) => ({ ...env, variables: [...env.variables, { name: '', type: 'default', value: '' }] })),
      updateVar: (index, value) =>
        update((env) => ({ ...env, variables: env.variables.map((v, i) => (i === index ? { ...v, ...value } : v)) })),
      removeVar: (index) => update((env) => ({ ...env, variables: env.variables.filter((_, i) => i !== index) })),
      onKeyDown: (event) => {
        if (event.key === 'Enter') {
          update((env) => ({ ...env, name: environmentName() }))
          editing.set(false)
        }
        if (event.key === 'Escape') {
          event.stopPropagation()
          editing.set(false)
        }
      },
      delete: noop
    }
  }
  if (scene === 'pluginConfigure')
    return {
      ...common,
      plugin: () => ({ name: 'Example Plugin', meta: { displayName: 'Research connector' } }),
      needsConfiguration: () => true,
      configurationError: () => '',
      schema: () => ({ type: 'object' }),
      config: signal({ endpoint: 'https://example.invalid', api_key: '' }),
      saving: busy,
      invalid: busy
    }
  return common
}
