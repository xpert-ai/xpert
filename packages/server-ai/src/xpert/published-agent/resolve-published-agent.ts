import type { IXpert } from '@xpert-ai/contracts'
import type { AgentMiddlewareAssistantTaskApi } from '@xpert-ai/plugin-sdk'
import type { PublishedXpertAccessService } from '../published-xpert-access.service'
import { resolveTemplateSourceFromOptions } from '../template-source'

type Input = Parameters<NonNullable<AgentMiddlewareAssistantTaskApi['resolvePublishedAgent']>>[0]
type Access = Pick<PublishedXpertAccessService, 'getAccessiblePublishedXpert' | 'findAccessiblePublishedResources'>

/** Resolve only published, accessible, same-workspace resources; drafts and display names are never routing inputs. */
export async function resolvePublishedAgent(access: Access, input: Input) {
    const requester = await access.getAccessiblePublishedXpert(input.requesterXpertId)
    if (!requester.workspaceId) throw new Error('assistant_workspace_required')
    const matches = (candidate: IXpert) => {
        const source = resolveTemplateSourceFromOptions(candidate.options)
        return (
            candidate.tenantId === requester.tenantId &&
            candidate.organizationId === requester.organizationId &&
            candidate.workspaceId === requester.workspaceId &&
            candidate.active !== false &&
            !!candidate.publishAt &&
            source?.pluginName === input.expectation.pluginName &&
            source.templateKey === input.expectation.templateKey &&
            candidate.graph?.nodes.some(
                (node) => node.type === 'agent' && node.entity.key === input.expectation.agentKey
            )
        )
    }
    if (matches(requester))
        return { xpertId: requester.id, workspaceId: requester.workspaceId, agentKey: input.expectation.agentKey }
    const candidates: IXpert[] = []
    for (let skip = 0; ; skip += 100) {
        const page = await access.findAccessiblePublishedResources(requester.id, {
            where: {
                workspaceId: requester.workspaceId,
                organizationId: requester.organizationId ?? null,
                latest: true
            },
            take: 100,
            skip
        })
        candidates.push(...page.filter(matches))
        if (candidates.length > 1)
            throw new Error('assistant_agent_ambiguous: More than one published Assistant provides this Agent.')
        if (page.length < 100) break
    }
    if (!candidates.length)
        throw new Error(
            'assistant_agent_unavailable: No accessible published Assistant provides this Agent in the current workspace.'
        )
    return { xpertId: candidates[0].id, workspaceId: requester.workspaceId, agentKey: input.expectation.agentKey }
}
