jest.mock('../../skill-package.entity', () => ({ SkillPackage: class {} }))
jest.mock('../../skill-package.service', () => ({ SkillPackageService: class {} }))
jest.mock('../../../skill-repository/repository-index/skill-repository-index.service', () => ({
    SkillRepositoryIndexService: class {}
}))
jest.mock('../../../xpert-workspace', () => ({ getWorkspaceRoot: () => '/workspace-root' }))
jest.mock('../../../xpert-workspace/workspace.entity', () => ({ XpertWorkspace: class {} }))
jest.mock('../../../sandbox', () => ({
    SandboxAcquireBackendCommand: class {},
    SandboxCopyTreeCommand: class {}
}))

import { AIMessage, SystemMessage } from '@langchain/core/messages'
import { SkillsMiddleware } from './index'

describe('SkillsMiddleware system prompt composition', () => {
    async function compose(systemMessage?: SystemMessage) {
        const strategy = new SkillsMiddleware(
            { find: jest.fn().mockResolvedValue([]) } as never,
            {} as never,
            {} as never,
            {} as never
        )
        const middleware = await strategy.createMiddleware(
            {},
            {
                tenantId: 'tenant',
                userId: 'user',
                workspaceId: 'workspace',
                node: {} as never,
                tools: new Map(),
                runtime: {} as never
            }
        )
        const response = new AIMessage('response')
        const handler = jest.fn().mockResolvedValue(response)
        const result = await middleware.wrapModelCall(
            {
                runtime: { configurable: {} },
                state: {},
                systemMessage
            } as never,
            handler
        )
        expect(result).toBe(response)
        expect(handler).toHaveBeenCalledTimes(1)
        return handler.mock.calls[0][0].systemMessage as SystemMessage
    }

    it('preserves upstream content blocks in order without mutating them', async () => {
        const blocks = [
            { type: 'text' as const, text: 'Assistant instructions' },
            { type: 'text' as const, text: 'Upstream middleware guidance', cache_control: { type: 'ephemeral' } }
        ]
        const original = structuredClone(blocks)
        const result = await compose(new SystemMessage({ content: blocks }))
        expect(result.content).toEqual([...original, { type: 'text', text: expect.stringContaining('Skills System') }])
        expect(blocks).toEqual(original)
    })

    it('retains plain text instructions when appending skills guidance', async () => {
        const result = await compose(new SystemMessage('Assistant instructions'))
        expect(typeof result.content).toBe('string')
        expect(result.content).toMatch(/^Assistant instructions\n\n/)
        expect(result.content).toContain('Skills System')
    })

    it('adds skills guidance when no upstream system message exists', async () => {
        const result = await compose()
        expect(typeof result.content).toBe('string')
        expect(result.content).toContain('Skills System')
        expect(result.content).not.toContain('undefined')
    })
})
