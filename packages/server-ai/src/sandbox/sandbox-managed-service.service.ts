import {
    ISandboxManagedService,
    SandboxManagedServiceErrorCode,
    TSandboxManagedServiceEnvEntry,
    TSandboxManagedServiceLogs,
    TSandboxManagedServiceStartInput
} from '@xpert-ai/contracts'
import {
    resolveSandboxManagedServiceAdapter,
    resolveSandboxServiceProxyAdapter,
    SandboxManagedServiceStateChange
} from '@xpert-ai/plugin-sdk'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, Repository } from 'typeorm'
import type { Request, Response } from 'express'
import { join } from 'path'
import { ChatConversationService } from '../chat-conversation'
import { SandboxConversationContextService } from './sandbox-conversation-context.service'
import { SandboxManagedServiceEntity } from './sandbox-managed-service.entity'
import { SandboxManagedServiceError } from './sandbox-managed-service.error'

type SandboxManagedServiceMetadata = {
    error?: string | null
    launch?: {
        env?: TSandboxManagedServiceEnvEntry[]
        readyPattern?: string | null
    }
    logs?: {
        stderrPath: string
        stdoutPath: string
    }
}

type MetadataCandidate = {
    error?: unknown
    launch?: {
        env?: unknown
        readyPattern?: unknown
    }
    logs?: {
        stderrPath?: unknown
        stdoutPath?: unknown
    }
}

