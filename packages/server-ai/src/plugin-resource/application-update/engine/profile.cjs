const { SuiteReleaseError } = require('./error.cjs')

function roleDependencyOrder(profile) {
    const ordered = [],
        visiting = new Set(),
        visited = new Set()
    const visit = (definition) => {
        if (visiting.has(definition.key))
            throw new SuiteReleaseError(`External role dependency cycle: ${definition.key}`)
        if (visited.has(definition.key)) return
        visiting.add(definition.key)
        for (const key of definition.externalRoleKeys ?? []) visit(profile.roles.find((role) => role.key === key))
        visiting.delete(definition.key)
        visited.add(definition.key)
        ordered.push(definition)
    }
    profile.roles.forEach(visit)
    return ordered
}

function templateId(profile, definition) {
    return `${profile.plugin.name}:${definition.templateKey}`
}

function installedName(definition, runId) {
    return `${definition.name}-${runId}`
}

function installedTitle(definition, runId) {
    return `${definition.title} ${runId}`
}

function readTemplateSource(xpert) {
    return xpert?.draft?.team?.options?.templateSource ?? xpert?.options?.templateSource ?? null
}

function readPrimaryAgentKey(xpert) {
    const graph = Array.isArray(xpert?.draft?.nodes) ? xpert.draft : xpert?.graph
    if (Array.isArray(graph?.nodes)) {
        const rootAgents = graph.nodes.filter((node) => node?.type === 'agent' && node?.entity?.leaderKey == null)
        return rootAgents.length === 1 ? (rootAgents[0]?.entity?.key ?? rootAgents[0]?.key ?? null) : null
    }
    const direct = xpert?.draft?.team?.agent?.key ?? xpert?.agent?.key
    if (direct) return direct
    const configured = Object.keys(xpert?.options?.agent ?? {})
    return configured.length === 1 ? configured[0] : null
}

function assertAssistantIdentity(xpert, profile, definition) {
    const source = readTemplateSource(xpert)
    if (
        source?.pluginName !== profile.plugin.name ||
        source?.templateKey !== definition.templateKey ||
        readPrimaryAgentKey(xpert) !== definition.primaryAgentKey
    ) {
        throw new SuiteReleaseError(
            `Existing Assistant ${xpert?.name ?? '<unknown>'} does not match official template ${templateId(profile, definition)} and primary Agent ${definition.primaryAgentKey}.`
        )
    }
}

exports.roleDependencyOrder = roleDependencyOrder
exports.templateId = templateId
exports.installedName = installedName
exports.installedTitle = installedTitle
exports.readTemplateSource = readTemplateSource
exports.readPrimaryAgentKey = readPrimaryAgentKey
exports.assertAssistantIdentity = assertAssistantIdentity
