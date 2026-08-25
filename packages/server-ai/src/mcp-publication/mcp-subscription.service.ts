import type { CapabilityChangeEvent, ToolEventsApi } from '@xpert-ai/plugin-sdk'
import type { ServerEvent, ServerEventBus } from '@modelcontextprotocol/server'
import { UriTemplate } from '@modelcontextprotocol/server'
import type { McpCapabilityType } from '@xpert-ai/contracts'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import type { Repository } from 'typeorm'
import { McpPublicationCapability } from './entities'

const MCP_SUBSCRIPTION_CHANNEL = 'xpert:mcp:publication-events'

interface McpPublicationEventEnvelope {
    version: 1
    nodeId: string
    publicationId: string
    event: McpPublicationEvent
}

type McpPublicationEvent = ServerEvent | { kind: 'task_updated'; taskId: string } | { kind: 'access_invalidated' }

class McpPublicationEventBus implements ServerEventBus {
    constructor(
        private readonly owner: McpSubscriptionService,
        private readonly publicationId: string
    ) {}

    publish(event: ServerEvent): void {
        this.owner.publish(this.publicationId, event)
    }

    subscribe(listener: (event: ServerEvent) => void): () => void {
        return this.owner.subscribe(this.publicationId, listener)
    }
}

@Injectable()
export class McpSubscriptionService implements OnModuleInit, OnModuleDestroy {
    readonly #logger = new Logger(McpSubscriptionService.name)
    readonly #nodeId = randomUUID()
    readonly #listeners = new Map<string, Set<(event: ServerEvent) => void>>()
    readonly #taskListeners = new Map<string, Set<(taskId: string) => void>>()
    readonly #accessInvalidationListeners = new Map<string, Set<() => void>>()
    readonly #buses = new Map<string, ServerEventBus>()
    private subscriber?: RedisClientType

    constructor(
        @Optional() @Inject(REDIS_CLIENT) private readonly redis?: RedisClientType,
        @Optional()
        @InjectRepository(McpPublicationCapability)
        private readonly capabilityRepository?: Pick<Repository<McpPublicationCapability>, 'find'>
    ) {}

    async onModuleInit() {
        if (!this.redis) return
        try {
            this.subscriber = this.redis.duplicate()
            await this.subscriber.connect()
            await this.subscriber.subscribe(MCP_SUBSCRIPTION_CHANNEL, (message) => this.receive(message))
        } catch (error) {
            this.#logger.warn(`MCP subscription Redis subscriber is unavailable: ${errorMessage(error)}`)
        }
    }

    async onModuleDestroy() {
        try {
            if (this.subscriber?.isOpen) {
                await this.subscriber.unsubscribe(MCP_SUBSCRIPTION_CHANNEL)
                await this.subscriber.quit()
            }
        } catch (error) {
            this.#logger.warn(`Failed to close MCP subscription subscriber: ${errorMessage(error)}`)
        }
    }

    bus(publicationId: string): ServerEventBus {
        let bus = this.#buses.get(publicationId)
        if (!bus) {
            bus = new McpPublicationEventBus(this, publicationId)
            this.#buses.set(publicationId, bus)
        }
        return bus
    }

    eventsApi(publicationId: string, capabilities?: McpPublicationCapability[]): ToolEventsApi {
        return {
            emit: (event) => this.publishCapabilityEvent(publicationId, event, capabilities)
        }
    }

    eventsApiForToolset(toolsetId: string, fallback?: ToolEventsApi): ToolEventsApi {
        return {
            emit: async (event) => {
                if (event.type === 'task.updated' || !this.capabilityRepository) {
                    await fallback?.emit(event)
                    return
                }
                let capabilities: McpPublicationCapability[]
                try {
                    capabilities = await this.capabilityRepository.find({
                        where: { toolsetId, enabled: true, publication: { status: 'active' } },
                        relations: ['publication']
                    })
                } catch (error) {
                    this.#logger.warn(`Failed to route MCP capability event: ${errorMessage(error)}`)
                    await fallback?.emit(event)
                    return
                }
                const publications = new Map<string, McpPublicationCapability[]>()
                for (const capability of capabilities) {
                    const bound = publications.get(capability.publicationId) ?? []
                    bound.push(capability)
                    publications.set(capability.publicationId, bound)
                }
                if (!publications.size) {
                    await fallback?.emit(event)
                    return
                }
                for (const [publicationId, bindings] of publications) {
                    this.publishCapabilityEvent(publicationId, event, bindings)
                }
            }
        }
    }

