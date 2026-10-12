import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { McpAppHistory } from './mcp-app-history.entity'
import { parseMiddlewareAppSource } from './middleware-app-source'
import { readMcpAppExecutionContext } from './mcp-app-execution-context'
import { parseMcpAppInstanceSnapshot, type McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

export const MCP_APP_HISTORY_MAX_BYTES = 40 * 1024 * 1024

/** Only a trusted initial server snapshot may be inserted; history is never a live authorization grant. */
@Injectable()
export class McpAppHistoryStoreService {
    private readonly logger = new Logger(McpAppHistoryStoreService.name)

    constructor(@InjectRepository(McpAppHistory) private readonly repository: Repository<McpAppHistory>) {}

    async preserve(snapshot: McpAppInstanceSnapshot): Promise<void> {
        if (!snapshot.tenantId || !snapshot.organizationId || !snapshot.executionContext) return
        const durable = initialSnapshot(snapshot)
        if (!durable.executionContext || !serializedWithinLimit(durable)) {
            this.logger.warn('MCP App initial history was not persisted: invalid or oversized snapshot')
            return
        }

        await this.repository
            .createQueryBuilder()
            .insert()
            .into(McpAppHistory)
            .values({
                id: durable.appInstanceId,
                tenantId: durable.tenantId,
                organizationId: durable.organizationId,
                conversationId: durable.executionContext.conversationId,
                executionId: durable.executionContext.executionId,
                snapshot: durable
            })
            .orIgnore()
            .execute()
    }

    async find(appInstanceId: string): Promise<McpAppInstanceSnapshot | null> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId) return null

        const row = await this.repository.findOne({
            where: { id: appInstanceId, tenantId, organizationId },
            select: {
                id: true,
                tenantId: true,
                organizationId: true,
                conversationId: true,
                executionId: true,
                snapshot: true
            }
        })
        if (!row || !serializedWithinLimit(row.snapshot)) return null
        const snapshot = parseMcpAppInstanceSnapshot(row.snapshot)
        if (
            !snapshot ||
            row.id !== appInstanceId ||
            row.tenantId !== tenantId ||
            row.organizationId !== organizationId ||
            snapshot.appInstanceId !== row.id ||
            snapshot.tenantId !== tenantId ||
            snapshot.organizationId !== organizationId ||
            snapshot.executionContext?.conversationId !== row.conversationId ||
            snapshot.executionContext?.executionId !== row.executionId
        )
            return null

        // The original lease can be expired. Resume must obtain current access before minting a new lease.
        return initialSnapshot(snapshot)
    }
}

function initialSnapshot(snapshot: McpAppInstanceSnapshot): McpAppInstanceSnapshot {
    return {
        version: 1,
        stateVersion: snapshot.stateVersion,
        appInstanceId: snapshot.appInstanceId,
        tenantId: snapshot.tenantId,
        organizationId: snapshot.organizationId,
        workspaceId: snapshot.workspaceId,
        userId: snapshot.userId,
        executionContext: readMcpAppExecutionContext(snapshot.executionContext),
        toolsetId: snapshot.toolsetId,
        source: parseMiddlewareAppSource(snapshot.source),
        serverName: snapshot.serverName,
        toolName: snapshot.toolName,
        displayName: snapshot.displayName,
        resourceUri: snapshot.resourceUri,
        toolCallId: snapshot.toolCallId,
        toolInput: snapshot.toolInput,
        toolResult: withoutResultPrivateMeta(snapshot.toolResult),
        createdAt: snapshot.createdAt,
        expiresAt: snapshot.expiresAt
    }
}

function withoutResultPrivateMeta(result: unknown): unknown {
    if (typeof result !== 'object' || result === null || Array.isArray(result)) return result
    // MCP private metadata may contain transient runtime material; business content is preserved verbatim.
    return Object.fromEntries(Object.entries(result).filter(([key]) => key !== '_meta'))
}

function serializedWithinLimit(value: unknown): boolean {
    try {
        const serialized = JSON.stringify(value)
        return typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') <= MCP_APP_HISTORY_MAX_BYTES
    } catch {
        return false
    }
}
