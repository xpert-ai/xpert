import { encodeMcpHeaderValue, projectToolParameterHeaders, toolHeaderParameters } from './tool-parameter-headers'

describe('MCP parameter header projection', () => {
    const schema = {
        type: 'object',
        properties: {
            owner: { type: 'string', 'x-mcp-header': 'owner' },
            repo: { type: 'string', 'x-mcp-header': 'repo' },
            options: {
                type: 'object',
                properties: {
                    page: { type: 'integer', 'x-mcp-header': 'page' },
                    archived: { type: 'boolean', 'x-mcp-header': 'archived' }
                }
            },
            path: { type: 'string' }
        }
    }

    it('projects only annotated values at their exact property paths', () => {
        expect(
            projectToolParameterHeaders(toolHeaderParameters(schema), {
                owner: 'xpert-ai',
                repo: 'xpert',
                path: 'README.md',
                page: 99,
                options: { page: 0, archived: false }
            })
        ).toEqual({ owner: 'xpert-ai', repo: 'xpert', page: '0', archived: 'false' })
    })

    it('omits absent and null parameters and does not read inherited arguments', () => {
        expect(
            projectToolParameterHeaders(toolHeaderParameters(schema), {
                owner: null,
                repo: '',
                options: null
            })
        ).toEqual({ repo: '' })
        expect(
            projectToolParameterHeaders(toolHeaderParameters(schema), Object.create({ owner: 'inherited' }))
        ).toEqual({})
    })

    it.each(['中文', ' padded ', 'line1\r\nInjected: true', '=?base64?literal?='])(
        'encodes unsafe or ambiguous values losslessly: %s',
        (value) => {
            const encoded = encodeMcpHeaderValue(value)
            expect(encoded).toBe(`=?base64?${Buffer.from(value).toString('base64')}?=`)
            expect(new Headers({ 'Mcp-Param-test': encoded }).get('Mcp-Param-test')).toBe(encoded)
        }
    )

    it.each(['xpert-ai', 'Hello, world', 'a\tb', ''])('preserves safe ASCII values: %s', (value) => {
        expect(encodeMcpHeaderValue(value)).toBe(value)
    })

    it.each([1.5, Number.MAX_SAFE_INTEGER + 1, '1', {}, true])('rejects invalid integer values: %p', (page) => {
        expect(() => projectToolParameterHeaders(toolHeaderParameters(schema), { options: { page } })).toThrow(
            'Invalid integer'
        )
    })

    it.each(['', 'repo\nInjected', 'repo name'])('rejects invalid header names: %p', (name) => {
        expect(() => toolHeaderParameters({ properties: { repo: { type: 'string', 'x-mcp-header': name } } })).toThrow(
            'field-name'
        )
    })

    it('rejects case-insensitive duplicate header names', () => {
        expect(() =>
            toolHeaderParameters({
                properties: {
                    a: { type: 'string', 'x-mcp-header': 'repo' },
                    b: { type: 'string', 'x-mcp-header': 'Repo' }
                }
            })
        ).toThrow('unique')
    })

    it.each(['number', 'object', 'array'])('rejects non-primitive annotated schema types: %s', (type) => {
        expect(() => toolHeaderParameters({ properties: { x: { type, 'x-mcp-header': 'x' } } })).toThrow(
            'string, integer or boolean'
        )
    })

    it.each([
        { properties: { list: { items: { type: 'string', 'x-mcp-header': 'x' } } } },
        { allOf: [{ properties: { x: { type: 'string', 'x-mcp-header': 'x' } } }] },
        { $defs: { value: { type: 'string', 'x-mcp-header': 'x' } } }
    ])('rejects annotations outside statically reachable properties: %p', (inputSchema) => {
        expect(() => toolHeaderParameters(inputSchema)).toThrow('statically reachable')
    })
})
