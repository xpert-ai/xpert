import { MCP_APP_TOOL_AUTHORIZE } from '@xpert-ai/chatkit-types'
import { randomUUID } from 'node:crypto'
import { authorizeMcpAppViewTool } from './mcp-app-view-tools'

describe('MCP App view tool approval', () => {
    const instance = { id: 'app', toolset: { tenantId: 'tenant', workspaceId: 'workspace' } }
    const approvalId = '11111111-1111-4111-8111-111111111111'
    const input = { viewId: 'view', name: 'edit', arguments: { text: 'report' } }
    const request = jest.fn(async () => ({
        approvalId: randomUUID(),
        risk: 'write' as const,
        expiresAt: Date.now() + 1000
    }))
    const consume = jest.fn(async () => undefined)
    beforeEach(() => jest.clearAllMocks())

    it('requires approval for every view tool and binds its exact target and arguments', async () => {
        const result = await authorizeMcpAppViewTool(
            instance,
            { id: 'call', method: MCP_APP_TOOL_AUTHORIZE, params: input },
            { request, consume }
        )
        expect(result).toMatchObject({ error: { code: -32001 } })
        expect(request).toHaveBeenCalledWith({
            appInstanceId: 'app',
            tenantId: 'tenant',
            workspaceId: 'workspace',
            toolName: 'app:edit',
            purpose: 'view-tool',
            arguments: input,
            risk: 'write'
        })
        expect(consume).not.toHaveBeenCalled()
        await expect(
            authorizeMcpAppViewTool(instance, { id: 'call', params: { ...input, approvalId } }, { request, consume })
        ).resolves.toMatchObject({ result: {} })
        expect(consume).toHaveBeenCalledWith({
            approvalId,
            appInstanceId: 'app',
            toolName: 'app:edit',
            arguments: input,
            purpose: 'view-tool'
        })
    })

    it('does not continue after a rejected, expired or mismatched approval', async () => {
        consume.mockRejectedValueOnce(new Error('Approval mismatch'))
        await expect(
            authorizeMcpAppViewTool(instance, { params: { ...input, approvalId } }, { request, consume })
        ).rejects.toThrow('Approval mismatch')
    })

    it.each([
        { ...input, actorId: 'owner' },
        { ...input, purpose: 'app-tool' },
        { ...input, approvalId: '' },
        { ...input, approvalId: 'not-an-approval-id' },
        { ...input, viewId: '' },
        { ...input, arguments: [] },
        { ...input, arguments: { text: 'x'.repeat(65_536) } }
    ])('rejects malformed or oversized payloads before requesting approval', async (params) => {
        await expect(authorizeMcpAppViewTool(instance, { params }, { request, consume })).rejects.toThrow()
        expect(request).not.toHaveBeenCalled()
        expect(consume).not.toHaveBeenCalled()
    })
})