function isObjectLike(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isPreviewableService(service: Pick<ISandboxManagedService, 'id' | 'status' | 'transportMode'>): boolean {
    return Boolean(service.id) && service.status === 'running' && service.transportMode === 'http'
}

function normalizePreviewPath(value: string | null | undefined): string | null {
    if (!isNonEmptyString(value)) {
        return null
    }

    return value.startsWith('/') ? value : `/${value}`
}

function isEnvEntry(value: unknown): value is TSandboxManagedServiceEnvEntry {
    if (!isObjectLike(value)) {
        return false
    }

    return 'name' in value && 'value' in value && isNonEmptyString(value.name) && typeof value.value === 'string'
}

function readServiceMetadata(value: ISandboxManagedService['metadata']): SandboxManagedServiceMetadata {
    if (!isObjectLike(value)) {
        return {}
    }

    const metadata = value as MetadataCandidate
    const result: SandboxManagedServiceMetadata = {}

    if (isNonEmptyString(metadata.error)) {
        result.error = metadata.error
    }

    if (isObjectLike(metadata.logs)) {
        const { stdoutPath, stderrPath } = metadata.logs
        if (isNonEmptyString(stdoutPath) && isNonEmptyString(stderrPath)) {
            result.logs = { stderrPath, stdoutPath }
        }
    }

    if (isObjectLike(metadata.launch)) {
        const env = Array.isArray(metadata.launch.env) ? metadata.launch.env.filter((entry) => isEnvEntry(entry)) : []
        result.launch = {
            ...(env.length ? { env } : {}),
            ...(isNonEmptyString(metadata.launch.readyPattern) ? { readyPattern: metadata.launch.readyPattern } : {})
        }
    }

    return result
}

@Injectable()
export class SandboxManagedServiceService implements OnModuleInit {
    constructor(
        @InjectRepository(SandboxManagedServiceEntity)
        private readonly repository: Repository<SandboxManagedServiceEntity>,
        private readonly conversationService: ChatConversationService,
        private readonly sandboxConversationContextService: SandboxConversationContextService
    ) {}

    async onModuleInit(): Promise<void> {
        await this.repository
            .createQueryBuilder()
            .update(SandboxManagedServiceEntity)
            .set({
                status: 'lost',
                stoppedAt: new Date()
            })
            .where('status IN (:...statuses)', {
                statuses: ['running', 'starting']
            })
            .execute()
    }

    async listByConversationId(conversationId: string): Promise<ISandboxManagedService[]> {
        const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({ conversationId })
        const adapter = resolveSandboxManagedServiceAdapter(resolved.sandbox)
        if (!adapter) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.UnsupportedProvider,
                `Sandbox provider "${resolved.provider}" does not support managed services.`,
                400
            )
        }

        const entities = await this.repository.find({
            where: { conversationId } as FindOptionsWhere<SandboxManagedServiceEntity>,
            order: { createdAt: 'DESC' }
        })
        const result = await adapter.listServices({
            services: entities.map((entity) => this.toModel(entity))
        })

        const updatedById = new Map(
            result.services
                .filter((service): service is ISandboxManagedService & { id: string } => isNonEmptyString(service.id))
                .map((service) => [service.id, service])
        )
        for (const entity of entities) {
            const updated = updatedById.get(entity.id)
            if (!updated) {
                continue
            }
            this.applyModel(entity, updated)
        }
        if (entities.length) {
            await this.repository.save(entities)
        }

        return entities.map((entity) => this.toModel(entity))
    }

    async listByThreadId(threadId: string): Promise<ISandboxManagedService[]> {
        const conversation = await this.requireConversationByThreadId(threadId)
        return this.listByConversationId(conversation.id)
    }

    async startByConversationId(
        conversationId: string,
        input: TSandboxManagedServiceStartInput,
        owner?: { agentKey?: string | null; executionId?: string | null }
    ): Promise<ISandboxManagedService> {
        const conversation = await this.requireConversation(conversationId)
        const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({ conversationId })
        const adapter = resolveSandboxManagedServiceAdapter(resolved.sandbox)

        if (!adapter) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.UnsupportedProvider,
                `Sandbox provider "${resolved.provider}" does not support managed services.`,
                400
            )
        }

        const existing = await this.repository.findOne({
            where: {
                conversationId,
                name: input.name
            } as FindOptionsWhere<SandboxManagedServiceEntity>
        })

        if (existing && !input.replaceExisting) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.ServiceNameConflict,
                `A sandbox service named "${input.name}" already exists in this conversation.`,
                409
            )
        }

        if (existing?.id && input.replaceExisting) {
            await adapter.stopService({
                onStateChange: (change) => this.updateState(existing.id, change),
                service: this.toModel(existing)
            })
        }

        const entity = existing ?? this.repository.create()
        entity.conversationId = conversationId
        entity.organizationId = conversation.organizationId
        entity.tenantId = conversation.tenantId
        entity.provider = resolved.provider
        entity.name = input.name
        entity.command = input.command
        entity.workingDirectory = input.cwd?.trim() || resolved.workingDirectory
        entity.requestedPort = input.port ?? null
        entity.actualPort = input.port ?? null
        entity.previewPath = normalizePreviewPath(input.previewPath)
        entity.status = 'starting'
        entity.runtimeRef = null
        entity.transportMode = input.port ? 'http' : 'none'
        entity.ownerExecutionId = owner?.executionId?.trim() || null
        entity.ownerAgentKey = owner?.agentKey?.trim() || null
        entity.startedAt = new Date()
        entity.stoppedAt = null
        entity.exitCode = null
        entity.signal = null
        entity.metadata = {
            launch: {
                ...(input.env?.length ? { env: input.env } : {}),
                ...(isNonEmptyString(input.readyPattern) ? { readyPattern: input.readyPattern } : {})
            },
            logs: this.buildLogPaths(entity.workingDirectory, existing?.id ?? entity.id ?? 'pending'),
            error: null
        }
        let saved = await this.repository.save(entity)
        saved.metadata = {
            ...readServiceMetadata(saved.metadata),
            logs: this.buildLogPaths(saved.workingDirectory, saved.id)
        }
        saved = await this.repository.save(saved)

        try {
            const result = await adapter.startService({
                command: saved.command,
                cwd: saved.workingDirectory,
                env: input.env,
                metadata: saved.metadata,
                onStateChange: (change) => this.updateState(saved.id, change),
                port: saved.requestedPort ?? null,
                previewPath: saved.previewPath,
                readyPattern: input.readyPattern ?? null,
                serviceId: saved.id
            })
            this.applyState(saved, result)
            saved = await this.repository.save(saved)
            return this.toModel(saved)
        } catch (error) {
            saved.status = 'failed'
            saved.stoppedAt = new Date()
            saved.metadata = {
                ...readServiceMetadata(saved.metadata),
                error: error instanceof Error ? error.message : String(error)
            }
            await this.repository.save(saved)
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.ServiceStartFailed,
                error instanceof Error ? error.message : String(error),
                400
            )
        }
    }

    async startByThreadId(
        threadId: string,
        input: TSandboxManagedServiceStartInput,
        owner?: { agentKey?: string | null; executionId?: string | null }
    ): Promise<ISandboxManagedService> {
        const conversation = await this.requireConversationByThreadId(threadId)
        return this.startByConversationId(conversation.id, input, owner)
    }

    async getLogsByConversationId(
        conversationId: string,
        serviceId: string,
        tail = 200
    ): Promise<TSandboxManagedServiceLogs> {
        const service = await this.requireService(conversationId, serviceId)
        const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({ conversationId })
        const adapter = resolveSandboxManagedServiceAdapter(resolved.sandbox)
        if (!adapter) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.UnsupportedProvider,
                `Sandbox provider "${resolved.provider}" does not support managed services.`,
                400
            )
        }

        return adapter.getServiceLogs({
            service: this.toModel(service),
            tail
        })
    }

    async getLogsByThreadId(threadId: string, serviceId: string, tail = 200): Promise<TSandboxManagedServiceLogs> {
        const conversation = await this.requireConversationByThreadId(threadId)
        return this.getLogsByConversationId(conversation.id, serviceId, tail)
    }

    async getByConversationId(conversationId: string, serviceId: string): Promise<ISandboxManagedService> {
        const service = await this.requireService(conversationId, serviceId)
        return this.toModel(service)
    }

    async getByThreadId(threadId: string, serviceId: string): Promise<ISandboxManagedService> {
        const conversation = await this.requireConversationByThreadId(threadId)
        return this.getByConversationId(conversation.id, serviceId)
    }

    async stopByConversationId(conversationId: string, serviceId: string): Promise<ISandboxManagedService> {
        const service = await this.requireService(conversationId, serviceId)
        const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({ conversationId })
        const adapter = resolveSandboxManagedServiceAdapter(resolved.sandbox)
        if (!adapter) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.UnsupportedProvider,
                `Sandbox provider "${resolved.provider}" does not support managed services.`,
                400
            )
        }

        const result = await adapter.stopService({
            onStateChange: (change) => this.updateState(service.id, change),
            service: this.toModel(service)
        })
        this.applyState(service, result)
        const saved = await this.repository.save(service)
        return this.toModel(saved)
    }

    async stopByThreadId(threadId: string, serviceId: string): Promise<ISandboxManagedService> {
        const conversation = await this.requireConversationByThreadId(threadId)
        return this.stopByConversationId(conversation.id, serviceId)
    }

    async restartByConversationId(conversationId: string, serviceId: string): Promise<ISandboxManagedService> {
        const service = await this.requireService(conversationId, serviceId)
        const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({ conversationId })
        const adapter = resolveSandboxManagedServiceAdapter(resolved.sandbox)
        if (!adapter) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.UnsupportedProvider,
                `Sandbox provider "${resolved.provider}" does not support managed services.`,
                400
            )
        }

        const metadata = readServiceMetadata(service.metadata)
        const result = await adapter.restartService({
            command: service.command,
            cwd: service.workingDirectory,
            env: metadata.launch?.env,
            metadata: service.metadata,
            onStateChange: (change) => this.updateState(service.id, change),
            port: service.requestedPort ?? null,
            previewPath: service.previewPath,
            readyPattern: metadata.launch?.readyPattern ?? null,
            service: this.toModel(service)
        })
        this.applyState(service, result)
        const saved = await this.repository.save(service)
        return this.toModel(saved)
    }

    async restartByThreadId(threadId: string, serviceId: string): Promise<ISandboxManagedService> {
        const conversation = await this.requireConversationByThreadId(threadId)
        return this.restartByConversationId(conversation.id, serviceId)
    }

    async proxyByConversationId(
        conversationId: string,
        serviceId: string,
        requestPath: string,
        request: Request,
        response: Response
    ): Promise<void> {
        const service = await this.requireService(conversationId, serviceId)
        const resolved = await this.sandboxConversationContextService.resolveConversationSandbox({ conversationId })
        const adapter = resolveSandboxServiceProxyAdapter(resolved.sandbox)
        if (!adapter) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.UnsupportedProvider,
                `Sandbox provider "${resolved.provider}" does not support preview proxying.`,
                400
            )
        }

        await adapter.proxyServiceRequest({
            path: requestPath,
            request,
            response,
            service: this.toModel(service)
        })
    }

    private async requireConversation(conversationId: string) {
        const conversation = await this.conversationService.findOne({
            where: { id: conversationId }
        })
        if (!conversation) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.ConversationNotFound,
                'Conversation was not found.',
                404
            )
        }

        return conversation
    }

    private async requireConversationByThreadId(threadId: string) {
        const conversation = await this.conversationService.findOneByThreadId(threadId)
        if (!conversation) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.ConversationNotFound,
                'Conversation was not found.',
                404
            )
        }

        return conversation
    }

    private async requireService(conversationId: string, serviceId: string) {
        const service = await this.repository.findOne({
            where: {
                conversationId,
                id: serviceId
            } as FindOptionsWhere<SandboxManagedServiceEntity>
        })
        if (!service) {
            throw new SandboxManagedServiceError(
                SandboxManagedServiceErrorCode.ServiceNotFound,
                'Sandbox service was not found.',
                404
            )
        }

        return service
    }

    private buildLogPaths(workingDirectory: string, serviceId: string) {
        const basePath = join(workingDirectory, '.xpert', 'managed-services', serviceId)
        return {
            stderrPath: join(basePath, 'stderr.log'),
            stdoutPath: join(basePath, 'stdout.log')
        }
    }

    private buildPreviewUrl(service: ISandboxManagedService): string | null {
        if (!isPreviewableService(service)) {
            return null
        }

        const previewPath = normalizePreviewPath(service.previewPath) ?? '/'
        return previewPath === '/'
            ? `/api/sandbox/conversations/${service.conversationId}/services/${service.id}/proxy/`
            : `/api/sandbox/conversations/${service.conversationId}/services/${service.id}/proxy${previewPath}`
    }

    private applyState(entity: SandboxManagedServiceEntity, state: SandboxManagedServiceStateChange) {
        entity.status = state.status
        entity.actualPort = state.actualPort ?? entity.actualPort ?? null
        entity.runtimeRef = state.runtimeRef ?? entity.runtimeRef ?? null
        entity.transportMode = state.transportMode ?? entity.transportMode ?? null
        if (state.startedAt) {
            entity.startedAt = state.startedAt
        }
        if (state.stoppedAt !== undefined) {
            entity.stoppedAt = state.stoppedAt
        }
        if (state.exitCode !== undefined) {
            entity.exitCode = state.exitCode
        }
        if (state.signal !== undefined) {
            entity.signal = state.signal
        }
    }

    private applyModel(entity: SandboxManagedServiceEntity, model: ISandboxManagedService) {
        entity.provider = model.provider
        entity.name = model.name
        entity.command = model.command
        entity.workingDirectory = model.workingDirectory
        entity.requestedPort = model.requestedPort ?? null
        entity.actualPort = model.actualPort ?? null
        entity.previewPath = model.previewPath ?? null
        entity.status = model.status
        entity.runtimeRef = model.runtimeRef ?? null
        entity.transportMode = model.transportMode ?? null
        entity.ownerExecutionId = model.ownerExecutionId ?? null
        entity.ownerAgentKey = model.ownerAgentKey ?? null
        entity.startedAt = model.startedAt ? new Date(model.startedAt) : null
        entity.stoppedAt = model.stoppedAt ? new Date(model.stoppedAt) : null
        entity.exitCode = model.exitCode ?? null
        entity.signal = model.signal ?? null
        entity.metadata = model.metadata ?? null
    }

    private async updateState(serviceId: string, state: SandboxManagedServiceStateChange): Promise<void> {
        const entity = await this.repository.findOne({
            where: { id: serviceId } as FindOptionsWhere<SandboxManagedServiceEntity>
        })
        if (!entity) {
            return
        }

        this.applyState(entity, state)
        await this.repository.save(entity)
    }

    private toModel(entity: SandboxManagedServiceEntity): ISandboxManagedService {
        return {
            actualPort: entity.actualPort ?? null,
            command: entity.command,
            conversationId: entity.conversationId,
            exitCode: entity.exitCode ?? null,
            id: entity.id,
            metadata: entity.metadata ?? null,
            name: entity.name,
            ownerAgentKey: entity.ownerAgentKey ?? null,
            ownerExecutionId: entity.ownerExecutionId ?? null,
            previewPath: entity.previewPath ?? null,
            previewUrl: this.buildPreviewUrl(entity),
            provider: entity.provider,
            requestedPort: entity.requestedPort ?? null,
            runtimeRef: entity.runtimeRef ?? null,
            signal: entity.signal ?? null,
            startedAt: entity.startedAt ?? null,
            status: entity.status,
            stoppedAt: entity.stoppedAt ?? null,
            transportMode: entity.transportMode ?? null,
            workingDirectory: entity.workingDirectory
        }
    }
}
