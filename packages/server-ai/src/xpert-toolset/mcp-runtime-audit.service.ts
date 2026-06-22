import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PLUGIN_COMPONENT_TYPE } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { createHash } from 'node:crypto'
import { basename, isAbsolute } from 'node:path'
import { Brackets, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'
import { PluginResourceInstallation } from '../plugin-resource/plugin-resource-installation.entity'
import { McpRuntimeInstanceEntity } from './mcp-runtime-instance.entity'
import {
    McpRuntimeListFilter,
    McpRuntimeStatus,
    McpStdioRuntimeHandle,
    McpStdioRuntimeSnapshot,
    mcpStdioRuntimeManager
} from './provider/mcp/mcp-stdio-runtime'

const DEFAULT_RUNTIME_AUDIT_RETENTION_DAYS = 180
const ACTIVE_RUNTIME_STATUSES: McpRuntimeStatus[] = ['starting', 'running']
const LOST_RUNTIME_STATUSES: McpRuntimeStatus[] = ['starting', 'running', 'closing']

export type McpRuntimeAuditListQuery = McpRuntimeListFilter & {
    status?: McpRuntimeStatus | 'active' | 'all'
    activeOnly?: boolean | string
    organizationId?: string
    executionId?: string
    appInstanceId?: string
    from?: string
    to?: string
    limit?: number | string
    offset?: number | string
}

export type McpRuntimeAuditListItem = McpStdioRuntimeSnapshot & {
    live: boolean
    readyAt?: string
    startupDurationMs?: number
    durationMs?: number
    componentKey?: string
    pluginRuntimeId?: string
    resourceInstallationId?: string
    xpertId?: string
    agentKey?: string
    executionId?: string
    conversationId?: string
    appInstanceId?: string
    commandLabel?: string
    commandHash?: string
    policySnapshot?: Record<string, unknown>
}

export type McpRuntimeFilterOption = {
    value: string
    label: string
}

export type McpRuntimeFilterOptions = {
    workspaces: McpRuntimeFilterOption[]
    toolsets: McpRuntimeFilterOption[]
    plugins: McpRuntimeFilterOption[]
    executions: McpRuntimeFilterOption[]
    appInstances: McpRuntimeFilterOption[]
}

type McpRuntimeAuditScope = {
    tenantId?: string
    organizationId?: string
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readBoolean(value: unknown) {
    if (typeof value === 'boolean') {
        return value
    }
    if (typeof value !== 'string') {
        return undefined
    }
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false
    }
    return undefined
}

function readPositiveInteger(value: unknown, fallback: number, max: number) {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback
    }
    return Math.min(parsed, max)
}

function readDate(value: unknown) {
    const raw = readString(value)
    if (!raw) {
        return undefined
    }
    const date = new Date(raw)
    return Number.isFinite(date.getTime()) ? date : undefined
}

function defaultFromDate() {
    return new Date(Date.now() - DEFAULT_RUNTIME_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

function elapsedMs(start?: Date, end?: Date) {
    if (!start || !end) {
        return undefined
    }
    return Math.max(0, end.getTime() - start.getTime())
}

function sanitizeCommandArg(value: string) {
    if (/(token|secret|password|passwd|key)=/i.test(value)) {
        return '[redacted]'
    }
    const label = isAbsolute(value) ? basename(value) : value
    return label.length > 120 ? `${label.slice(0, 117)}...` : label
}

function commandLabel(runtime: McpStdioRuntimeHandle) {
    return [basename(runtime.context.command), ...runtime.context.args.map(sanitizeCommandArg)].join(' ').trim()
}

function commandHash(runtime: McpStdioRuntimeHandle) {
    return createHash('sha256')
        .update(JSON.stringify({ command: runtime.context.command, args: runtime.context.args }))
        .digest('hex')
}

function policySnapshot(runtime: McpStdioRuntimeHandle) {
    return {
        provider: runtime.context.policy.provider,
        startupTimeoutMs: runtime.context.policy.startupTimeoutMs,
        idleTimeoutMs: runtime.context.policy.idleTimeoutMs,
        maxLifetimeMs: runtime.context.policy.maxLifetimeMs,
        allowedCommands: runtime.context.policy.allowedCommands?.map((item) => basename(item))
    }
}

function optionFromValue(value: string | undefined | null): McpRuntimeFilterOption | null {
    return value ? { value, label: value } : null
}

function mergeOptions(...optionLists: Array<Array<McpRuntimeFilterOption | null | undefined>>) {
    const options = new Map<string, McpRuntimeFilterOption>()
    for (const option of optionLists.flat()) {
        if (!option?.value) {
            continue
        }
        const existing = options.get(option.value)
        if (!existing || existing.label === existing.value) {
            options.set(option.value, {
                value: option.value,
                label: option.label || option.value
            })
        }
    }
    return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label))
}

