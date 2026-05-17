import { ToolProviderIconQuery } from '../get-provider-icon.query'
import { ToolProviderIconHandler } from './get-provider-icon.handler'

describe('ToolProviderIconHandler', () => {
    it('serializes middleware svg icons as standalone image resources', async () => {
        const handler = createHandlerWithMiddlewareIcon({
            type: 'svg',
            value: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h1v1H0z"/></svg>',
            color: '#2f7cf6'
        })

        const [buffer, mimeType] = await handler.execute(
            new ToolProviderIconQuery({
                organizationId: 'org-1',
                provider: 'XpertFileMemoryMiddleware'
            })
        )

        const svg = buffer.toString('utf8')
        expect(mimeType).toBe('image/svg+xml')
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
        expect(svg).toContain('color="#2f7cf6"')
        expect(svg).toContain('fill="currentColor"')
    })

    it('does not duplicate existing svg namespace or color attributes', async () => {
        const handler = createHandlerWithMiddlewareIcon({
            type: 'svg',
            value: '<svg xmlns="http://www.w3.org/2000/svg" color="#111" viewBox="0 0 1 1"></svg>',
            color: '#2f7cf6'
        })

        const [buffer] = await handler.execute(
            new ToolProviderIconQuery({
                organizationId: 'org-1',
                provider: 'ExistingSvgMiddleware'
            })
        )

        const svg = buffer.toString('utf8')
        expect(svg.match(/xmlns=/g) ?? []).toHaveLength(1)
        expect(svg.match(/color=/g) ?? []).toHaveLength(1)
        expect(svg).toContain('color="#111"')
    })
})

function createHandlerWithMiddlewareIcon(icon: unknown) {
    const queryBus = {
        execute: jest.fn().mockResolvedValue([])
    }
    const handler = new ToolProviderIconHandler(queryBus)

    Object.defineProperty(handler, 'toolsetRegistry', {
        value: {
            get: jest.fn(() => {
                throw new Error('No toolset provider')
            })
        }
    })
    Object.defineProperty(handler, 'agentMiddlewareRegistry', {
        value: {
            get: jest.fn(() => ({
                meta: { icon }
            }))
        }
    })

    return handler
}
