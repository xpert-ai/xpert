// Invariants: delayed calls recheck publication, binding, and user membership before restoring host APIs.
import {
    canAllowMcpToolDirectly,
    defaultMcpToolApprovalMode,
    type McpPrincipal,
    type McpPublicationRuntimeConfiguration
} from '@xpert-ai/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { runWithCapturedRequestContext } from '../shared/request-context'
import { McpPublication, McpPublicationCapability, McpTask } from './entities'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'
import { McpPublicationService } from './mcp-publication.service'
import { parseMcpRuntimeConfiguration } from './mcp-runtime-configuration'
import type { McpTaskJobPayload } from './mcp-task.service'

@Injectable()
export class McpTaskExecutionService {
    constructor(
        @InjectRepository(McpPublication) private readonly publications: Repository<McpPublication>,
        private readonly catalog: McpPublicationService,
        private readonly authorization: McpPublicationAuthorizationService
    ) {}

    async run<T>(
        task: McpTask,
        payload: McpTaskJobPayload,
        execute: (runtime: McpPublicationRuntimeConfiguration | null) => Promise<T>
    ) {
        if (
            task.publicationId !== payload.publicationId ||
            task.tenantId !== payload.tenantId ||
            task.capabilityId !== payload.capabilityId ||
            task.subjectType !== payload.principal.type ||
            task.subjectId !== payload.principal.id ||
            (task.subjectType === 'user' && payload.principal.userId !== task.subjectId) ||
            (task.organizationId ?? null) !== (payload.organizationId ?? null)
        ) {
            throw denied()
        }
        const publication = await this.publications.findOne({
            where: { id: task.publicationId, tenantId: task.tenantId, status: 'active' },
            relations: ['capabilities']
        })
        if (!publication) throw denied()
        const bindings = await this.catalog.resolveRuntimeCapabilities(publication)
        const binding = bindings.find((candidate) => candidate.id === task.capabilityId)
        if (!canExecute(binding, payload)) throw denied()
        const principal: McpPrincipal = {
            authMethod: 'api_key',
            publicationId: task.publicationId,
            tenantId: task.tenantId,
            organizationId: task.organizationId ?? undefined,
            subjectType: task.subjectType,
            subjectId: task.subjectId,
            userId: payload.principal.userId,
            clientId: payload.principal.clientId,
            scopes: [`tools:call:${task.toolName}`]
        }
        const user = await this.authorization.assertCanRun(publication, principal)
        const runtime = parseMcpRuntimeConfiguration(publication.runtime)
        // A queue retry must not silently select a different model or storage binding.
        if (JSON.stringify(runtime) !== JSON.stringify(payload.runtime ?? null)) throw denied()
        return runWithCapturedRequestContext(
            {
                user,
                headers: {
                    'tenant-id': principal.tenantId,
                    ...(principal.organizationId ? { 'organization-id': principal.organizationId } : {})
                }
            },
            () => execute(runtime)
        )
    }
}

function canExecute(binding: McpPublicationCapability | undefined, payload: McpTaskJobPayload) {
    if (
        !binding ||
        !binding.enabled ||
        binding.toolsetId !== payload.toolsetId ||
        binding.capabilityKey !== payload.capabilityKey
    )
        return false
    const descriptor = binding.descriptorSnapshot
    if (descriptor.capabilityType !== 'tool') return false
    const mode = binding.policy?.approvalMode ?? defaultMcpToolApprovalMode(descriptor)
    if (mode === 'confirm') return payload.approvalGranted === true
    return mode === 'allow' && canAllowMcpToolDirectly(descriptor)
}

function denied() {
    return new ForbiddenException(
        t('server-ai:Error.McpTaskExecutionChanged', {
            defaultValue:
                'The MCP task execution scope, configuration, or capability is no longer available. Start a new request.'
        })
    )
}
