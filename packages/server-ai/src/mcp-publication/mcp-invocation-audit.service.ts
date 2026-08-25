import { JSONValue, McpPrincipal } from '@xpert-ai/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { McpInvocationAudit, McpPublication, McpPublicationCapability } from './entities'

export interface StartMcpAuditInput {
    publication: McpPublication
    principal: McpPrincipal
    capability?: McpPublicationCapability
    requestId: string
    traceId?: string
    clientName?: string
    arguments?: unknown
}

@Injectable()
export class McpInvocationAuditService {
    constructor(
        @InjectRepository(McpInvocationAudit)
        private readonly auditRepository: Repository<McpInvocationAudit>
    ) {}

    start(input: StartMcpAuditInput) {
        const capability = input.capability
        return this.auditRepository.save(
            this.auditRepository.create({
                publicationId: input.publication.id,
                tenantId: input.publication.tenantId,
                organizationId: input.publication.organizationId ?? null,
                capabilityId: capability?.id ?? null,
                toolsetId: capability?.toolsetId ?? null,
                capabilityKey: capability?.capabilityKey ?? null,
                publicName: capability?.publicName ?? null,
                authMethod: input.principal.authMethod,
                subjectType: input.principal.subjectType,
                subjectId: input.principal.subjectId,
                clientName: input.clientName ?? input.principal.credentialPrefix ?? null,
                requestId: input.requestId,
                traceId: input.traceId ?? null,
                status: 'started',
                argumentSummary: summarizeArguments(input.arguments)
            })
        )
    }

    async succeeded(audit: McpInvocationAudit, startedAt: number) {
        audit.status = 'succeeded'
        audit.durationMs = Date.now() - startedAt
        return this.auditRepository.save(audit)
    }

    async failed(audit: McpInvocationAudit, startedAt: number, error: unknown) {
        audit.status = error instanceof ForbiddenException ? 'denied' : 'failed'
        audit.durationMs = Date.now() - startedAt
        audit.errorCode = errorCode(error)
        return this.auditRepository.save(audit)
    }

    async search(publicationId: string, skip = 0, take = 10) {
        const normalizedSkip = Number.isFinite(skip) ? Math.max(Math.trunc(skip), 0) : 0
        const normalizedTake = Number.isFinite(take) ? Math.min(Math.max(Math.trunc(take), 1), 500) : 10
        const [items, total] = await this.auditRepository
            .createQueryBuilder('audit')
            .where('audit.publicationId = :publicationId', { publicationId })
            .orderBy('audit.createdAt', 'DESC')
            .skip(normalizedSkip)
            .take(normalizedTake)
            .getManyAndCount()
        return { items, total }
    }
}

function summarizeArguments(value: unknown): JSONValue | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'object' || Array.isArray(value)) {
        return { type: Array.isArray(value) ? 'array' : typeof value }
    }
    let bytes: number | null = null
    try {
        bytes = Buffer.byteLength(JSON.stringify(value))
    } catch {
        bytes = null
    }
    return {
        keys: Object.keys(value).slice(0, 100),
        ...(bytes === null ? {} : { bytes })
    }
}

function errorCode(error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
        return error.code.slice(0, 100)
    }
    if (error instanceof Error) return error.name.slice(0, 100)
    return 'UNKNOWN'
}
