import { buildMCPHeaders, MCP_ASSISTANT_CODE_HEADER } from './headers'

describe('buildMCPHeaders', () => {
    it('renders configured headers and sets the current xpert id as assistant code', async () => {
        const sourceHeaders = {
            Authorization: 'Bearer {{ token }}',
            'x-custom-runtime-id': '{{env.custom_runtime_id}}',
            [MCP_ASSISTANT_CODE_HEADER]: 'old-code'
        }

        const headers = await buildMCPHeaders(
            sourceHeaders,
            {
                token: 'abc123',
                env: {
                    custom_runtime_id: 'runtime-1'
                }
            },
            'xpert-1'
        )

        expect(headers).toEqual({
            Authorization: 'Bearer abc123',
            'x-custom-runtime-id': 'runtime-1',
            [MCP_ASSISTANT_CODE_HEADER]: 'xpert-1'
        })
        expect(sourceHeaders[MCP_ASSISTANT_CODE_HEADER]).toBe('old-code')
    })

    it('does not add assistant code when no xpert id is available', async () => {
        const headers = await buildMCPHeaders({ Authorization: 'Bearer {{ token }}' }, { token: 'abc123' })

        expect(headers).toEqual({
            Authorization: 'Bearer abc123'
        })
    })
})
