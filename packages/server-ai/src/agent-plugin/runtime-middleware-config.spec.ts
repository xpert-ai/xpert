import { BadRequestException } from '@nestjs/common'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { mergeRuntimeMiddlewareOptions } from './runtime-middleware-config'

const meta: TAgentMiddlewareMeta = {
    name: 'ViewImageMiddleware',
    label: { en_US: 'View Image' },
    configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            compressionPercent: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
                default: 100,
                title: { en_US: 'Compression Size (%)', zh_Hans: '压缩尺寸（%）' }
            }
        }
    }
}
const merge = (assistant: Record<string, unknown> | undefined, plugins: Record<string, unknown>[], metadata = meta) =>
    mergeRuntimeMiddlewareOptions(metadata.name, assistant, plugins, metadata)

describe('runtime middleware configuration precedence', () => {
    it('uses the complete Assistant configuration including defaults', () => {
        expect(merge({ compressionPercent: 75 }, [{ compressionPercent: 50 }])).toEqual({ compressionPercent: 75 })
        expect(merge({}, [{ compressionPercent: 50 }])).toEqual({ compressionPercent: 100 })
        expect(merge({}, [{}])).toEqual({ compressionPercent: 100 })
        expect(merge({}, [{ compressionPercent: 50 }, { compressionPercent: 75 }])).toEqual({ compressionPercent: 100 })
        expect(mergeRuntimeMiddlewareOptions('unknown', {}, [{ allowExecution: true }])).toEqual({})
    })

    it('uses plugin configuration only for a new provider and fills its defaults', () => {
        expect(merge(undefined, [{ compressionPercent: 50 }])).toEqual({ compressionPercent: 50 })
        expect(merge(undefined, [{}])).toEqual({ compressionPercent: 100 })
        expect(merge(undefined, [])).toEqual({ compressionPercent: 100 })
    })

    it.each([
        [{}, { compressionPercent: 100 }],
        [{ compressionPercent: 100 }, {}]
    ])('deduplicates equivalent plugin configurations after applying defaults', (first, second) => {
        const plugins = [first, second]
        const original = structuredClone(plugins)
        expect(merge(undefined, plugins)).toEqual({ compressionPercent: 100 })
        expect(plugins).toEqual(original)
    })

    it('does not mutate the Assistant or plugin settings when applying defaults', () => {
        const assistant = {}
        const plugins = [{ compressionPercent: 50 }]
        expect(merge(assistant, plugins)).toEqual({ compressionPercent: 100 })
        expect(assistant).toEqual({})
        expect(plugins).toEqual([{ compressionPercent: 50 }])
    })

    it.each([
        [{ compressionPercent: 50 }, { compressionPercent: 100 }],
        [{ compressionPercent: 100 }, { compressionPercent: 50 }],
        [{}, { compressionPercent: 50 }],
        [{ compressionPercent: 50 }, {}]
    ])('rejects different effective plugin configurations regardless of order', (first, second) => {
        expect(() => merge(undefined, [first, second])).toThrow(BadRequestException)
        expect(merge({ compressionPercent: 75 }, [first, second])).toEqual({ compressionPercent: 75 })
    })

    it('keeps false, zero, null, arrays and objects explicit without deep merging', () => {
        const assistant = { flag: false, count: 0, optional: null, tools: [], policy: { mode: 'strict' } }
        const plugins = [{ flag: true, count: 10, optional: 'value', tools: ['shell'], policy: { extra: true } }]
        const result = mergeRuntimeMiddlewareOptions('test', assistant, plugins)
        expect(result).toEqual(assistant)
        expect(result.policy).not.toBe(assistant.policy)
        expect(result.tools).not.toBe(assistant.tools)
    })

    it('preserves existing default restrictions without a field policy', () => {
        const restricted: TAgentMiddlewareMeta = {
            name: 'restricted',
            label: { en_US: 'Restricted' },
            configSchema: {
                type: 'object',
                properties: {
                    allowExecution: { type: 'boolean', default: false },
                    label: { type: 'string' }
                }
            }
        }
        expect(merge({}, [{ allowExecution: true }], restricted)).toEqual({ allowExecution: false })
        expect(merge({}, [{ allowExecution: false, label: 'hello' }], restricted)).toEqual({
            allowExecution: false
        })
        expect(merge({ allowExecution: false }, [{ allowExecution: true }], restricted)).toEqual({
            allowExecution: false
        })
        // A new provider has no existing Assistant policy; selection is authorized before assembly.
        expect(merge(undefined, [{ allowExecution: true }], restricted)).toEqual({ allowExecution: true })
    })

    it('does not combine complementary plugin options or nested objects', () => {
        expect(() => mergeRuntimeMiddlewareOptions('test', undefined, [{ enabled: true }, { target: 'safe' }])).toThrow(
            BadRequestException
        )
        expect(() =>
            mergeRuntimeMiddlewareOptions('test', undefined, [
                { policy: { mode: 'strict' } },
                { policy: { tools: ['shell'] } }
            ])
        ).toThrow(BadRequestException)
        const options = { policy: { mode: 'strict' }, tools: ['read'] }
        const result = mergeRuntimeMiddlewareOptions('test', undefined, [options, structuredClone(options)])
        expect(result).toEqual(options)
        expect(result.policy).not.toBe(options.policy)
        expect(result.tools).not.toBe(options.tools)
    })

    it('validates the final merged configuration and never includes values in errors', () => {
        expect(() => merge({ compressionPercent: 101 }, [{}])).toThrow(BadRequestException)
        expect(() => merge(undefined, [{ compressionPercent: 101 }])).toThrow(BadRequestException)
        expect(() => merge(undefined, [{ unknown: true }])).toThrow(BadRequestException)
        const secret = 'sensitive-plugin-config-value'
        try {
            mergeRuntimeMiddlewareOptions('restricted', undefined, [
                { credential: secret },
                { credential: 'different' }
            ])
            throw new Error('Expected a conflict')
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException)
            expect((error as Error).message).not.toContain(secret)
        }
    })

    it('validates each effective configuration without filling required fields from another source', () => {
        const dependent: TAgentMiddlewareMeta = {
            name: 'test',
            label: { en_US: 'Test' },
            configSchema: {
                type: 'object',
                properties: { enabled: { type: 'boolean' }, target: { type: 'string' } },
                required: ['enabled', 'target']
            }
        }
        expect(() => merge({ enabled: true }, [{}], dependent)).toThrow(BadRequestException)
        expect(() => merge({ enabled: true }, [{ target: 'safe' }], dependent)).toThrow(BadRequestException)
        expect(() => merge(undefined, [{ enabled: true }, { target: 'safe' }], dependent)).toThrow(BadRequestException)
        expect(merge(undefined, [{ enabled: true, target: 'safe' }], dependent)).toEqual({
            enabled: true,
            target: 'safe'
        })
    })
})
