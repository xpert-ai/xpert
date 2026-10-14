// Publication is an allowlisted projection, never an instance export. Unsupported runtime
// providers are blocked until they have a portable adapter; bindings are never copied.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
    assistantOperationPolicySchema,
    SKILLS_MIDDLEWARE_NAME,
    IWFNMiddleware,
    isMiddlewareToolEnabled,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import {
    assistantTemplateMetadataSchema,
    parseAssistantTemplateMetadata
} from '../definition/assistant-template.schema'

const text = z.string().max(32000)
const key = z.string().min(1).max(160)
const agentSchema = z.object({ key, name: text, title: text, description: text, prompt: text }).strict()
const middlewareSchema = z.discriminatedUnion('provider', [
    z.object({ key, provider: z.literal('SandboxFile'), required: z.boolean(), tools: z.record(z.boolean()) }).strict(),
    z
        .object({ key, provider: z.literal('ConnectorMiddleware'), required: z.boolean(), connectorProvider: key })
        .strict()
])
const edge = z.object({ from: key, to: key, type: z.enum(['agent', 'workflow']), required: z.boolean() }).strict()
export const portableTemplateSchema = z
    .object({
        presentation: z.object({ title: text, description: text, starters: z.array(text).max(50) }).strict(),
        instructions: z.object({ primary: key, agents: z.array(agentSchema).min(1).max(100) }).strict(),
        runtime: z
            .object({
                sandbox: z.boolean(),
                middleware: z.array(middlewareSchema).max(100),
                connections: z.array(edge).max(300)
            })
            .strict(),
        definition: z
            .object({
                metadata: assistantTemplateMetadataSchema.optional(),
                policy: assistantOperationPolicySchema.optional()
            })
            .strict()
    })
    .strict()
export type PortableTemplate = z.output<typeof portableTemplateSchema>
export const fingerprint = (value: object | string) =>
    createHash('sha256')
        .update(typeof value === 'string' ? value : JSON.stringify(value))
        .digest('hex')

export function portableTemplate(draft: TXpertTeamDraft) {
    const blocked: string[] = []
    const middleware: PortableTemplate['runtime']['middleware'] = []
    const agents: PortableTemplate['instructions']['agents'] = []
    const metadata = draft.template ?? draft.team.options?.templateDefinition
    for (const node of draft.nodes) {
        if (node.type === 'agent') {
            const agent = node.entity
            agents.push({
                key: node.key,
                name: agent.name ?? '',
                title: agent.title ?? '',
                description: agent.description ?? '',
                prompt: agent.prompt ?? ''
            })
            if (agent.parameters?.length || agent.outputVariables?.length || agent.promptTemplates?.length)
                blocked.push(`${node.key}: agent parameters / output variables / prompt templates`)
        } else if (node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE) {
            const config = node.entity as IWFNMiddleware
            if (config.provider === 'SandboxFile') {
                if (Object.keys(config.options ?? {}).length) blocked.push(`${node.key}: SandboxFile options`)
                middleware.push({
                    key: node.key,
                    provider: 'SandboxFile',
                    required: config.required === true,
                    tools: Object.fromEntries(
                        Object.entries(config.tools ?? {}).map(([name, value]) => [
                            name,
                            isMiddlewareToolEnabled(value)
                        ])
                    )
                })
            } else if (config.provider === 'ConnectorMiddleware' && typeof config.options?.provider === 'string') {
                middleware.push({
                    key: node.key,
                    provider: 'ConnectorMiddleware',
                    required: config.required === true,
                    connectorProvider: config.options.provider
                })
            } else if (config.provider !== SKILLS_MIDDLEWARE_NAME || !metadata?.dependencies?.skills?.length) {
                blocked.push(`${node.key}: ${config.provider}`)
            }
        } else blocked.push(`${node.key}: ${node.type}`)
    }
    const keys = new Set([...agents, ...middleware].map((node) => node.key))
    const content = portableTemplateSchema.parse({
        presentation: {
            title: draft.team.title ?? draft.team.name ?? '',
            description: draft.team.description ?? '',
            starters: draft.team.starters ?? []
        },
        instructions: { primary: draft.team.agent?.key, agents },
        runtime: {
            sandbox: draft.team.features?.sandbox?.enabled === true,
            middleware,
            connections: draft.connections
                .filter(
                    (connection) =>
                        keys.has(connection.from) &&
                        keys.has(connection.to) &&
                        ['agent', 'workflow'].includes(connection.type)
                )
                .map((connection) => ({
                    from: connection.from,
                    to: connection.to,
                    type: connection.type,
                    required: connection.required === true
                }))
        },
        definition: { metadata, policy: draft.team.options?.operationPolicy }
    })
    return {
        content,
        blocked,
        omitted: [
            'instance-bindings',
            'model-selection',
            'runtime-memories',
            'business-files',
            'user-preferences',
            'routine-state',
            'advanced-agent-options'
        ]
    }
}

/** Builds portable DSL. The installer supplies organization, model, skill and connector bindings. */
export function portableDraft(content: PortableTemplate): TXpertTeamDraft {
    const nodes: TXpertTeamNode[] = content.instructions.agents.map((agent, index) => ({
        key: agent.key,
        type: 'agent',
        position: { x: 0, y: index * 200 },
        entity: {
            key: agent.key,
            name: agent.name,
            title: agent.title,
            description: agent.description,
            prompt: agent.prompt
        }
    }))
    content.runtime.middleware.forEach((node, index) => {
        const entity: IWFNMiddleware = {
            id: node.key,
            key: node.key,
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: node.provider,
            required: node.required,
            options: node.provider === 'ConnectorMiddleware' ? { provider: node.connectorProvider } : {},
            ...(node.provider === 'SandboxFile' ? { tools: node.tools } : {})
        }
        nodes.push({ key: node.key, type: 'workflow', position: { x: 320, y: index * 160 }, entity })
    })
    return {
        team: {
            type: XpertTypeEnum.Agent,
            name: 'shared-template',
            ...content.presentation,
            agent: { key: content.instructions.primary },
            features: {
                sandbox: { enabled: content.runtime.sandbox },
                opener: { enabled: true, message: '', questions: content.presentation.starters },
                suggestion: { enabled: false, prompt: '' },
                textToSpeech: { enabled: false },
                speechToText: { enabled: false }
            },
            options: { operationPolicy: content.definition.policy }
        },
        nodes,
        connections: content.runtime.connections.map((connection) => ({
            from: connection.from,
            to: connection.to,
            type: connection.type,
            required: connection.required,
            key: `${connection.from}/${connection.to}`
        })),
        template: content.definition.metadata
            ? parseAssistantTemplateMetadata(content.definition.metadata)
            : { schemaVersion: 2 }
    }
}
