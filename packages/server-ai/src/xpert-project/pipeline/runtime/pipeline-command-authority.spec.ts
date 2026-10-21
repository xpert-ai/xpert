import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { init } from 'i18next'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IApiPrincipal } from '@xpert-ai/contracts'
import { assertPipelineCommandAuthority, pipelineCommandCapability } from './pipeline-command-authority'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

afterEach(() => jest.restoreAllMocks())

it('allows an ordinary user credential without replacing the separate Project authorization checks', () => {
    jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user', tenantId: 'tenant' })
    expect(pipelineCommandCapability()).toEqual({ allowed: true })
    expect(() => assertPipelineCommandAuthority()).not.toThrow()
})

it.each(['client_secret', 'api_key', 'legacy'] as const)(
    'keeps %s discovery and command enforcement aligned',
    (type) => {
        const principal: IApiPrincipal | Pick<IApiPrincipal, 'id' | 'tenantId' | 'apiKey'> = {
            id: 'user',
            tenantId: 'tenant',
            ...(type === 'legacy'
                ? { apiKey: { token: 'test-placeholder', tenantId: 'tenant' } }
                : { principalType: type })
        }
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(principal)
        expect(pipelineCommandCapability('configure')).toEqual({ allowed: true })
        expect(pipelineCommandCapability()).toEqual({
            allowed: false,
            reason: 'PIPELINE_SCOPED_DELEGATION_UNAVAILABLE'
        })
        expect(() => assertPipelineCommandAuthority()).toThrow(
            expect.objectContaining({
                status: 403,
                response: expect.objectContaining({ code: 'PIPELINE_SCOPED_DELEGATION_UNAVAILABLE' })
            })
        )
    }
)

it.each(['en', 'en-US', 'zh-Hans'])(
    'explains recovery in %s and keeps real version conflicts at 409',
    async (locale) => {
        const messages = JSON.parse(readFileSync(join(__dirname, '../../../i18n', `${locale}.json`), 'utf8'))
        await init({ lng: locale, resources: { [locale]: { 'server-ai': messages } } })
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({ principalType: 'client_secret' })
        expect(() => assertPipelineCommandAuthority()).toThrow(
            expect.objectContaining({
                response: {
                    code: 'PIPELINE_SCOPED_DELEGATION_UNAVAILABLE',
                    message: messages.Error.ProjectPipelineScopedDelegationUnavailable
                }
            })
        )
        expect(messages.Error.ProjectPipelineScopedDelegationUnavailable).not.toBe(
            messages.Error.ProjectPipelineProjectionConflict
        )
        expect(pipelineProjectionConflict('BINDING_REQUEST_CONFLICT').getStatus()).toBe(409)
    }
)
