import { mcpInputSchema } from './mcp-input-schema'

describe('MCP input diagnostics', () => {
    const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: {
            title: { type: 'string' },
            kind: { enum: ['architecture', 'flowchart'] },
            tags: { type: 'array', items: { type: 'string' } }
        }
    }
    it('reports nested paths, missing/unknown field names and enum choices without echoing arguments', async () => {
        const result = await mcpInputSchema(schema)['~standard'].validate({
            kind: 'private-value',
            tags: [123],
            unexpected: 'private-value'
        })
        expect(result.issues?.[0].message).toContain('"path":"/title"')
        expect(result.issues?.[0].message).toContain('"path":"/tags/0"')
        expect(result.issues?.[0].message).toContain('"path":"/unexpected"')
        expect(result.issues?.[0].message).toContain('"allowedValues":["architecture","flowchart"]')
        expect(result.issues?.[0].message).not.toContain('private-value')
    })
    it('keeps a valid input unchanged and bounds invalid batches', async () => {
        const input = { title: 'valid', tags: ['diagram'] }
        expect(await mcpInputSchema(schema)['~standard'].validate(input)).toEqual({ value: input })
        const result = await mcpInputSchema(schema)['~standard'].validate({ title: 'test', tags: Array(100).fill(1) })
        const details = JSON.parse(result.issues?.[0].message ?? '{}')
        expect(details.issues).toHaveLength(20)
        expect(details.issueTotal).toBe(100)
        expect(details.truncated).toBe(true)
    })
    it.each([
        'https://json-schema.org/draft/2020-12/schema',
        'https://json-schema.org/draft/2019-09/schema',
        'http://json-schema.org/draft/2020-12/schema#',
        'https://json-schema.org/draft-07/schema',
        'https://json-schema.org/draft-06/schema#'
    ])('preserves %s validation', async (dialect) => {
        const result = await mcpInputSchema({ ...schema, $schema: dialect })['~standard'].validate({ title: 1 })
        expect(result.issues?.[0].message).toContain('/title')
    })
})
