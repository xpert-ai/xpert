import { getMetadataArgsStorage } from 'typeorm'
import { TemplateInstallationEntity } from './template-installation.entity'

describe('persisted template dependency locks', () => {
    const column = getMetadataArgsStorage().columns.find(
        (item) => item.target === TemplateInstallationEntity && item.propertyName === 'dependencyLocks'
    )
    const transformer = column?.options.transformer
    if (!transformer || Array.isArray(transformer)) throw new Error('Expected dependency lock column transformer')

    it('preserves legacy rows without locks', () => {
        expect(transformer.from(null)).toBeNull()
    })

    it('loads concrete dependency locks', () => {
        const locks = [{ pluginName: 'example-plugin', version: '1.0.0', components: [] }]
        expect(transformer.from(locks)).toEqual(locks)
        expect(transformer.to(locks)).toEqual(locks)
    })

    it('rejects malformed persisted metadata before it reaches installation or receipt logic', () => {
        expect(() => transformer.from([{ pluginName: 'example-plugin', version: 1, components: [] }])).toThrow()
        expect(() =>
            transformer.from([{ pluginName: 'example-plugin', version: '1', components: [], secret: 'x' }])
        ).toThrow()
    })
})
