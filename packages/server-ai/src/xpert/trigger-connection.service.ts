// Invariants: activate only the requested trigger on the published graph; never publish the editor draft.
// Runtime failures roll back graph changes and attempt to restore the previous trigger binding.
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IWFNTrigger, TWorkflowTriggerConnectionStatus } from '@xpert-ai/contracts'
import { WorkflowTriggerRegistry } from '@xpert-ai/plugin-sdk'
import { IntegrationQrService, RequestContext } from '@xpert-ai/server-core'
import { randomUUID } from 'crypto'
import { t } from 'i18next'
import { DataSource, Repository } from 'typeorm'
import { XpertPublishTriggersCommand } from './commands/publish-triggers.command'
import { Xpert } from './xpert.entity'
import {
    connectionTrigger,
    hasConnectionDraftConflict,
    patchConnectionGraph,
    triggerConfig
} from './trigger-connection.graph'

@Injectable()
export class XpertTriggerConnectionService {
    private readonly logger = new Logger(XpertTriggerConnectionService.name)

    constructor(
        @InjectRepository(Xpert) private readonly repository: Repository<Xpert>,
        private readonly database: DataSource,
        private readonly registry: WorkflowTriggerRegistry,
        private readonly qr: IntegrationQrService,
        private readonly commands: CommandBus
    ) {}

    async statuses(id: string): Promise<TWorkflowTriggerConnectionStatus[]> {
        const xpert = await this.read(id)
        return Promise.all(
            this.registry
                .list()
                .filter((provider) => provider.meta.quickConnect)
                .map((provider) => this.status(xpert, provider.meta.name))
        )
    }

    async begin(id: string, provider: string) {
        const xpert = await this.read(id)
        this.ready(xpert, provider)
        const setup = this.provider(provider).meta.quickConnect
        return this.qr.begin(
            setup.integrationProvider,
            { name: `${xpert.title || xpert.name} · ${provider}` },
            {
                xpertId: id,
                triggerProvider: provider
            }
        )
    }

    async poll(id: string, provider: string, session: string) {
        await this.qr.assertContext(session, id, provider)
        return this.qr.poll(session)
    }

    async cancel(id: string, provider: string, session: string) {
        await this.qr.assertContext(session, id, provider)
        await this.qr.cancel(session)
    }

    async complete(id: string, provider: string, session: string) {
        await this.qr.assertContext(session, id, provider)
        this.ready(await this.read(id), provider)
        const integration = await this.qr.complete(session)
        if (integration.provider !== this.provider(provider).meta.quickConnect.integrationProvider)
            throw this.unavailable()
        return this.change(id, provider, integration.id)
    }

    async disconnect(id: string, provider: string) {
        return this.change(id, provider, null)
    }

