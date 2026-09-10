import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

export function wikiOrganizationError() {
    return new BadRequestException(
        t('server-ai:Error.KnowledgebaseWikiOrganizationInvalid', {
            defaultValue: 'The Wiki directory or classification request is invalid. Refresh and try again.'
        })
    )
}
export function validateWikiFolderMove(
    folders: Array<{ id: string; parentId: string | null }>,
    id: string,
    parentId: string | null
) {
    const parents = new Map(folders.map((folder) => [folder.id, folder.parentId]))
    const visited = new Set([id])
    let current = parentId
    while (current) {
        if (visited.has(current) || !parents.has(current)) throw wikiOrganizationError()
        visited.add(current)
        current = parents.get(current)
    }
}
export function selectWikiGraph<N extends { id: string }, E extends { source: string; target: string }>(
    nodes: N[],
    edges: E[],
    focus: string | undefined,
    depth: number,
    take: number
) {
    const ids = new Set(nodes.map((node) => node.id))
    let selected = ids
    if (focus) {
        selected = new Set(ids.has(focus) ? [focus] : [])
        for (let hop = 0; hop < depth; hop++) {
            const next = new Set(selected)
            for (const edge of edges) {
                if (!ids.has(edge.source) || !ids.has(edge.target)) continue
                if (selected.has(edge.source)) next.add(edge.target)
                if (selected.has(edge.target)) next.add(edge.source)
            }
            selected = next
        }
    }
    const candidates = nodes.filter((node) => selected.has(node.id))
    const limited =
        candidates.length > take
            ? [
                  ...candidates.filter((node) => node.id === focus),
                  ...candidates.filter((node) => node.id !== focus)
              ].slice(0, take)
            : candidates
    const visible = new Set(limited.map((node) => node.id))
    return {
        nodes: limited,
        edges: edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target)),
        truncated: candidates.length > take
    }
}
