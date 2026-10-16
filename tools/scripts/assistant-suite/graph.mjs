import { LocalPluginCliError } from '../local-plugin-cli.mjs'
import { readTemplateSource } from './profile.mjs'

export function connectRoles(team, definition, profile, published, retiredIds = []) {
  const draft = structuredClone(team.draft)
  if (!draft?.team || !Array.isArray(draft.nodes) || !Array.isArray(draft.connections)) {
    throw new LocalPluginCliError('Assistant authoring draft is unavailable.')
  }
  const retired = new Set(retiredIds)
  draft.nodes = draft.nodes.filter((node) => node.type !== 'xpert' || !retired.has(node.key))
  draft.connections = draft.connections.filter((edge) => edge.type !== 'xpert' || !retired.has(edge.to))
  for (const [index, roleKey] of (definition.externalRoleKeys ?? []).entries()) {
    const role = published.get(roleKey)
    const target = profile.roles.find((item) => item.key === roleKey)
    if (!role?.id) throw new LocalPluginCliError(`Dependency ${roleKey} is not published.`)
    const matches = draft.nodes.filter(
      (node) =>
        node.type === 'xpert' &&
        readTemplateSource(node.entity)?.pluginName === profile.plugin.name &&
        readTemplateSource(node.entity)?.templateKey === target.templateKey
    )
    if (matches.some((node) => node.key !== role.id))
      throw new LocalPluginCliError(`Another Assistant is bound to role ${roleKey}.`)
    // Refresh existing embedded descriptors too: callers must see the newly published child graph.
    const entity = { ...role }
    delete entity.draft
    const old = draft.nodes.find((node) => node.type === 'xpert' && node.key === role.id)
    if (old) old.entity = entity
    else draft.nodes.push({ key: role.id, type: 'xpert', entity, position: { x: 180 + index * 280, y: 360 } })
    draft.connections = draft.connections.filter(
      (edge) => !(edge.type === 'xpert' && edge.from === definition.primaryAgentKey && edge.to === role.id)
    )
    draft.connections.push({
      key: `${definition.primaryAgentKey}/${role.id}`,
      type: 'xpert',
      from: definition.primaryAgentKey,
      to: role.id,
      required: true
    })
  }
  return draft
}

export function verifyRoles(team, definition, published) {
  for (const key of definition.externalRoleKeys ?? []) {
    const child = published.get(key)
    const nodes = team.graph?.nodes?.filter((node) => node.type === 'xpert' && node.key === child.id) ?? []
    const edges =
      team.graph?.connections?.filter(
        (edge) =>
          edge.type === 'xpert' &&
          edge.from === definition.primaryAgentKey &&
          edge.to === child.id &&
          edge.required === true
      ) ?? []
    if (nodes.length !== 1 || edges.length !== 1 || nodes[0].entity?.version !== child.version) {
      throw new LocalPluginCliError(`Published dependency ${key} does not match the completed child version.`)
    }
  }
}
