import type {
    IKnowledgeGraphEntity,
    IKnowledgeGraphRelation,
    KnowledgeGraphViewResponse,
    KnowledgeGraphVisualizationQuery
} from '@xpert-ai/contracts'

export function buildGraphView(
    entities: IKnowledgeGraphEntity[],
    relations: IKnowledgeGraphRelation[],
    query: KnowledgeGraphVisualizationQuery = {}
): KnowledgeGraphViewResponse {
    const search = query.search?.trim().toLocaleLowerCase()
    let candidates = entities.filter(
        (entity) =>
            (!query.entityType || entity.type === query.entityType) &&
            (!search ||
                `${entity.name} ${entity.type} ${entity.aliases?.join(' ') ?? ''}`.toLocaleLowerCase().includes(search))
    )
    let ids = new Set(candidates.map((entity) => entity.id))
    const edges = relations.filter(
        (relation) =>
            ids.has(relation.sourceEntityId) &&
            ids.has(relation.targetEntityId) &&
            (!query.relationType || relation.type === query.relationType)
    )
    const neighbors = new Map<string, Set<string>>()
    const incoming = new Set<string>()
    for (const edge of edges) {
        for (const [source, target] of [
            [edge.sourceEntityId, edge.targetEntityId],
            [edge.targetEntityId, edge.sourceEntityId]
        ]) {
            if (!neighbors.has(source)) neighbors.set(source, new Set())
            neighbors.get(source).add(target)
        }
        incoming.add(edge.targetEntityId)
    }
    // A relation filter defines the displayed subgraph, including its endpoints.
    if (query.relationType)
        candidates = candidates.filter((entity) => neighbors.has(entity.id) || entity.id === query.focusEntityId)
    ids = new Set(candidates.map((entity) => entity.id))
    const walk = (seeds: string[], depth = Infinity) => {
        const visited = new Set(seeds.filter((id) => ids.has(id)))
        let frontier = [...visited]
        for (let level = 0; frontier.length && level < depth; level++) {
            const next: string[] = []
            for (const id of frontier)
                for (const neighbor of neighbors.get(id) ?? []) {
                    if (!visited.has(neighbor) && ids.has(neighbor)) {
                        visited.add(neighbor)
                        next.push(neighbor)
                    }
                }
            frontier = next
        }
        return visited
    }
    const focus = query.focusEntityId
    const scope = focus ? walk([focus]) : ids
    const depth = Number.isFinite(query.depth) ? Math.max(0, Math.floor(query.depth)) : 1
    const take = Number.isFinite(query.take) ? Math.max(1, Math.floor(query.take)) : 80
    // Breadth-first ordering keeps roots and their connecting paths ahead of unrelated islands.
    const roots = candidates.filter((entity) => !incoming.has(entity.id)).map((entity) => entity.id)
    const ordered = focus ? [...walk([focus], depth)] : [...walk(roots), ...ids]
    const visible = query.loadAll ? new Set(scope) : new Set([...new Set(ordered)].slice(0, take))
    if (!query.loadAll) {
        for (const id of query.visibleEntityIds ?? []) if (scope.has(id)) visible.add(id)
        for (const seed of query.expandedEntityIds ?? []) {
            if (!visible.has(seed)) continue
            for (const id of neighbors.get(seed) ?? []) if (scope.has(id)) visible.add(id)
        }
    }
    const scopedRelations = edges.filter((edge) => scope.has(edge.sourceEntityId) && scope.has(edge.targetEntityId))
    const displayedRelations = scopedRelations.filter(
        (edge) => visible.has(edge.sourceEntityId) && visible.has(edge.targetEntityId)
    )
    return {
        nodes: candidates
            .filter((entity) => visible.has(entity.id))
            .map((entity) => ({
                id: entity.id,
                name: entity.name,
                type: entity.type,
                origin: entity.origin ?? 'extracted',
                visibility: entity.visibility ?? 'active',
                mentionCount: entity.mentionCount,
                confidence: entity.confidence,
                symbolSize: Math.min(54, 22 + (entity.mentionCount ?? 0) * 2),
                unloadedNeighborCount: [...(neighbors.get(entity.id) ?? [])].filter(
                    (id) => scope.has(id) && !visible.has(id)
                ).length
            })),
        edges: displayedRelations.map((edge) => ({
            id: edge.id,
            source: edge.sourceEntityId,
            target: edge.targetEntityId,
            type: edge.type,
            origin: edge.origin ?? 'extracted',
            visibility: edge.visibility ?? 'active',
            weight: edge.weight,
            evidenceCount: edge.evidenceCount
        })),
        relations: displayedRelations,
        entityTypes: [...new Set(entities.map((entity) => entity.type))].sort(),
        relationTypes: [...new Set(relations.map((relation) => relation.type))].sort(),
        totalNodes: scope.size,
        totalEdges: scopedRelations.length,
        remainingNodes: scope.size - visible.size
    }
}