@Injectable()
export class McpRuntimeAuditService implements OnApplicationBootstrap {
    constructor(
        @InjectRepository(McpRuntimeInstanceEntity)
        private readonly runtimeRepo: Repository<McpRuntimeInstanceEntity>,
        @InjectRepository(PluginResourceInstallation)
        private readonly installationRepo: Repository<PluginResourceInstallation>
    ) {
        mcpStdioRuntimeManager.setAuditSink(this)
    }

    async onApplicationBootstrap() {
        await this.closeLostActiveRecords()
    }

    async recordStarting(runtime: McpStdioRuntimeHandle) {
        const installation = await this.findResourceInstallation(runtime)
        await this.runtimeRepo.save({
            id: runtime.id,
            tenantId: runtime.context.tenantId,
            organizationId: runtime.context.organizationId,
            workspaceId: runtime.context.workspaceId,
            toolsetId: runtime.context.toolsetId,
            toolsetName: runtime.context.toolsetName,
            serverName: runtime.context.serverName,
            pluginManaged: runtime.context.pluginManaged,
            pluginName: runtime.context.pluginName,
            componentKey: runtime.context.componentKey,
            pluginRuntimeId: runtime.context.pluginRuntimeId,
            resourceInstallationId: installation?.id,
            xpertId: runtime.context.xpertId,
            agentKey: runtime.context.agentKey,
            executionId: runtime.context.executionId,
            conversationId: runtime.context.conversationId,
            appInstanceId: runtime.context.appInstanceId,
            origin: runtime.context.origin,
            status: runtime.status,
            startedAt: runtime.startedAt,
            idleExpiresAt: runtime.idleExpiresAt,
            maxLifetimeExpiresAt: runtime.maxLifetimeExpiresAt,
            commandLabel: commandLabel(runtime),
            commandHash: commandHash(runtime),
            policySnapshot: policySnapshot(runtime)
        })
    }

    async recordRunning(runtime: McpStdioRuntimeHandle) {
        const readyAt = new Date()
        await this.runtimeRepo.update(runtime.id, {
            status: runtime.status,
            readyAt,
            startupDurationMs: elapsedMs(runtime.startedAt, readyAt),
            runnerPid: runtime.runnerPid,
            childPid: runtime.childPid,
            idleExpiresAt: runtime.idleExpiresAt,
            maxLifetimeExpiresAt: runtime.maxLifetimeExpiresAt,
            stderrTail: runtime.stderrTail
        })
    }

    async recordClosed(runtime: McpStdioRuntimeHandle) {
        const closedAt = runtime.closedAt ?? new Date()
        await this.runtimeRepo.update(runtime.id, {
            status: runtime.status,
            closedAt,
            closeReason: runtime.closeReason,
            durationMs: elapsedMs(runtime.startedAt, closedAt),
            runnerPid: runtime.runnerPid,
            childPid: runtime.childPid,
            idleExpiresAt: runtime.idleExpiresAt,
            maxLifetimeExpiresAt: runtime.maxLifetimeExpiresAt,
            stderrTail: runtime.stderrTail
        })
    }

    async recordAppInstance(runtime: McpStdioRuntimeHandle, appInstanceId: string) {
        await this.runtimeRepo
            .createQueryBuilder()
            .update(McpRuntimeInstanceEntity)
            .set({ appInstanceId })
            .where('id = :id', { id: runtime.id })
            .andWhere('appInstanceId IS NULL')
            .execute()
    }

    toRuntimeManagerFilter(query: McpRuntimeAuditListQuery = {}): McpRuntimeListFilter {
        const scope = this.resolveScope(query)
        return {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            workspaceId: readString(query.workspaceId),
            toolsetId: readString(query.toolsetId),
            pluginName: readString(query.pluginName),
            executionId: readString(query.executionId),
            appInstanceId: readString(query.appInstanceId)
        }
    }

