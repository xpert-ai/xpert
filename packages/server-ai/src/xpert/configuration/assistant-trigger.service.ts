// Invariants: UI categories use the existing Trigger graph and runtime. Never publish unrelated drafts.
// Revisions and the row lock protect edits; failed runtime activation rolls back persistence and runtime.
import { createHash, randomUUID } from 'node:crypto'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, Repository } from 'typeorm'
import { t } from 'i18next'
import Ajv from 'ajv'
import { RequestContext, WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import {
    WorkflowNodeTypeEnum,
    type AssistantTriggerMutation,
    type AssistantTriggerProvider,
    type AssistantTriggerSettings,
    type IWFNTrigger,
    type TXpertGraph
} from '@xpert-ai/contracts'
import { Xpert } from '../xpert.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertPublishTriggersCommand } from '../commands/publish-triggers.command'
import { connectionTrigger, hasConnectionDraftConflict, patchConnectionGraph } from '../trigger-connection.graph'
import { invalidTrigger, parseTriggerConfig } from './assistant-trigger.validation'

@Injectable()
export class AssistantTriggerService {
    private readonly logger = new Logger(AssistantTriggerService.name)
    constructor(
        @InjectRepository(Xpert) private readonly repository: Repository<Xpert>,
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        private readonly database: DataSource,
        private readonly registry: WorkflowTriggerRegistry,
        private readonly access: XpertWorkspaceAccessService,
        private readonly commands: CommandBus
    ) {}

    private where(id: string) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId || !RequestContext.currentUserId())
            throw new ForbiddenException(t('server-ai:Error.AssistantConfigurationForbidden'))
        return { id, tenantId, organizationId }
    }

    private async read(id: string, write = false) {
        const xpert = await this.repository.findOne({ where: this.where(id), relations: ['agent'] })
        if (!xpert) throw new NotFoundException()
        if (write) await this.access.assertCanAuthor(xpert.workspaceId)
        else await this.access.assertCanRead(xpert.workspaceId)
        return xpert
    }

    private revision(xpert: Xpert) {
        return createHash('sha256')
            .update(JSON.stringify([xpert.graph, xpert.draft]))
            .digest('hex')
    }

    private providers(): AssistantTriggerProvider[] {
        return this.registry
            .list()
            .filter(({ meta }) => meta.name !== 'chat' && !meta.deprecated)
            .map(({ meta }) => ({
                name: meta.name,
                label: meta.label,
                presentation: meta.assistant,
                quickConnect: meta.quickConnect,
                schema: meta.configSchema,
                available: true
            }))
    }

    async list(id: string): Promise<AssistantTriggerSettings> {
        const xpert = await this.read(id)
        let canEdit = true
        try {
            await this.access.assertCanAuthor(xpert.workspaceId)
        } catch (error) {
            if (error instanceof ForbiddenException) canEdit = false
            else throw error
        }
        const providers = this.providers()
        const nodes =
            xpert.graph?.nodes.filter(
                (node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.TRIGGER
            ) ?? []
        const items: AssistantTriggerSettings['items'] = []
        for (const node of nodes) {
            const trigger = node.entity as IWFNTrigger
            if (!trigger.from || trigger.from === 'chat') continue
            const provider = providers.find((item) => item.name === trigger.from)
            const storedConfig = parseTriggerConfig(trigger.config ?? {})
            const { additionalInstructions, ...providerConfig } = storedConfig
            // Project only declared scalar fields. Nested/secret/retired provider config stays in the server graph.
            const config = Object.fromEntries(
                Object.entries(provider?.schema.properties ?? {}).flatMap(([key, field]) => {
                    if (
                        field['x-ui']?.component === 'password' ||
                        !('type' in field) ||
                        !['string', 'number', 'integer', 'boolean'].includes(String(field.type)) ||
                        storedConfig[key] === undefined
                    )
                        return []
                    return [[key, storedConfig[key]]]
                })
            )
            if (typeof additionalInstructions === 'string') config.additionalInstructions = additionalInstructions
            const strategy = provider && this.registry.get(provider.name)
            const enabled = trigger.config?.enabled !== false
            let connection: AssistantTriggerSettings['items'][number]['connection'] = enabled
                ? 'unknown'
                : 'disconnected'
            if (enabled && strategy?.connectionStatus) {
                try {
                    connection = (await strategy.connectionStatus(providerConfig)).state
                } catch {
                    connection = 'failed'
                }
            }
            const last = await this.conversations
                .createQueryBuilder('conversation')
                .select('MAX(conversation.updatedAt)', 'activityAt')
                .addSelect('MAX(conversation.createdAt)', 'runAt')
                .where(
                    'conversation.xpertId = :id AND conversation.tenantId = :tenantId AND conversation.organizationId = :organizationId',
                    this.where(id)
                )
                .andWhere('conversation.from = :provider', { provider: trigger.from })
                .getRawOne<{ activityAt: Date | string | null; runAt: Date | string | null }>()
            items.push({
                key: node.key,
                provider: trigger.from,
                title: trigger.title || trigger.from,
                enabled,
                config,
                connection,
                lastActivityAt: last?.activityAt ? new Date(last.activityAt).toISOString() : null,
                lastRunAt: last?.runAt ? new Date(last.runAt).toISOString() : null
            })
        }
        return {
            revision: this.revision(xpert),
            canEdit: canEdit && !!xpert.publishAt && !!xpert.agent?.key,
            providers,
            items
        }
    }

    private ready(xpert: Xpert, input: AssistantTriggerMutation) {
        if (!xpert.publishAt || !xpert.agent?.key || !xpert.graph)
            throw new BadRequestException(t('server-ai:Error.TriggerConnectionPublishFirst'))
        if (
            this.revision(xpert) !== input.revision ||
            hasConnectionDraftConflict(xpert.graph, xpert.draft, input.provider)
        )
            throw new ConflictException(t('server-ai:Error.AssistantTriggerStale'))
        const matches = xpert.graph.nodes.filter(
            (node) =>
                node.type === 'workflow' &&
                node.entity.type === WorkflowNodeTypeEnum.TRIGGER &&
                (node.entity as IWFNTrigger).from === input.provider
        )
        if (matches.length > 1) throw new ConflictException(t('server-ai:Error.AssistantTriggerDuplicate'))
    }

    private async check(xpert: Xpert, input: AssistantTriggerMutation) {
        this.ready(xpert, input)
        if (input.operation !== 'save') return
        const provider = this.providers().find((item) => item.name === input.provider)
        if (!provider) return invalidTrigger()
        // The desktop never writes secrets into graph JSON; connect through the existing account settings.
        for (const [key, field] of Object.entries(provider.schema.properties)) {
            if (field['x-ui']?.component === 'password' && key in input.config) return invalidTrigger()
        }
        const { additionalInstructions, ...config } = parseTriggerConfig({
            ...(connectionTrigger(xpert.graph, input.provider)?.entity as IWFNTrigger | undefined)?.config,
            ...input.config
        })
        // The runtime owns this common config field, so strict provider schemas only validate their own fields.
        if (!new Ajv({ strict: false, validateSchema: false }).compile(provider.schema)(config)) return invalidTrigger()
        for (const key of provider.schema.required ?? []) {
            if (config[key] === undefined || config[key] === null || config[key] === '') return invalidTrigger()
        }
        const errors = await this.registry.get(input.provider).validate({ xpertId: xpert.id, config })
        if (errors?.some((error) => error.level !== 'warning')) return invalidTrigger()
    }

    async validate(id: string, input: AssistantTriggerMutation) {
        await this.check(await this.read(id, true), input)
        return { valid: true }
    }

    async mutate(id: string, input: AssistantTriggerMutation) {
        await this.read(id, true)
        let previous: Xpert | undefined
        let next: Xpert | undefined
        try {
            await this.database.transaction(async (manager) => {
                const repository = manager.getRepository(Xpert)
                await repository.findOne({
                    where: this.where(id),
                    loadEagerRelations: false,
                    lock: { mode: 'pessimistic_write' }
                })
                const xpert = await repository.findOne({ where: this.where(id), relations: ['agent'] })
                if (!xpert) throw new NotFoundException()
                await this.check(xpert, input)
                const existing = connectionTrigger(xpert.graph, input.provider)
                if (input.operation !== 'save' && !existing) throw new NotFoundException()
                const key = existing?.key ?? `Trigger_${randomUUID().replace(/-/g, '')}`
                const entity = existing?.entity as IWFNTrigger | undefined
                const config =
                    input.operation === 'save'
                        ? { ...entity?.config, ...input.config }
                        : { ...entity?.config, enabled: input.operation === 'toggle' && input.enabled }
                const patch = (graph: TXpertGraph): TXpertGraph => {
                    if (input.operation === 'delete')
                        return {
                            ...graph,
                            nodes: graph.nodes.filter((node) => node.key !== key),
                            connections: graph.connections.filter((edge) => edge.from !== key && edge.to !== key)
                        }
                    const result = patchConnectionGraph(graph, input.provider, key, xpert.agent.key, config)
                    return {
                        ...result,
                        nodes: result.nodes.map((node) =>
                            node.type === 'workflow' && node.key === key && input.operation === 'save'
                                ? {
                                      ...node,
                                      entity: {
                                          ...(node.entity as IWFNTrigger),
                                          title: input.title
                                      }
                                  }
                                : node
                        )
                    }
                }
                previous = xpert
                next = Object.assign(new Xpert(), xpert, {
                    graph: patch(xpert.graph),
                    draft: xpert.draft ? { ...xpert.draft, ...patch(xpert.draft), savedAt: new Date() } : null
                })
                await repository
                    .createQueryBuilder()
                    .update()
                    .set({ graph: () => ':graph', draft: () => ':draft' })
                    .setParameters({
                        graph: JSON.stringify(next.graph),
                        draft: next.draft ? JSON.stringify(next.draft) : null
                    })
                    .where(this.where(id))
                    .execute()
                await this.commands.execute(
                    new XpertPublishTriggersCommand(next, {
                        previousGraph: previous.graph,
                        providers: [input.provider],
                        strict: true
                    })
                )
            })
        } catch (error) {
            if (previous && next) {
                try {
                    await this.commands.execute(
                        new XpertPublishTriggersCommand(previous, {
                            previousGraph: next.graph,
                            providers: [input.provider],
                            strict: true
                        })
                    )
                } catch {
                    this.logger.error('Unable to restore assistant trigger runtime after failed update')
                }
            }
            throw error
        }
        return { saved: true }
    }
}
