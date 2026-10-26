import { BadRequestException } from '@nestjs/common'
import { ContentEditorsService } from './content-editors.service'
import type { ContentCatalogItem, ResourceContentEditorRegistration } from '@xpert-ai/contracts'

const input = {
    actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
    projectId: 'project',
    assistantId: 'assistant',
    source: { providerKey: 'platform.content.catalog', resourceId: 'stable-id' }
}
const model = { typeId: 'presentation', modelId: 'deck', schemaVersion: '2', editProtocol: { id: 'yjs', version: '2' } }
function setup() {
    const item: ContentCatalogItem = {
        ...model,
        contentId: 'stable-id',
        bindingRevision: 1,
        projectId: 'project',
        resourceRef: { providerKey: 'native', resourceId: 'deck-id' },
        title: 'Deck',
        revision: '3',
        updatedAt: new Date().toISOString(),
        deleted: false,
        source: { kind: 'managed' },
        canWrite: true,
        defaultEditorKey: 'original',
        allowedActions: []
    }
    const descriptor = (key: string): ResourceContentEditorRegistration => ({
        kind: 'resource',
        protocolVersion: 2,
        key,
        title: key,
        view: { providerKey: key, viewKey: 'editor', entry: 'main' },
        supports: [{ ...model, access: ['view', 'edit'] }]
    })
    const original = descriptor('original'),
        compatible = descriptor('compatible'),
        incompatible = descriptor('incompatible')
    incompatible.supports[0].modelId = 'other-deck'
    const registry = {
        listRegistrations: () =>
            [incompatible, compatible, original].map((descriptor) => ({ strategy: { descriptor } }))
    }
    const catalog = { get: jest.fn(async () => item) }
    const defaults = { keys: jest.fn(async (): Promise<string[]> => []) }
    return {
        item,
        compatible,
        defaults,
        service: new ContentEditorsService(
            registry as never,
            { catalog } as never,
            {} as never,
            { check: jest.fn() } as never,
            defaults as never
        )
    }
}
describe('resource editor model compatibility', () => {
    it('selects the resource default deterministically and preserves native selection identity', async () => {
        const f = setup(),
            result = await f.service.resolve(input)
        expect(result.viewKey).toBe('original__editor')
        expect(result.selectionId).toBe('deck-id')
        expect(result.editors?.map((editor) => editor.key)).toEqual(['compatible', 'original'])
        expect(result.canWrite).toBe(true)
    })
    it('supports a compatible replacement without copying or converting the resource', async () => {
        const f = setup(),
            result = await f.service.resolve({ ...input, editorKey: 'compatible' })
        expect(result.resource?.contentId).toBe('stable-id')
        expect(result.selectionId).toBe('deck-id')
        expect(result.viewKey).toBe('compatible__editor')
    })
    it('rejects same-type incompatible models and removed resources', async () => {
        const f = setup()
        await expect(f.service.resolve({ ...input, editorKey: 'incompatible' })).rejects.toBeInstanceOf(
            BadRequestException
        )
        f.item.deleted = true
        await expect(f.service.resolve(input)).rejects.toBeInstanceOf(BadRequestException)
    })
    it('filters incompatible defaults before applying preference precedence', async () => {
        const f = setup()
        f.defaults.keys.mockResolvedValue(['incompatible', 'compatible', 'original'])
        expect((await f.service.resolve(input)).registration.key).toBe('compatible')
        expect((await f.service.resolve({ ...input, editorKey: 'original' })).registration.key).toBe('original')
    })
    it('does not turn a viewer or a view-only editor into a writer', async () => {
        const f = setup()
        f.item.canWrite = false
        expect((await f.service.resolve(input)).canWrite).toBe(false)
        f.item.canWrite = true
        f.compatible.supports[0].access = ['view']
        expect((await f.service.resolve({ ...input, editorKey: 'compatible' })).canWrite).toBe(false)
    })
})
