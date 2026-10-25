const { createHash } = require('node:crypto')

function hash(value) {
    const canonical = (item) =>
        Array.isArray(item)
            ? item.map(canonical)
            : item && typeof item === 'object'
              ? Object.fromEntries(
                    Object.keys(item)
                        .sort()
                        .filter((key) => item[key] !== undefined)
                        .map((key) => [key, canonical(item[key])])
                )
              : item
    return createHash('sha256')
        .update(JSON.stringify(canonical(value)))
        .digest('hex')
}

function graphHash(graph) {
    const nodes = (graph?.nodes ?? [])
        .map((node) => {
            const entity = { ...node.entity }
            if (node.type === 'agent') {
                for (const key of [
                    'id',
                    'createdAt',
                    'updatedAt',
                    'createdById',
                    'updatedById',
                    'tenantId',
                    'organizationId',
                    'teamId',
                    'xpertId',
                    'leaderKey',
                    'toolsetIds',
                    'knowledgebaseIds',
                    'collaboratorNames',
                    'copilotModelId'
                ])
                    delete entity[key]
                // TypeORM materializes omitted nullable Agent columns during publication.
                for (const key of [
                    'name',
                    'title',
                    'description',
                    'avatar',
                    'prompt',
                    'promptTemplates',
                    'parameters',
                    'outputVariables',
                    'options'
                ]) {
                    if (entity[key] == null) delete entity[key]
                }
                entity.copilotModel = modelSelection(entity.copilotModel)
            }
            if (node.type === 'xpert') return { key: node.key, type: node.type, id: entity.id, version: entity.version }
            return { key: node.key, type: node.type, entity }
        })
        .sort((a, b) => a.key.localeCompare(b.key))
    const edges = (graph?.connections ?? [])
        .map(({ key, ...edge }) => edge)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    return hash({ nodes, connections: edges })
}

function modelSelection(model) {
    if (!model) return null
    return {
        copilotId: model.copilotId,
        model: model.model,
        modelType: model.modelType,
        options: model.options ?? null,
        referencedId: model.referencedId
    }
}

function stateHash(team) {
    return hash({
        version: team.version ?? null,
        graph: graphHash(team.draft ?? team.graph),
        environmentId: team.environmentId ?? null,
        team: team.draft?.team ? authoringProperties(team.draft.team) : authoringProperties(team)
    })
}

function modelHash(team) {
    const selected = team.draft?.team ?? team
    return hash(
        [
            selected.copilotModel,
            selected.memory?.copilotModel,
            selected.features?.speechToText?.copilotModel,
            selected.features?.textToSpeech?.copilotModel
        ].map(modelSelection)
    )
}

function authoringProperties(team) {
    return {
        title: team.title,
        description: team.description,
        copilotModel: modelSelection(team.copilotModel),
        options: team.options,
        features: team.features,
        agentConfig: team.agentConfig,
        memory: team.memory,
        summarize: team.summarize
    }
}

exports.hash = hash
exports.graphHash = graphHash
exports.stateHash = stateHash
exports.modelHash = modelHash
