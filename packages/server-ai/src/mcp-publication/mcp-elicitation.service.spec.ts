import type { RedisClientType } from 'redis'
import { McpElicitationService } from './mcp-elicitation.service'

describe('McpElicitationService request boundary', () => {
    const service = new McpElicitationService({} as RedisClientType)

    it('validates form responses against the requested schema', () => {
        const request = {
            type: 'form' as const,
            title: 'Choose environment',
            schema: {
                type: 'object',
                properties: { environment: { type: 'string', enum: ['dev', 'production'] } },
                required: ['environment'],
                additionalProperties: false
            }
        }

        expect(service.resolveResponse(request, { action: 'accept', content: { environment: 'dev' } })).toEqual({
            kind: 'accepted',
            content: { environment: 'dev' }
        })
        expect(() =>
            service.resolveResponse(request, { action: 'accept', content: { environment: 'invalid' } })
        ).toThrow()
    })

    it('treats URL completion as a signal and rejects returned secret material', () => {
        const request = { type: 'url' as const, title: 'Authorize', url: 'https://issuer.example.com/authorize' }

        expect(service.resolveResponse(request, { action: 'accept' })).toEqual({ kind: 'accepted', content: {} })
        expect(service.resolveResponse(request, { action: 'accept', content: {} })).toEqual({
            kind: 'accepted',
            content: {}
        })
        expect(() =>
            service.resolveResponse(request, { action: 'accept', content: { access_token: 'secret' } })
        ).toThrow()
    })

    it('rejects sensitive form fields before issuing elicitation', () => {
        expect(() =>
            service.normalizeRequest({
                type: 'form',
                title: 'Credentials',
                schema: {
                    type: 'object',
                    properties: { apiKey: { type: 'string' } }
                }
            })
        ).toThrow()
    })
})
