// Shared by the browser preview and Electron. Only known platform routes can be opened.
export function platformCommandUrl(webUrl, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const id = (value) =>
    typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value) && !['.', '..'].includes(value)
  const segment = (value) => encodeURIComponent(value)
  let path
  const query = new URLSearchParams()
  if (payload.target === 'auth.register') path = 'auth/register'
  else if (payload.target === 'workspace.connectors.manage' && id(payload.workspaceId) && id(payload.organizationId)) {
    path = `xpert/w/${segment(payload.workspaceId)}/connectors`
    query.set('organizationId', payload.organizationId)
  } else if (payload.target === 'platform.data-source.create') path = 'settings/data-sources'
  else if (
    payload.target === 'workspace.plugins.manage' &&
    id(payload.organizationId) &&
    (!payload.packageId || id(payload.packageId)) &&
    (!payload.workspaceId || id(payload.workspaceId))
  ) {
    path = 'plugins'
    query.set('category', 'agent-plugins')
    for (const key of ['organizationId', 'packageId', 'workspaceId']) if (payload[key]) query.set(key, payload[key])
  } else if (
    payload.target === 'bosi.connector.connect' &&
    id(payload.workspaceId) &&
    id(payload.bindingId) &&
    id(payload.organizationId)
  ) {
    path = 'workspace-connection'
    for (const key of ['workspaceId', 'bindingId', 'organizationId']) query.set(key, payload[key])
    query.set('autostart', '1')
  } else if (
    payload.target === 'workspace.connector.connect' &&
    id(payload.assistantId) &&
    id(payload.bindingId) &&
    id(payload.organizationId)
  ) {
    path = 'workspace-connection'
    for (const key of ['assistantId', 'bindingId', 'organizationId']) query.set(key, payload[key])
    query.set('autostart', '1')
  } else if (payload.target === 'agent-evolution.target' && id(payload.targetId))
    path = `agent-evolution/targets/${segment(payload.targetId)}`
  else if (payload.target === 'knowledgebase.documents' && id(payload.knowledgebaseId)) {
    if (payload.documentId !== undefined && !id(payload.documentId)) return null
    path = `xpert/knowledges/${segment(payload.knowledgebaseId)}/documents${payload.documentId ? '/' + segment(payload.documentId) : ''}`
    for (const key of ['parentId', 'chunkId']) if (id(payload[key])) query.set(key, payload[key])
    const page = Number(payload.page)
    if (Number.isInteger(page) && page > 0) {
      query.set('view', 'analysis')
      query.set('page', String(page))
    } else if (query.has('chunkId')) query.set('view', 'chunks')
    if (Array.isArray(payload.sourceBlockIds) && id(payload.sourceBlockIds[0]))
      query.set('block', payload.sourceBlockIds[0])
    // evidenceText is transient content and must never enter URL/history or external browser logs.
  } else return null
  const url = new URL(`${webUrl.replace(/\/$/, '')}/${path}`)
  url.search = query.toString()
  return url.href
}