    private async change(id: string, provider: string, integrationId: string | null) {
        let previous: Xpert | undefined
        let next: Xpert | undefined
        let runtimeStarted = false
        try {
            return await this.database.transaction(async (manager) => {
                const repository = manager.getRepository(Xpert)
                const locked = await repository.findOne({
                    where: this.where(id),
                    loadEagerRelations: false,
                    lock: { mode: 'pessimistic_write' }
                })
                if (!locked) throw new NotFoundException()
                const xpert = await repository.findOne({ where: this.where(id), relations: ['agent'] })
                this.ready(xpert, provider)
                const strategy = this.provider(provider)
                const setup = strategy.meta.quickConnect
                const original = connectionTrigger(xpert.graph, provider)
                if (!integrationId && !original) return this.status(xpert, provider)
                const config: IWFNTrigger['config'] = {
                    ...(triggerConfig(xpert.graph, provider) ?? {}),
                    enabled: integrationId !== null,
                    ...(integrationId ? { [setup.configField]: integrationId } : {})
                }
                if (integrationId) {
                    const errors = await strategy.validate({ xpertId: id, config })
                    if (errors?.length) throw this.unavailable()
                }
                const key = original?.key ?? `Trigger_${randomUUID().replace(/-/g, '')}`
                const graph = patchConnectionGraph(xpert.graph, provider, key, xpert.agent.key, config)
                const draft = xpert.draft
                    ? {
                          ...xpert.draft,
                          ...patchConnectionGraph(xpert.draft, provider, key, xpert.agent.key, config),
                          savedAt: new Date()
                      }
                    : null
                previous = xpert
                next = Object.assign(new Xpert(), xpert, { graph, draft })
                await repository
                    .createQueryBuilder()
                    .update()
                    .set({ graph: () => ':graph', draft: () => ':draft' })
                    .setParameters({ graph: JSON.stringify(graph), draft: draft ? JSON.stringify(draft) : null })
                    .where({ id })
                    .execute()
                runtimeStarted = true
                // Replay this provider on retries too, so a persisted but offline binding can recover.
                const previousGraph =
                    integrationId && !(await this.status(xpert, provider)).connected
                        ? { ...xpert.graph, nodes: xpert.graph.nodes.filter((node) => node.key !== original?.key) }
                        : xpert.graph
                await this.commands.execute(
                    new XpertPublishTriggersCommand(next, {
                        previousGraph,
                        providers: [provider],
                        strict: true
                    })
                )
                // Repeated disconnects must repair stale runtime bindings even when the graph is already disabled.
                if (!integrationId && triggerConfig(xpert.graph, provider)?.enabled === false) {
                    await strategy.stop({ xpertId: id, config })
                }
                const result = await this.status(next, provider)
                if (integrationId && !result.connected)
                    throw new BadRequestException(
                        t('server-ai:Error.TriggerConnectionFailed', {
                            defaultValue:
                                'Robot authorization succeeded, but the message connection could not start. Please retry.'
                        })
                    )
                return result
            })
        } catch (error) {
            if (runtimeStarted && previous && next) {
                try {
                    await this.commands.execute(
                        new XpertPublishTriggersCommand(previous, {
                            previousGraph: next.graph,
                            providers: [provider],
                            strict: true
                        })
                    )
                } catch {
                    this.logger.error(`Unable to restore trigger connection for xpert ${id}, provider ${provider}`)
                }
            }
            throw error
        }
    }

    private async status(xpert: Xpert, provider: string): Promise<TWorkflowTriggerConnectionStatus> {
        const strategy = this.provider(provider)
        const config = triggerConfig(xpert.graph, provider)
        const enabled = !!config && config.enabled !== false
        if (!enabled) return { provider, enabled: false, connected: false, state: 'disconnected' }
        const runtime = await strategy.connectionStatus(config)
        return { provider, enabled, ...runtime }
    }

    private ready(xpert: Xpert, provider: string) {
        this.provider(provider)
        if (!xpert.publishAt || !xpert.graph || !xpert.agent?.key)
            throw new BadRequestException(
                t('server-ai:Error.TriggerConnectionPublishFirst', {
                    defaultValue: 'Publish a runnable assistant before connecting a robot.'
                })
            )
        if (hasConnectionDraftConflict(xpert.graph, xpert.draft, provider))
            throw new ConflictException(
                t('server-ai:Error.TriggerConnectionDraftConflict', {
                    defaultValue:
                        'This trigger has unpublished changes. Publish or reset its configuration before connecting.'
                })
            )
    }

    private provider(name: string) {
        const provider = this.registry.get(name)
        if (provider?.meta.quickConnect?.method !== 'qr' || !provider.connectionStatus) throw this.unavailable()
        return provider
    }

    private async read(id: string) {
        const xpert = await this.repository.findOne({ where: this.where(id), relations: ['agent'] })
        if (!xpert) throw new NotFoundException()
        return xpert
    }

    private where(id: string) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId || !RequestContext.currentUserId()) throw this.unavailable()
        return { id, tenantId, organizationId }
    }

    private unavailable() {
        return new BadRequestException(
            t('server-ai:Error.TriggerConnectionUnavailable', {
                defaultValue: 'Quick connection is unavailable. Check the robot binding and installed plugin.'
            })
        )
    }
}
