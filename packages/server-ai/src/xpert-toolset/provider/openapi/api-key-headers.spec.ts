import { XpertTool } from '../../../xpert-tool/xpert-tool.entity'
import { OpenAPITool } from './tools/openapi-tool'
import { apiKeyHeaders } from './api-key-headers'
import { ToolProviderCredentialValidationError } from '../../errors'

describe('shared OpenAPI authentication', () => {
    it('keeps legacy OpenAPI calls and REST transport consistent without modifying saved credentials', () => {
        const tool = new OpenAPITool(
            Object.assign(new XpertTool(), {
                name: 'sales',
                description: 'Sales',
                options: {
                    api_bundle: {
                        server_url: 'https://example.test/sales',
                        method: 'get',
                        parameters: [],
                        openapi: { parameters: [] }
                    }
                }
            }),
            {}
        )
        for (const [prefix, expected] of [
            ['basic', 'Basic test-value'],
            ['bearer', 'Bearer test-value'],
            ['bearar', 'Bearer test-value'],
            ['custom', 'test-value'],
            ['', 'test-value'],
            [null, 'test-value'],
            [undefined, 'test-value']
        ]) {
            const credentials = Object.freeze({
                auth_type: 'api_key',
                api_key_header: 'Authorization',
                api_key_header_prefix: prefix,
                api_key_value: 'test-value'
            })
            expect(apiKeyHeaders(credentials)).toEqual({ Authorization: expected })
            expect(tool.assembling_request({}, credentials)).toEqual({ Authorization: expected })
            expect(tool.assembling_request({}, credentials)).toEqual({ Authorization: expected })
            expect(credentials.api_key_value).toBe('test-value')
        }
        expect(tool.assembling_request({}, { auth_type: 'none' })).toEqual({})
        expect(tool.assembling_request({}, { auth_type: 'api_key', api_key_value: 'test-value' })).toEqual({
            api_key: 'test-value'
        })
        expect(apiKeyHeaders({ api_key_header: null, api_key_value: 'test-value' })).toEqual({ api_key: 'test-value' })
    })
    it('preserves credential error classification without exposing invalid stored values', () => {
        for (const input of [
            {},
            { api_key_value: 42 },
            { api_key_value: 'test-secret', api_key_header_prefix: 'test-secret-prefix' },
            { api_key_value: 'test-secret\r\nHeader: injected' },
            { api_key_header: 'invalid header', api_key_value: 'test-secret' }
        ]) {
            expect(() => apiKeyHeaders(input)).toThrow(ToolProviderCredentialValidationError)
            try {
                apiKeyHeaders(input)
            } catch (error) {
                expect(String(error)).not.toMatch(/test-secret|injected|invalid header/)
            }
        }
    })
})