    async list(query: McpRuntimeAuditListQuery = {}, liveSnapshots: McpStdioRuntimeSnapshot[] = []) {
        const limit = readPositiveInteger(query.limit, 100, 500)
        const offset = readPositiveInteger(query.offset, 0, 100_000)
        const from = readDate(query.from) ?? defaultFromDate()
        const to = readDate(query.to)
        const scope = this.resolveScope(query)
        const scopedLiveSnapshots = liveSnapshots.filter((snapshot) => this.matchesScope(snapshot, scope))
        const liveById = new Map(scopedLiveSnapshots.map((item) => [item.id, item]))

        const builder = this.runtimeRepo.createQueryBuilder('runtime').where('runtime.startedAt >= :from', { from })
        if (to) {
            builder.andWhere('runtime.startedAt <= :to', { to })
        }

        this.applyStringFilter(builder, 'runtime.tenantId', scope.tenantId)
        this.applyStringFilter(builder, 'runtime.organizationId', scope.organizationId)
        this.applyStringFilter(builder, 'runtime.workspaceId', query.workspaceId)
        this.applyStringFilter(builder, 'runtime.toolsetId', query.toolsetId)
        this.applyStringFilter(builder, 'runtime.pluginName', query.pluginName)
        this.applyStringFilter(builder, 'runtime.executionId', query.executionId)
        this.applyStringFilter(builder, 'runtime.appInstanceId', query.appInstanceId)

        const activeOnly = readBoolean(query.activeOnly)
        if (activeOnly || query.status === 'active') {
            builder.andWhere('runtime.status IN (:...activeStatuses)', { activeStatuses: ACTIVE_RUNTIME_STATUSES })
        } else if (query.status && query.status !== 'all') {
            builder.andWhere('runtime.status = :status', { status: query.status })
        }

        builder.orderBy('runtime.startedAt', 'DESC').skip(offset).take(limit)
        const [records, total] = await builder.getManyAndCount()
        const items = this.mergeLiveRecords(records, liveById)
        const recordIds = new Set(records.map((record) => record.id))
        const liveOnlyItems = scopedLiveSnapshots
            .filter((snapshot) => !recordIds.has(snapshot.id) && this.matchesLiveQuery(snapshot, query))
            .map((snapshot) => this.toLiveOnlyItem(snapshot))
        const options = await this.listFilterOptions(scope, from, to, scopedLiveSnapshots)

        return {
            items: [...liveOnlyItems, ...items],
            total: total + liveOnlyItems.length,
            limit,
            offset,
            options
        }
    }

    private applyStringFilter<Entity extends ObjectLiteral>(
        builder: SelectQueryBuilder<Entity>,
        column: string,
        value: unknown
    ) {
        const normalized = readString(value)
        if (normalized) {
            builder.andWhere(`${column} = :${column.replace(/\W/g, '_')}`, {
                [column.replace(/\W/g, '_')]: normalized
            })
        }
    }

    private resolveScope(query: McpRuntimeAuditListQuery): McpRuntimeAuditScope {
        return {
            tenantId: readString(query.tenantId) ?? RequestContext.currentTenantId() ?? undefined,
            organizationId: readString(query.organizationId) ?? RequestContext.getOrganizationId() ?? undefined
        }
    }

    private matchesScope(snapshot: McpStdioRuntimeSnapshot, scope: McpRuntimeAuditScope) {
        return (
            (!scope.tenantId || snapshot.tenantId === scope.tenantId) &&
            (!scope.organizationId || snapshot.organizationId === scope.organizationId)
        )
    }

    private createScopedOptionsBuilder(scope: McpRuntimeAuditScope, from: Date, to?: Date) {
        const builder = this.runtimeRepo.createQueryBuilder('runtime').where('runtime.startedAt >= :from', { from })
        if (to) {
            builder.andWhere('runtime.startedAt <= :to', { to })
        }
        this.applyStringFilter(builder, 'runtime.tenantId', scope.tenantId)
        this.applyStringFilter(builder, 'runtime.organizationId', scope.organizationId)
        return builder
    }

    private async listFilterOptions(
        scope: McpRuntimeAuditScope,
        from: Date,
        to: Date | undefined,
        liveSnapshots: McpStdioRuntimeSnapshot[]
    ): Promise<McpRuntimeFilterOptions> {
        const [workspaces, toolsets, plugins, executions, appInstances] = await Promise.all([
            this.workspaceOptions(scope, from, to, liveSnapshots),
            this.toolsetOptions(scope, from, to),
            this.distinctOptions('runtime.pluginName', scope, from, to),
            this.distinctOptions('runtime.executionId', scope, from, to),
            this.distinctOptions('runtime.appInstanceId', scope, from, to)
        ])

        return {
            workspaces,
            toolsets: mergeOptions(
                toolsets,
                liveSnapshots.map((snapshot) =>
                    snapshot.toolsetId
                        ? {
                              value: snapshot.toolsetId,
                              label: snapshot.toolsetName || snapshot.toolsetId
                          }
                        : null
                )
            ),
            plugins: mergeOptions(
                plugins,
                liveSnapshots.map((snapshot) => optionFromValue(snapshot.pluginName))
            ),
            executions: mergeOptions(
                executions,
                liveSnapshots.map((snapshot) => optionFromValue(snapshot.executionId))
            ),
            appInstances: mergeOptions(
                appInstances,
                liveSnapshots.map((snapshot) => optionFromValue(snapshot.appInstanceId))
            )
        }
    }

