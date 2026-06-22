jest.mock('../plugin-resource/plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    RequestContext: {
        ...jest.requireActual('@xpert-ai/server-core').RequestContext,
        currentTenantId: jest.fn(() => 'tenant-1'),
        getOrganizationId: jest.fn(() => 'org-1')
    }
}))

import { McpRuntimeAuditService } from './mcp-runtime-audit.service'
import { McpStdioRuntimeHandle } from './provider/mcp/mcp-stdio-runtime'

function createQueryBuilderMock(result: unknown = null) {
    return {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => result),
        getManyAndCount: jest.fn(async () => [[], 0]),
        getRawMany: jest.fn(async () => []),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => ({ affected: 1 }))
    }
}

function createRuntime() {
    return new McpStdioRuntimeHandle({
        origin: 'agent-toolset',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        toolsetId: 'toolset-1',
        toolsetName: 'ECharts MCP',
        serverName: 'echarts-drilldown',
        pluginManaged: true,
        pluginName: '@xpert-ai/plugin-echarts-mcp-app',
        componentKey: 'echarts-drilldown',
        pluginRuntimeId: 'toolset-1',
        xpertId: 'xpert-1',
        agentKey: 'agent-1',
        executionId: 'execution-1',
        conversationId: 'conversation-1',
        appInstanceId: 'app-1',
        command: '/usr/local/bin/node',
        args: ['/plugins/echarts/dist/mcp-server.js', '--api-token=secret-value'],
        policy: {
            provider: 'local-process',
            startupTimeoutMs: 15000,
            idleTimeoutMs: 1800000,
            maxLifetimeMs: 7200000,
            allowedCommands: ['node']
        }
    })
}

describe('McpRuntimeAuditService', () => {
    it('persists sanitized runtime start records with plugin/toolset relations', async () => {
        const runtimeRepo = {
            save: jest.fn(async (value) => value),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => createQueryBuilderMock())
        }
        const installationRepo = {
            createQueryBuilder: jest.fn(() => createQueryBuilderMock({ id: 'installation-1' }))
        }
        const service = new McpRuntimeAuditService(runtimeRepo as never, installationRepo as never)
        const runtime = createRuntime()

        await service.recordStarting(runtime)

        expect(runtimeRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: runtime.id,
                tenantId: 'tenant-1',
                toolsetId: 'toolset-1',
                pluginName: '@xpert-ai/plugin-echarts-mcp-app',
                componentKey: 'echarts-drilldown',
                resourceInstallationId: 'installation-1',
                executionId: 'execution-1',
                appInstanceId: 'app-1',
                commandLabel: 'node mcp-server.js [redacted]',
                commandHash: expect.any(String),
                policySnapshot: {
                    provider: 'local-process',
                    startupTimeoutMs: 15000,
                    idleTimeoutMs: 1800000,
                    maxLifetimeMs: 7200000,
                    allowedCommands: ['node']
                }
            })
        )
        expect(JSON.stringify(runtimeRepo.save.mock.calls[0][0])).not.toContain('secret-value')
        expect(JSON.stringify(runtimeRepo.save.mock.calls[0][0])).not.toContain('XPERT_MCP_STDIO_RUNNER_SPEC')
    })

    it('marks stale active records as closed on application bootstrap', async () => {
        const queryBuilder = createQueryBuilderMock()
        const runtimeRepo = {
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const service = new McpRuntimeAuditService(runtimeRepo as never, { createQueryBuilder: jest.fn() } as never)

        await service.onApplicationBootstrap()

        expect(queryBuilder.update).toHaveBeenCalled()
        expect(queryBuilder.set).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'closed',
                closeReason: 'host-restart-or-lost'
            })
        )
        expect(queryBuilder.where).toHaveBeenCalledWith('status IN (:...statuses)', {
            statuses: ['starting', 'running', 'closing']
        })
    })

    it('lists current tenant organization runtimes with select options', async () => {
        const mainQueryBuilder = createQueryBuilderMock()
        const workspaceLookupBuilder = {
            ...createQueryBuilderMock(),
            getRawMany: jest.fn(async () => [{ value: 'workspace-1', label: 'Sales Workspace' }])
        }
        const workspaceOptionBuilder = {
            ...createQueryBuilderMock(),
            getRawMany: jest.fn(async () => [{ value: 'workspace-1', label: 'Sales Workspace' }])
        }
        const optionBuilders = [
            workspaceOptionBuilder,
            [{ value: 'toolset-1', label: 'ECharts MCP' }],
            [{ value: '@xpert-ai/plugin-echarts-mcp-app', label: '@xpert-ai/plugin-echarts-mcp-app' }],
            [{ value: 'execution-1', label: 'execution-1' }],
            [{ value: 'app-1', label: 'app-1' }]
        ].map((rows) =>
            Array.isArray(rows)
                ? {
                      ...createQueryBuilderMock(),
                      getRawMany: jest.fn(async () => rows)
                  }
                : rows
        )
        const builders = [mainQueryBuilder, ...optionBuilders]
        const runtimeRepo = {
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => builders.shift()),
            manager: {
                createQueryBuilder: jest.fn(() => workspaceLookupBuilder)
            }
        }
        const service = new McpRuntimeAuditService(runtimeRepo as never, { createQueryBuilder: jest.fn() } as never)
        const runtime = createRuntime()
        runtime.status = 'running'
        const inScopeSnapshot = {
            id: runtime.id,
            status: runtime.status,
            origin: 'agent-toolset' as const,
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            toolsetId: 'toolset-1',
            toolsetName: 'ECharts MCP',
            serverName: 'echarts-drilldown',
            pluginManaged: true,
            pluginName: '@xpert-ai/plugin-echarts-mcp-app',
            command: 'node mcp-server.js',
            startedAt: runtime.startedAt.toISOString()
        }
        const outOfScopeSnapshot = {
            ...inScopeSnapshot,
            id: 'runtime-2',
            tenantId: 'tenant-2',
            organizationId: 'org-2'
        }

        const result = await service.list({ activeOnly: true }, [inScopeSnapshot, outOfScopeSnapshot])

        expect(mainQueryBuilder.andWhere).toHaveBeenCalledWith('runtime.tenantId = :runtime_tenantId', {
            runtime_tenantId: 'tenant-1'
        })
        expect(mainQueryBuilder.andWhere).toHaveBeenCalledWith('runtime.organizationId = :runtime_organizationId', {
            runtime_organizationId: 'org-1'
        })
        expect(workspaceOptionBuilder.leftJoin).toHaveBeenCalledWith(
            'xpert_workspace',
            'workspace',
            '"workspace"."id"::text = "runtime"."workspaceId"'
        )
        expect(workspaceLookupBuilder.where).toHaveBeenCalledWith('"workspace"."id"::text IN (:...workspaceIds)', {
            workspaceIds: ['workspace-1']
        })
        expect(result.items).toHaveLength(1)
        expect(result.items[0]).toMatchObject({
            id: runtime.id,
            live: true,
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        expect(result.options).toEqual({
            workspaces: [{ value: 'workspace-1', label: 'Sales Workspace' }],
            toolsets: [{ value: 'toolset-1', label: 'ECharts MCP' }],
            plugins: [{ value: '@xpert-ai/plugin-echarts-mcp-app', label: '@xpert-ai/plugin-echarts-mcp-app' }],
            executions: [{ value: 'execution-1', label: 'execution-1' }],
            appInstances: [{ value: 'app-1', label: 'app-1' }]
        })
    })
})
