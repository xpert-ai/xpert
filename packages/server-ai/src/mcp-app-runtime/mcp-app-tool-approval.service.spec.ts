import { REDIS_CLIENT, RequestContext } from '@xpert-ai/server-core'
import { Test, type TestingModule } from '@nestjs/testing'
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
})
