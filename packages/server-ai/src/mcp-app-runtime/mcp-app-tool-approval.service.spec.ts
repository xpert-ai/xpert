import { REDIS_CLIENT, RequestContext } from '@xpert-ai/server-core'
import { Test, type TestingModule } from '@nestjs/testing'
import { authorizeMcpAppViewTool } from './mcp-app-view-tools'
import { McpAppToolApprovalService } from './mcp-app-tool-approval.service'

describe('McpAppToolApprovalService', () => {
    let service: McpAppToolApprovalService
    let userId: string | undefined
    let values: Map<string, string>
    let evalRedis: jest.Mock

    beforeEach(async () => {
        userId = 'user-1'
        values = new Map()
        evalRedis = jest.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
            const [key] = options.keys
            const [expected, replacement] = options.arguments
            if (values.get(key) !== expected) return null
            if (replacement === undefined) {
                values.delete(key)
                return expected
            }
            values.set(key, replacement)
            return replacement
        })
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => userId)
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                McpAppToolApprovalService,
                {
                    provide: REDIS_CLIENT,
                    useValue: {
                        set: jest.fn(async (key: string, value: string) => {
                            values.set(key, value)
                            return 'OK'
                        }),
                        get: jest.fn(async (key: string) => values.get(key) ?? null),
                        eval: evalRedis
                    }
                }
            ]
        }).compile()
        service = module.get(McpAppToolApprovalService)
    })

    afterEach(() => jest.restoreAllMocks())

    it('classifies untrusted annotations conservatively and honors read hints only from a trusted policy', () => {
        expect(service.risk()).toBe('write')
        expect(service.risk({ readOnlyHint: true })).toBe('write')
        expect(service.risk({ readOnlyHint: true }, true)).toBe('read')
        expect(service.risk({ readOnlyHint: true, openWorldHint: true })).toBe('write')
        expect(service.risk({ readOnlyHint: true, destructiveHint: true })).toBe('destructive')
    })

    it('does not let another user invalidate a pending approval', async () => {
        const requested = await service.request({
            appInstanceId: 'app-1',
            toolName: 'write_file',
            arguments: { path: 'report.txt' },
            risk: 'write'
        })
        const key = `xpert:mcp:app-approval:${requested.approvalId}`
        userId = 'user-2'

        await expect(service.reject('app-1', requested.approvalId)).rejects.toThrow()
        expect(values.has(key)).toBe(true)
    })

    it('binds approval to user, app, tool, and canonical arguments and consumes it once', async () => {
        const requested = await service.request({
            appInstanceId: 'app-1',
            toolName: 'write_file',
            arguments: { path: 'report.txt', options: { overwrite: false, encoding: 'utf8' } },
            risk: 'write'
        })
        await service.approve('app-1', requested.approvalId)

        await expect(
            service.consume({
                approvalId: requested.approvalId,
                appInstanceId: 'app-1',
                toolName: 'write_file',
                arguments: { path: 'other.txt' }
            })
        ).rejects.toThrow()

        await expect(
            service.consume({
                approvalId: requested.approvalId,
                appInstanceId: 'app-1',
                toolName: 'write_file',
                arguments: { options: { encoding: 'utf8', overwrite: false }, path: 'report.txt' }
            })
        ).resolves.toBeUndefined()

        await expect(
            service.consume({
                approvalId: requested.approvalId,
                appInstanceId: 'app-1',
                toolName: 'write_file',
                arguments: { path: 'report.txt', options: { overwrite: false, encoding: 'utf8' } }
            })
        ).rejects.toThrow()
    })

    it('does not resurrect an approval when its pending value changed concurrently', async () => {
        const requested = await service.request({
            appInstanceId: 'app-1',
            toolName: 'write_file',
            arguments: { path: 'report.txt' },
            risk: 'write'
        })
        evalRedis.mockResolvedValueOnce(null)

        await expect(service.approve('app-1', requested.approvalId)).rejects.toThrow()

        const raw = values.get(`xpert:mcp:app-approval:${requested.approvalId}`)
        expect(raw).not.toContain('approvedAt')
    })

    it.each(['app-tool', 'view-tool'] as const)(
        'isolates %s approvals from the other execution path',
        async (purpose) => {
            const input = {
                appInstanceId: 'app-1',
                toolName: 'app:edit',
                arguments: { viewId: 'view', name: 'edit', arguments: {} }
            }
            const approval = await service.request({ ...input, risk: 'write', purpose })
            await service.approve(input.appInstanceId, approval.approvalId)
            await expect(
                service.consume({
                    ...input,
                    approvalId: approval.approvalId,
                    purpose: purpose === 'view-tool' ? 'app-tool' : 'view-tool'
                })
            ).rejects.toThrow()
            await expect(
                service.consume({ ...input, approvalId: approval.approvalId, purpose })
            ).resolves.toBeUndefined()
        }
    )

    it('keeps legacy approvals on the original tool path', async () => {
        const input = { appInstanceId: 'app-1', toolName: 'edit', arguments: {} }
        const approval = await service.request({ ...input, risk: 'write' })
        const key = `xpert:mcp:app-approval:${approval.approvalId}`
        const raw = values.get(key)
        if (!raw) throw new Error('Expected a pending approval')
        values.set(key, raw.replace(/"purpose":"app-tool",/, ''))
        await service.approve(input.appInstanceId, approval.approvalId)
        await expect(
            service.consume({ ...input, approvalId: approval.approvalId, purpose: 'view-tool' })
        ).rejects.toThrow()
        await expect(service.consume({ ...input, approvalId: approval.approvalId })).resolves.toBeUndefined()
    })

    it.each(['view', 'tool', 'arguments', 'actor', 'instance', 'expiry', 'rejection'] as const)(
        'rejects a view invocation after its %s changes without consuming a valid grant',
        async (change) => {
            const instance = { id: 'app-1', toolset: { tenantId: 'tenant', workspaceId: 'workspace' } }
            const args = { viewId: 'view-1', name: 'edit', arguments: { text: 'report' } }
            const approval = await service.request({
                appInstanceId: instance.id,
                toolName: 'app:edit',
                arguments: args,
                risk: 'write',
                purpose: 'view-tool'
            })
            await service.approve(instance.id, approval.approvalId)
            const params = { ...args, approvalId: approval.approvalId }
            if (change === 'view') params.viewId = 'view-2'
            if (change === 'tool') params.name = 'delete'
            if (change === 'arguments') params.arguments = { text: 'changed' }
            if (change === 'actor') userId = 'user-2'
            if (change === 'expiry') jest.spyOn(Date, 'now').mockReturnValue(approval.expiresAt + 1)
            if (change === 'rejection') await service.reject(instance.id, approval.approvalId)
            await expect(
                authorizeMcpAppViewTool(
                    change === 'instance' ? { ...instance, id: 'app-2' } : instance,
                    { params },
                    service
                )
            ).rejects.toThrow()
            if (change !== 'expiry' && change !== 'rejection') {
                userId = 'user-1'
                await expect(
                    authorizeMcpAppViewTool(instance, { params: { ...args, approvalId: approval.approvalId } }, service)
                ).resolves.toMatchObject({ result: {} })
                await expect(
                    authorizeMcpAppViewTool(instance, { params: { ...args, approvalId: approval.approvalId } }, service)
                ).rejects.toThrow()
            }
        }
    )
})
