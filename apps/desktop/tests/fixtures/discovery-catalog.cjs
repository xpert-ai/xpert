const app = {
  id: 'meetings',
  name: 'Meetings',
  kind: 'applications',
  publisher: 'Xpert',
  description: 'Meeting notes',
  categories: [],
  tags: [],
  screenshots: [],
  icon: null,
  pluginName: 'meetings',
  appName: 'meetings',
  status: 'not_installed',
  botId: null,
  steps: [],
  summary: 'Meeting notes'
}
const expert = {
  id: 'expert',
  name: 'Meeting expert',
  kind: 'experts',
  publisher: 'Xpert',
  description: 'Expert',
  categories: [],
  tags: [],
  access: 'not_requested'
}
const library = {
  workspaceId: 'one',
  workspaces: [
    { id: 'one', name: 'First workspace', canWrite: true, canManage: true },
    { id: 'two', name: 'Second workspace', canWrite: true }
  ],
  experts: [],
  items: [
    { id: 'plugin', name: 'Meeting tools', description: 'Tools', status: 'available', components: [], version: '1' }
  ]
}

function defaultResult(method, input) {
  if (method === 'listCatalog') return input === 'applications' ? [app] : input === 'experts' ? [expert] : []
  if (method === 'templateCatalogPage') return { items: [], nextOffset: null }
  if (method === 'organizationPluginAccess') return true
  if (method === 'pluginLibrary') return library
  throw new Error(`Unexpected host call: ${method}`)
}

const template = { ...expert, kind: 'templates', id: 'template', name: 'Installable template' }
const installation = {
  id: 'operation',
  templateId: 'template',
  workspaceId: 'one',
  status: 'failed',
  stage: 'publishing',
  attempt: 1,
  publish: true,
  assistantId: 'assistant',
  retryable: true,
  resourceInstallationIds: [],
  pendingAuthInstallationIds: [],
  createdAt: '2026-10-13',
  updatedAt: '2026-10-13',
  error: { code: 'INSTALL_FAILED', message: 'Publish failed' }
}
const templateResult = (method, input) => {
  if (method === 'templateCatalogPage') return { items: [template], nextOffset: null }
  if (method === 'templateOverview')
    return {
      id: 'template',
      title: 'Installable template',
      publisher: 'Author',
      description: 'Work',
      instructions: 'Prepare drafts',
      memories: [],
      skills: [],
      agents: [],
      routines: [],
      integrations: []
    }
  if (method === 'templateSetup')
    return {
      workspaces: library.workspaces,
      hasPrimaryLanguageModel: true,
      preflight: {
        canInstall: true,
        requiresModel: false,
        models: [],
        optionalCapabilities: [],
        realtimeModels: [],
        requiredModelFeatures: []
      }
    }
  if (method === 'listTemplateInstallations') return { items: [], total: 0 }
  return defaultResult(method, input)
}

module.exports = { app, expert, library, defaultResult, template, installation, templateResult }
