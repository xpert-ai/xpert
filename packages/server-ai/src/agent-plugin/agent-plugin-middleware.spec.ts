import { BadRequestException } from '@nestjs/common'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { AgentPluginService } from './agent-plugin.service'

jest.mock('./agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))

describe('installed middleware configuration', () => {
    const service = Object.create(AgentPluginService.prototype) as AgentPluginService
    const get = jest.fn()
    const registry = { get } as unknown as AgentMiddlewareRegistry
    it('accepts localized host schema annotations while enforcing actual constraints', () => {
        get.mockReturnValue({
            meta: {
                configSchema: {
                    type: 'object',
                    properties: {
                        maxRetries: { type: 'number', minimum: 0, title: { en_US: 'Retries', zh_Hans: '重试次数' } }
                    }
                }
            }
        })
        expect(() => service.validateMiddleware(registry, 'retry', { maxRetries: 0 }, 'org')).not.toThrow()
        expect(() => service.validateMiddleware(registry, 'retry', { maxRetries: -1 }, 'org')).toThrow(
            BadRequestException
        )
        expect(() => service.validateMiddleware(registry, 'retry', { maxRetries: 'invalid' }, 'org')).toThrow(
            BadRequestException
        )
    })
    it('never exposes a mandatory system provider as an optional resource', () => {
        get.mockReturnValue({ meta: { builtin: true } })
        expect(() => service.validateMiddleware(registry, 'system', {}, 'org')).toThrow(BadRequestException)
    })
})