    private async distinctOptions(column: string, scope: McpRuntimeAuditScope, from: Date, to?: Date) {
        const rows = await this.createScopedOptionsBuilder(scope, from, to)
            .select(column, 'value')
            .addSelect(column, 'label')
            .andWhere(`${column} IS NOT NULL`)
            .andWhere(`${column} <> ''`)
            .groupBy(column)
            .orderBy(column, 'ASC')
            .limit(500)
            .getRawMany<McpRuntimeFilterOption>()

        return rows.filter((row) => row.value).map((row) => ({ value: row.value, label: row.label || row.value }))
    }

    private async workspaceOptions(
        scope: McpRuntimeAuditScope,
        from: Date,
        to: Date | undefined,
        liveSnapshots: McpStdioRuntimeSnapshot[]
    ) {
        const rows = await this.createScopedOptionsBuilder(scope, from, to)
            .leftJoin('xpert_workspace', 'workspace', '"workspace"."id"::text = "runtime"."workspaceId"')
            .select('runtime.workspaceId', 'value')
            .addSelect('COALESCE(MAX(workspace.name), runtime.workspaceId)', 'label')
            .andWhere('runtime.workspaceId IS NOT NULL')
            .andWhere("runtime.workspaceId <> ''")
            .groupBy('runtime.workspaceId')
            .orderBy('runtime.workspaceId', 'ASC')
            .limit(500)
            .getRawMany<McpRuntimeFilterOption>()

        const liveWorkspaceIds = Array.from(
            new Set(
                liveSnapshots.map((snapshot) => snapshot.workspaceId).filter((value): value is string => Boolean(value))
            )
        )
        const liveWorkspaceOptions = await this.liveWorkspaceOptions(liveWorkspaceIds, scope)

        return mergeOptions(
            rows.filter((row) => row.value).map((row) => ({ value: row.value, label: row.label || row.value })),
            liveWorkspaceOptions,
            liveWorkspaceIds.map((workspaceId) => optionFromValue(workspaceId))
        )
    }

    private async liveWorkspaceOptions(workspaceIds: string[], scope: McpRuntimeAuditScope) {
        if (!workspaceIds.length) {
            return []
        }
        const builder = this.runtimeRepo.manager
            .createQueryBuilder()
            .select('workspace.id', 'value')
            .addSelect('workspace.name', 'label')
            .from('xpert_workspace', 'workspace')
            .where('"workspace"."id"::text IN (:...workspaceIds)', { workspaceIds })
        this.applyStringFilter(builder, 'workspace.tenantId', scope.tenantId)
        this.applyStringFilter(builder, 'workspace.organizationId', scope.organizationId)
        const rows = await builder.getRawMany<McpRuntimeFilterOption>()
        return rows.filter((row) => row.value).map((row) => ({ value: row.value, label: row.label || row.value }))
    }

    private async toolsetOptions(scope: McpRuntimeAuditScope, from: Date, to?: Date) {
        const rows = await this.createScopedOptionsBuilder(scope, from, to)
            .select('runtime.toolsetId', 'value')
            .addSelect('COALESCE(MAX(runtime.toolsetName), runtime.toolsetId)', 'label')
            .andWhere('runtime.toolsetId IS NOT NULL')
            .andWhere("runtime.toolsetId <> ''")
            .groupBy('runtime.toolsetId')
            .orderBy('runtime.toolsetId', 'ASC')
            .limit(500)
            .getRawMany<McpRuntimeFilterOption>()

        return rows.filter((row) => row.value).map((row) => ({ value: row.value, label: row.label || row.value }))
    }

    private mergeLiveRecords(
        records: McpRuntimeInstanceEntity[],
        liveById: Map<string, McpStdioRuntimeSnapshot[] extends Array<infer T> ? T : never>
    ) {
        return records.map((record) => {
            const live = liveById.get(record.id)
            const merged = live
                ? {
                      ...this.toListItem(record, true),
                      ...live,
                      live: true,
                      commandLabel: record.commandLabel,
                      commandHash: record.commandHash,
                      policySnapshot: record.policySnapshot,
                      resourceInstallationId: record.resourceInstallationId
                  }
                : this.toListItem(record, false)
            return merged
        })
    }

