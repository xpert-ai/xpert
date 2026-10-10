import { IApiPrincipal } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { assertAssistantAudience } from './assistant-audience'

describe('Assistant audience uses normalized resource scope', () => {
    afterEach(() => jest.restoreAllMocks())
    it('does not fall back to deprecated API key metadata', () => {
        const principal = {
            principalType: 'client_secret',
            resourceScope: { kind: 'assistant', xpertId: 'C' },
            apiKey: { entityId: 'E' }
        } as IApiPrincipal
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal)
        expect(() => assertAssistantAudience('C')).not.toThrow()
        expect(() => assertAssistantAudience('E')).toThrow()
    })
    it('does not authorize a direct Assistant API using a group conversation credential', () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            resourceScope: { kind: 'conversation', conversationId: 'D' }
        } as IApiPrincipal)
        expect(() => assertAssistantAudience('C')).toThrow()
    })
})
