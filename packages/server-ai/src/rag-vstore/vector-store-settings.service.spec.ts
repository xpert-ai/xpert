jest.mock('@xpert-ai/plugin-sdk', () => ({ VectorStoreRegistry: class VectorStoreRegistry {} }))
jest.mock('@xpert-ai/server-config', () => ({ environment: { vectorStore: 'pgvector' } }))
import { VectorTypeEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { VectorStoreRegistry } from '@xpert-ai/plugin-sdk'
import { VectorStoreSettingsService } from './vector-store-settings.service'

describe('Knowledgebase vector storage selection', () => {
    const original = environment.vectorStore
    afterEach(() => {
        environment.vectorStore = original
    })

    function setup(milvusAvailable = true) {
        const registry = {
            get: jest.fn((type) => (type === VectorTypeEnum.MILVUS && milvusAvailable ? {} : undefined))
        }
        return new VectorStoreSettingsService(registry as unknown as VectorStoreRegistry)
    }

    it('persists an explicit choice independently of the deployment default', () => {
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        expect(setup().forCreate(VectorTypeEnum.MILVUS)).toBe(VectorTypeEnum.MILVUS)
        environment.vectorStore = VectorTypeEnum.MILVUS
        expect(setup().forCreate(VectorTypeEnum.PGVECTOR)).toBe(VectorTypeEnum.PGVECTOR)
    })

    it('resolves an omitted choice to the current concrete default', () => {
        environment.vectorStore = VectorTypeEnum.MILVUS
        expect(setup().forCreate(undefined)).toBe(VectorTypeEnum.MILVUS)
    })

    it('hides and rejects unavailable Milvus without falling back', () => {
        expect(setup(false).options().stores).toEqual([{ type: VectorTypeEnum.PGVECTOR }])
        expect(() => setup(false).forCreate(VectorTypeEnum.MILVUS)).toThrow()
        expect(() => setup().forCreate('invalid' as VectorTypeEnum)).toThrow()
    })

    it('rejects switching or clearing a saved backend while permitting unchanged updates', () => {
        const service = setup()
        expect(() => service.assertUnchanged(VectorTypeEnum.MILVUS, VectorTypeEnum.PGVECTOR)).toThrow()
        expect(() => service.assertUnchanged(VectorTypeEnum.MILVUS, null)).toThrow()
        expect(() => service.assertUnchanged(VectorTypeEnum.MILVUS, undefined)).not.toThrow()
        expect(() => service.assertUnchanged(VectorTypeEnum.MILVUS, VectorTypeEnum.MILVUS)).not.toThrow()
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        expect(() => service.assertUnchanged(null, VectorTypeEnum.PGVECTOR)).not.toThrow()
        expect(() => service.assertUnchanged(null, VectorTypeEnum.MILVUS)).toThrow()
    })
})