    publishCatalogChanged(publicationId: string, capabilityTypes: string[]) {
        const types = new Set(capabilityTypes)
        if (types.has('tool')) this.publish(publicationId, { kind: 'tools_list_changed' })
        if (types.has('prompt')) this.publish(publicationId, { kind: 'prompts_list_changed' })
        if (types.has('resource') || types.has('resource_template') || types.has('app')) {
            this.publish(publicationId, { kind: 'resources_list_changed' })
        }
    }

    publishTaskUpdated(publicationId: string, taskId: string) {
        this.publishEvent(publicationId, { kind: 'task_updated', taskId })
    }

    publishAccessInvalidated(publicationId: string) {
        this.publishEvent(publicationId, { kind: 'access_invalidated' })
    }

    publish(publicationId: string, event: ServerEvent): void {
        this.publishEvent(publicationId, event)
    }

    private publishEvent(publicationId: string, event: McpPublicationEvent): void {
        this.deliver(publicationId, event)
        if (!this.redis) return
        const envelope: McpPublicationEventEnvelope = {
            version: 1,
            nodeId: this.#nodeId,
            publicationId,
            event
        }
        void this.redis
            .publish(MCP_SUBSCRIPTION_CHANNEL, JSON.stringify(envelope))
            .catch((error) => this.#logger.warn(`Failed to publish MCP subscription event: ${errorMessage(error)}`))
    }

    subscribe(publicationId: string, listener: (event: ServerEvent) => void): () => void {
        let listeners = this.#listeners.get(publicationId)
        if (!listeners) {
            listeners = new Set()
            this.#listeners.set(publicationId, listeners)
        }
        listeners.add(listener)
        return () => {
            listeners?.delete(listener)
            if (!listeners?.size) this.#listeners.delete(publicationId)
        }
    }

    subscribeTasks(publicationId: string, listener: (taskId: string) => void): () => void {
        let listeners = this.#taskListeners.get(publicationId)
        if (!listeners) {
            listeners = new Set()
            this.#taskListeners.set(publicationId, listeners)
        }
        listeners.add(listener)
        return () => {
            listeners?.delete(listener)
            if (!listeners?.size) this.#taskListeners.delete(publicationId)
        }
    }

    subscribeAccessInvalidations(publicationId: string, listener: () => void): () => void {
        let listeners = this.#accessInvalidationListeners.get(publicationId)
        if (!listeners) {
            listeners = new Set()
            this.#accessInvalidationListeners.set(publicationId, listeners)
        }
        listeners.add(listener)
        return () => {
            listeners?.delete(listener)
            if (!listeners?.size) this.#accessInvalidationListeners.delete(publicationId)
        }
    }

    private publishCapabilityEvent(
        publicationId: string,
        event: CapabilityChangeEvent,
        capabilities?: McpPublicationCapability[]
    ) {
        switch (event.type) {
            case 'tools.changed':
                if (hasPublishedCapabilityType(capabilities, ['tool'])) {
                    this.publish(publicationId, { kind: 'tools_list_changed' })
                }
                break
            case 'prompts.changed':
                if (hasPublishedCapabilityType(capabilities, ['prompt'])) {
                    this.publish(publicationId, { kind: 'prompts_list_changed' })
                }
                break
            case 'resources.changed':
                if (hasPublishedCapabilityType(capabilities, ['resource', 'resource_template', 'app'])) {
                    this.publish(publicationId, { kind: 'resources_list_changed' })
                }
                break
            case 'resource.updated':
                if (event.key && isPublishedResourceUri(event.key, capabilities)) {
                    this.publish(publicationId, { kind: 'resource_updated', uri: event.key })
                }
                break
            case 'task.updated':
                if (event.taskId) this.publishTaskUpdated(publicationId, event.taskId)
                break
        }
    }

    private receive(message: string) {
        let value: unknown
        try {
            value = JSON.parse(message)
        } catch {
            return
        }
        const envelope = parseEventEnvelope(value)
        if (!envelope || envelope.nodeId === this.#nodeId) return
        this.deliver(envelope.publicationId, envelope.event)
    }

    private deliver(publicationId: string, event: McpPublicationEvent) {
        if (event.kind === 'access_invalidated') {
            for (const listener of this.#accessInvalidationListeners.get(publicationId) ?? []) {
                try {
                    listener()
                } catch (error) {
                    this.#logger.warn(`MCP access invalidation listener failed: ${errorMessage(error)}`)
                }
            }
            return
        }
        if (event.kind === 'task_updated') {
            for (const listener of this.#taskListeners.get(publicationId) ?? []) {
                try {
                    listener(event.taskId)
                } catch (error) {
                    this.#logger.warn(`MCP task subscription listener failed: ${errorMessage(error)}`)
                }
            }
            return
        }
        for (const listener of this.#listeners.get(publicationId) ?? []) {
            try {
                listener(event)
            } catch (error) {
                this.#logger.warn(`MCP subscription listener failed: ${errorMessage(error)}`)
            }
        }
    }
}

function hasPublishedCapabilityType(
    capabilities: McpPublicationCapability[] | undefined,
    types: readonly McpCapabilityType[]
) {
    return (
        !capabilities || capabilities.some((capability) => types.includes(capability.descriptorSnapshot.capabilityType))
    )
}

export function isPublishedResourceUri(uri: string, capabilities?: McpPublicationCapability[]) {
    if (!safeResourceUri(uri)) return false
    if (!capabilities) return true
    return capabilities.some((capability) => {
        const descriptor = capability.descriptorSnapshot
        if (descriptor.capabilityType === 'resource') return descriptor.uri === uri
        if (descriptor.capabilityType !== 'resource_template') return false
        try {
            return new UriTemplate(descriptor.uriTemplate).match(uri) !== null
        } catch {
            return false
        }
    })
}

function safeResourceUri(value: string) {
    try {
        const rawPath = value.split(/[?#]/, 1)[0]
        if (decodeURIComponent(rawPath).split('/').includes('..')) return false
        const uri = new URL(value)
        return (
            !['file:', 'javascript:', 'data:'].includes(uri.protocol) &&
            !decodeURIComponent(uri.pathname).split('/').includes('..')
        )
    } catch {
        return false
    }
}

function parseEventEnvelope(value: unknown): McpPublicationEventEnvelope | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    if (Reflect.get(value, 'version') !== 1) return null
    const nodeId = Reflect.get(value, 'nodeId')
    const publicationId = Reflect.get(value, 'publicationId')
    const event = parsePublicationEvent(Reflect.get(value, 'event'))
    return typeof nodeId === 'string' && typeof publicationId === 'string' && event
        ? { version: 1, nodeId, publicationId, event }
        : null
}

function parsePublicationEvent(value: unknown): McpPublicationEvent | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const kind = Reflect.get(value, 'kind')
    const taskId = Reflect.get(value, 'taskId')
    if (kind === 'access_invalidated') return { kind }
    if (kind === 'task_updated' && typeof taskId === 'string' && taskId) {
        return { kind, taskId }
    }
    return parseServerEvent(value)
}

function parseServerEvent(value: unknown): ServerEvent | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const kind = Reflect.get(value, 'kind')
    if (kind === 'tools_list_changed' || kind === 'prompts_list_changed' || kind === 'resources_list_changed') {
        return { kind }
    }
    const uri = Reflect.get(value, 'uri')
    return kind === 'resource_updated' && typeof uri === 'string' && safeResourceUri(uri) ? { kind, uri } : null
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
