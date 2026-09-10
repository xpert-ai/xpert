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

    it('bounds page sizes and searches the complete catalog', () => {
        expect(paginateTemplateCatalog(templates, { limit: 10000, offset: -4 }).limit).toBe(500)
        expect(paginateTemplateCatalog(templates, { search: 'Role 119' }).items[0].id).toBe('role-119')
        expect(paginateTemplateCatalog(templates, { offset: NaN }).offset).toBe(0)
    })
})
