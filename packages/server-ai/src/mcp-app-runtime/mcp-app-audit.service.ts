import { JSONValue } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { applicationMetrics } from '../metrics/application-metrics'
import type { McpAppInstance } from '../xpert-toolset/provider/mcp/app-support'
import { McpAppAudit, McpAppAuditOutcome } from './mcp-app-audit.entity'
import type { McpAppToolRisk } from './mcp-app-tool-approval.service'

const MCP_APP_METRIC_METHODS = new Set([
    'notifications/message',
    'ping',
    'prompts/list',
    'resources/list',
    'resources/read',
    'resources/templates/list',
    'tools/call',
    'tools/list',
    'ui/download-file',
    'ui/host-context-changed',
    'ui/message',
    'ui/request-display-mode',
    'ui/resource-teardown',
    'ui/update-model-context'
])

export interface StartMcpAppAuditInput {
    instance: McpAppInstance
    method: string
    params?: unknown
    toolName?: string
    risk?: McpAppToolRisk
    approvalId?: string
}

@Injectable()
export class McpAppAuditService {
    constructor(
        @InjectRepository(McpAppAudit)
        private readonly repository: Repository<McpAppAudit>
    ) {}

    start(input: StartMcpAppAuditInput) {
        return this.repository.save(
            this.repository.create({
                tenantId: input.instance.toolset.tenantId,
                organizationId: input.instance.toolset.organizationId ?? null,
                workspaceId: input.instance.toolset.workspaceId ?? null,
                toolsetId: input.instance.toolset.id,
                appInstanceId: input.instance.id,
                userId: RequestContext.currentUserId() ?? null,
                method: input.method.slice(0, 191),
                toolName: input.toolName?.slice(0, 191) ?? null,
                risk: input.risk ?? null,
                approvalId: input.approvalId?.slice(0, 64) ?? null,
                outcome: 'started',
                requestSummary: summarize(input.params)
            })
        )
    }

    finish(
        audit: McpAppAudit,
        startedAt: number,
        outcome: Exclude<McpAppAuditOutcome, 'started'>,
        options?: { error?: unknown; toolName?: string; risk?: McpAppToolRisk; approvalId?: string }
    ) {
        audit.outcome = outcome
        audit.durationMs = Date.now() - startedAt
        audit.toolName = options?.toolName?.slice(0, 191) ?? audit.toolName ?? null
        audit.risk = options?.risk ?? audit.risk ?? null
        audit.approvalId = options?.approvalId?.slice(0, 64) ?? audit.approvalId ?? null
        audit.errorCode = options?.error ? errorCode(options.error) : null
        applicationMetrics.recordMcpAppRpc({
            method: mcpAppMetricMethod(audit.method),
            publicationId: 'consumer',
            status: outcome
        })
        return this.repository.save(audit)
    }
}

function mcpAppMetricMethod(method: string) {
    if (MCP_APP_METRIC_METHODS.has(method)) return method
    return method.startsWith('ui/notifications/') ? 'ui/notifications/*' : 'unknown'
}

function summarize(value: unknown): JSONValue | null {
    if (value === undefined || value === null) return null
    let bytes: number | null = null
    try {
        bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
    } catch {
        bytes = null
    }

    if (Array.isArray(value)) {
        return { type: 'array', length: value.length, ...(bytes === null ? {} : { bytes }) }
    }
    if (typeof value !== 'object') {
        return { type: typeof value, ...(bytes === null ? {} : { bytes }) }
    }
    return {
        type: 'object',
        keys: Object.keys(value).slice(0, 100),
        ...(bytes === null ? {} : { bytes })
    }
}

function errorCode(error: unknown) {
    if (typeof error === 'object' && error !== null) {
        const value = Reflect.get(error, 'code')
        if (typeof value === 'string' || typeof value === 'number') return String(value).slice(0, 100)
        const status = Reflect.get(error, 'status')
        if (typeof status === 'number') return String(status)
    }
    return error instanceof Error ? error.name.slice(0, 100) : 'UNKNOWN'
}
