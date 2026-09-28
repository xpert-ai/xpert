import type { Repository } from 'typeorm'
import { applicationMetrics } from '../metrics'
import type { McpAppInstance } from '../xpert-toolset/provider/mcp/app-support'
import { McpAppAudit } from './mcp-app-audit.entity'
import { McpAppAuditService } from './mcp-app-audit.service'

describe('McpAppAuditService', () => {
    beforeEach(() => applicationMetrics.reset())

    it('records native middleware identity without fabricating a Toolset id', async () => {
        const repository = {
            create: jest.fn((input) => Object.assign(new McpAppAudit(), input)),
            save: jest.fn(async (audit) => audit)
        } as unknown as Repository<McpAppAudit>
        const source = {
            kind: 'middleware' as const,
            provider: 'Settings',
            nodeKey: 'settings',
            agentKey: 'Main',
            pluginName: 'settings-plugin'
        }
        const instance = {
            id: 'app',
            toolset: { tenantId: 'tenant', workspaceId: 'workspace' },
            executionContext: { xpertId: 'assistant' },
            middleware: { source }
        } as McpAppInstance
        const audit = await new McpAppAuditService(repository).start({ instance, method: 'tools/call' })
        expect(audit.toolsetId).toBeNull()
        expect(audit.source).toEqual({ ...source, xpertId: 'assistant' })
    })

    it('summarizes request shape without values and bounds metric method labels', async () => {
        const repository = {
            create: jest.fn((input) => Object.assign(new McpAppAudit(), input)),
            save: jest.fn(async (audit) => audit)
        } as unknown as Repository<McpAppAudit>
        const service = new McpAppAuditService(repository)
        const secret = 'secret-value-that-must-not-be-logged'
        const instance = {
            id: '10000000-0000-4000-8000-000000000001',
            toolset: {
                id: '10000000-0000-4000-8000-000000000002',
                tenantId: '10000000-0000-4000-8000-000000000003',
                workspaceId: '10000000-0000-4000-8000-000000000004'
            }
        } as McpAppInstance

        const audit = await service.start({
            instance,
            method: `attacker-${secret}`,
            params: { apiKey: secret, action: 'run' }
        })
        await service.finish(audit, Date.now(), 'failed')

        expect(audit.requestSummary).toEqual({
            type: 'object',
            keys: ['apiKey', 'action'],
            bytes: expect.any(Number)
        })
        expect(JSON.stringify(audit.requestSummary)).not.toContain(secret)
        expect(applicationMetrics.render()).toContain(
            'xpert_mcp_app_rpc_total{method="unknown",publication_id="consumer",status="failed"} 1'
        )
        expect(applicationMetrics.render()).not.toContain(`attacker-${secret}`)
    })
})
