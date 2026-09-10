import { createXpertTemplateSource, resolveTemplateSourceFromOptions } from './template-source'

jest.mock('@xpert-ai/server-core', () => ({ normalizePluginName: (name: string) => name }))

describe('template source snapshot', () => {
    it('records the resolved language and content revision and preserves installation time on sync', () => {
        const descriptor = {
            id: '@xpert-ai/agency:frontend',
            pluginName: '@xpert-ai/agency',
            locale: 'zh-Hans',
            pluginVersion: '0.1.0',
            contentHash: 'revision-1'
        }
        const original = createXpertTemplateSource(descriptor)
        const next = createXpertTemplateSource(
            { ...descriptor, pluginVersion: '0.2.0', contentHash: 'revision-2' },
            original
        )
        expect(next.installedAt).toBe(original.installedAt)
        expect(next).toMatchObject({ locale: 'zh-Hans', pluginVersion: '0.2.0', contentHash: 'revision-2' })
        expect(resolveTemplateSourceFromOptions({ templateSource: next })).toEqual(next)
        expect(original.contentHash).toBe('revision-1')
    })
})
