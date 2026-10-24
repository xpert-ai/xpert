// Runtime definitions are constructed by authorized host adapters, never accepted from ChatKit JSON.
import type { QueryBus } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import type {
    AssistantTemplateSetup,
    IXpert,
    IXpertAgent,
    TXpertTeamDraft,
    TemplateAgentSource
} from '@xpert-ai/contracts'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../../xpert/queries/get-xpert-workflow.query'
import { resolveDraftAgentNode } from '../../xpert/draft-agent.utils'
import type { RuntimeResourceSkillSource } from '../../agent-plugin/runtime-resource-context'

export interface AgentExecutionDefinition {
    source: TemplateAgentSource
    memoryNamespace: string
    ownerId: string
    draft: TXpertTeamDraft
    skills: { [agentKey: string]: RuntimeResourceSkillSource[] }
    setup: AssistantTemplateSetup
    taskSetup(update?: import('@xpert-ai/contracts').TemplateSetupUpdate): Promise<AssistantTemplateSetup>
    authorize(): Promise<void>
}

const authorizedDefinitions = new WeakSet<AgentExecutionDefinition>()

/** Only the server adapter can create executable definitions; JSON options cannot forge this identity. */
export function createTemplateExecutionDefinition(definition: AgentExecutionDefinition): AgentExecutionDefinition {
    authorizedDefinitions.add(definition)
    return definition
}

export function resolveExecutionWorkflow(
    queries: QueryBus,
    ownerId: string,
    agentKey?: string,
    isDraft?: boolean,
    definition?: AgentExecutionDefinition
): Promise<TXpertWorkflowQueryOutput> {
    if (!definition) return queries.execute(new GetXpertWorkflowQuery(ownerId, agentKey, isDraft))
    if (!authorizedDefinitions.has(definition) || definition.ownerId !== ownerId)
        throw new ForbiddenException(t('server-ai:Error.AgentResourceScopeMismatch'))
    return Promise.resolve(templateExecutionWorkflow(definition, agentKey))
}

export function templateExecutionWorkflow(
    definition: AgentExecutionDefinition,
    key?: string
): TXpertWorkflowQueryOutput {
    const draft = definition.draft
    const node = resolveDraftAgentNode(draft, draft.nodes, key)
    if (!node) return { graph: draft }
    const targets = (types: string[], from = node.key) =>
        draft.connections
            .filter((edge) => types.includes(edge.type) && edge.from === from)
            .map((edge) => draft.nodes.find((item) => item.key === edge.to))
            .filter((item): item is TXpertTeamDraft['nodes'][number] => !!item)
    return {
        graph: { nodes: draft.nodes, connections: draft.connections },
        agent: {
            ...node.entity,
            key: node.key,
            team: draft.team as IXpert,
            followers: targets(['agent'])
                .filter((item) => item.type === 'agent')
                .map((item) => item.entity as IXpertAgent),
            collaborators: targets(['xpert'])
                .filter((item) => item.type === 'xpert')
                .map((item) => item.entity as IXpert),
            toolsetIds: targets(['toolset']).map((item) => item.key),
            knowledgebaseIds: targets(['knowledge']).map((item) => item.key)
        },
        next: targets(['edge', 'workflow']).filter(
            (item) =>
                item.type === 'agent' || (item.type === 'workflow' && item.entity.type !== WorkflowNodeTypeEnum.TASK)
        ),
        fail: targets(['edge'], `${node.key}/fail`)
    }
}