    private matchesLiveQuery(snapshot: McpStdioRuntimeSnapshot, query: McpRuntimeAuditListQuery) {
        const activeOnly = readBoolean(query.activeOnly)
        if ((activeOnly || query.status === 'active') && !ACTIVE_RUNTIME_STATUSES.includes(snapshot.status)) {
            return false
        }
        if (query.status && query.status !== 'active' && query.status !== 'all' && snapshot.status !== query.status) {
            return false
        }
        const expected: Array<[unknown, unknown]> = [
            [snapshot.workspaceId, query.workspaceId],
            [snapshot.toolsetId, query.toolsetId],
            [snapshot.pluginName, query.pluginName],
            [snapshot.executionId, query.executionId],
            [snapshot.appInstanceId, query.appInstanceId]
        ]
        return expected.every(([actual, expectedValue]) => {
            const normalized = readString(expectedValue)
            return !normalized || actual === normalized
        })
    }

    private toLiveOnlyItem(snapshot: McpStdioRuntimeSnapshot): McpRuntimeAuditListItem {
        return {
            ...snapshot,
            live: true,
            commandLabel: snapshot.command,
            commandHash: undefined,
            policySnapshot: undefined
        }
    }

    private toListItem(record: McpRuntimeInstanceEntity, live: boolean): McpRuntimeAuditListItem {
        return {
            id: record.id,
            live,
            status: record.status,
            origin: record.origin ?? 'agent-toolset',
            tenantId: record.tenantId,
            organizationId: record.organizationId,
            workspaceId: record.workspaceId,
            toolsetId: record.toolsetId,
            toolsetName: record.toolsetName,
            serverName: record.serverName,
            pluginManaged: record.pluginManaged,
            pluginName: record.pluginName,
            componentKey: record.componentKey,
            pluginRuntimeId: record.pluginRuntimeId,
            resourceInstallationId: record.resourceInstallationId,
            xpertId: record.xpertId,
            agentKey: record.agentKey,
            executionId: record.executionId,
            conversationId: record.conversationId,
            appInstanceId: record.appInstanceId,
            command: record.commandLabel ?? '',
            commandLabel: record.commandLabel,
            commandHash: record.commandHash,
            policySnapshot: record.policySnapshot,
            runnerPid: record.runnerPid,
            childPid: record.childPid,
            startedAt: record.startedAt?.toISOString(),
            idleExpiresAt: record.idleExpiresAt?.toISOString(),
            maxLifetimeExpiresAt: record.maxLifetimeExpiresAt?.toISOString(),
            readyAt: record.readyAt?.toISOString(),
            closedAt: record.closedAt?.toISOString(),
            closeReason: record.closeReason,
            startupDurationMs: record.startupDurationMs,
            durationMs: record.durationMs,
            stderrTail: record.stderrTail
        }
    }

    private async closeLostActiveRecords() {
        const closedAt = new Date()
        await this.runtimeRepo
            .createQueryBuilder()
            .update(McpRuntimeInstanceEntity)
            .set({
                status: 'closed',
                closedAt,
                closeReason: 'host-restart-or-lost'
            })
            .where('status IN (:...statuses)', { statuses: LOST_RUNTIME_STATUSES })
            .execute()
    }

    private async findResourceInstallation(runtime: McpStdioRuntimeHandle) {
        if (!runtime.context.pluginManaged || !runtime.context.pluginName || !runtime.context.componentKey) {
            return null
        }
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.pluginName = :pluginName', { pluginName: runtime.context.pluginName })
            .andWhere('installation.componentType = :componentType', {
                componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER
            })
            .andWhere('installation.componentKey = :componentKey', { componentKey: runtime.context.componentKey })
        if (runtime.context.toolsetId) {
            query.andWhere('installation.runtimeId = :runtimeId', { runtimeId: runtime.context.toolsetId })
        }
        if (runtime.context.workspaceId) {
            query.andWhere('installation.workspaceId = :workspaceId', { workspaceId: runtime.context.workspaceId })
        }
        query.andWhere(
            new Brackets((inner) => {
                if (runtime.context.xpertId) {
                    inner.where('installation.xpertId = :xpertId', { xpertId: runtime.context.xpertId })
                } else {
                    inner.where('installation.xpertId IS NULL').orWhere('installation.xpertId IS NOT NULL')
                }
            })
        )
        return query.orderBy('installation.updatedAt', 'DESC').getOne()
    }
}
