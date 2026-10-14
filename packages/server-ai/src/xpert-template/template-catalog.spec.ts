import { XpertTypeEnum, TXpertTemplate } from '@xpert-ai/contracts'
import { paginateTemplateCatalog } from './template-catalog'

describe('template catalog', () => {
    const templates: TXpertTemplate[] = Array.from({ length: 120 }, (_, index) => ({
        id: `role-${index}`,
        name: `role-${index}`,
        title: `Role ${index}`,
        description: 'Role prompt',
        category: index % 2 ? 'design' : 'engineering',
        copyright: '',
        avatar: {},
        type: XpertTypeEnum.Agent,
        export_data: 'private full DSL',
        pluginName: 'agency'
    }))

    it('filters before pagination and omits both DSL aliases', () => {
        const result = paginateTemplateCatalog(
            templates.map((item) => ({ ...item, dslContent: 'other DSL' })),
            {
                category: 'engineering',
                offset: 10,
                limit: 12
            }
        )
        expect(result.total).toBe(60)
        expect(result.items).toHaveLength(12)
        expect(result.items[0].id).toBe('role-20')
        expect(result.categories).toEqual(['design', 'engineering'])
        expect(JSON.stringify(result)).not.toContain('DSL')
        expect(result.items[0]).not.toHaveProperty('export_data')
        expect(result.items[0]).not.toHaveProperty('dslContent')
    })

    it('returns a strict lightweight whitelist and moves inline avatars to authorized assets', () => {
        const [item] = paginateTemplateCatalog([
            {
                ...templates[0],
                avatar: { url: 'data:image/png;base64,aGVsbG8=' },
                promptWorkflows: [],
                targetAppMeta: {}
            }
        ]).items
        expect(item.avatar.url).toMatch(/^\/api\/xpert-template\/catalog-avatar\/role-0\?v=[a-f0-9]{64}$/)
        expect(item).not.toHaveProperty('promptWorkflows')
        expect(item).not.toHaveProperty('targetAppMeta')
        expect(item).not.toHaveProperty('icon')
        expect(item).not.toHaveProperty('unexpected')
    })
    it('bounds page sizes and searches the complete catalog', () => {
        expect(paginateTemplateCatalog(templates, { limit: 10000, offset: -4 }).limit).toBe(500)
        expect(paginateTemplateCatalog(templates, { search: 'Role 119' }).items[0].id).toBe('role-119')
        expect(paginateTemplateCatalog(templates, { offset: NaN }).offset).toBe(0)
    })
    it('groups sources before slicing pages without changing order within each group', () => {
        const entries = ['builtin', 'plugin', 'shared', 'agent-plugin', 'plugin', 'agent-plugin'].map((source, i) => ({
            ...templates[i],
            source
        }))
        const first = paginateTemplateCatalog(entries, { limit: 3 })
        const second = paginateTemplateCatalog(entries, { offset: 3, limit: 3 })
        expect(first.items.map((item) => item.id)).toEqual(['role-3', 'role-5', 'role-1'])
        expect(second.items.map((item) => item.source)).toEqual(['plugin', 'builtin', 'shared'])
        expect(first.total).toBe(6)
    })
})
