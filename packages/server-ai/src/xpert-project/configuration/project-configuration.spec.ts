import { projectTaskConfigurationSchema, projectConfigurationUpdateSchema } from '@xpert-ai/contracts'
import { effectiveProjectConfiguration, parseProjectConfigurationDefinition } from './project-configuration.schema'

describe('Project type configuration boundary', () => {
    it('applies coding defaults without mutating persisted overrides', () => {
        const values = {}
        expect(effectiveProjectConfiguration(projectTaskConfigurationSchema(7200), values))
            .toEqual({ taskExecutionMaxDurationSeconds: 7200 })
        expect(values).toEqual({})
        expect(effectiveProjectConfiguration(projectTaskConfigurationSchema(), {})).toEqual({})
    })
    it.each([59, 86401, '7200', null, 3600.5])('rejects invalid duration %s', (value) => {
        expect(() => effectiveProjectConfiguration(projectTaskConfigurationSchema(7200),
            { taskExecutionMaxDurationSeconds: value })).toThrow()
    })
    it('retains custom schema defaults and constraints', () => {
        const definition = parseProjectConfigurationDefinition({ schema: { type: 'object', additionalProperties: false,
            properties: { framework: { type: 'string', enum: ['nestjs', 'angular'], default: 'nestjs' } } } })
        expect(effectiveProjectConfiguration(definition.schema, {})).toEqual({ framework: 'nestjs' })
        expect(() => effectiveProjectConfiguration(definition.schema, { framework: 'unknown' })).toThrow()
        expect(() => effectiveProjectConfiguration(definition.schema, { injected: true })).toThrow()
    })
    it('enforces the reserved duration even when a custom type declares it loosely', () => {
        expect(() => effectiveProjectConfiguration({ type: 'object', properties: {} },
            { taskExecutionMaxDurationSeconds: -1 })).toThrow()
    })
    it('rejects unknown API fields, missing revisions, nonfinite values and oversized data', () => {
        for (const value of [{ values: {} }, { revision: 0, values: {}, projectId: 'other' },
            { revision: 0, values: { bad: NaN } }, { revision: 0, values: { big: 'a'.repeat(65537) } }])
            expect(projectConfigurationUpdateSchema.safeParse(value).success).toBe(false)
    })
    it('validates standard JSON Schema formats', () => {
        const schema = parseProjectConfigurationDefinition({ schema: { type: 'object', properties: { endpoint: { type: 'string', format: 'uri' } } } }).schema
        expect(() => effectiveProjectConfiguration(schema, { endpoint: 'not a URL' })).toThrow()
        expect(() => parseProjectConfigurationDefinition({ schema: { type: 'object', properties: { x: { type: 'string', format: 'unsupported-format' } } } })).toThrow()
        expect(effectiveProjectConfiguration(schema, { endpoint: 'https://example.test/api' })).toEqual({ endpoint: 'https://example.test/api' })
    })
    it('does not allow settings for an undeclared configuration', () => {
        expect(() => effectiveProjectConfiguration(undefined, { unknown: true })).toThrow()
    })
})
