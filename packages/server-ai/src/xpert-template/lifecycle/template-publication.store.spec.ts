import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TemplatePublicationStore } from './template-publication.store'
import { portableTemplateSchema } from './portable-template'
import * as portableTemplates from './portable-template'
import * as yaml from 'yaml'
import { paginateTemplateCatalog } from '../template-catalog'

jest.mock('./template-publication.entity', () => ({ TemplatePublicationEntity: class {} }))
jest.mock('yaml', () => {
    const actual = jest.requireActual<typeof import('yaml')>('yaml')
    return { ...actual, stringify: jest.fn(actual.stringify) }
})

describe('template publication catalog projection', () => {
    const content = portableTemplateSchema.parse({
        presentation: { title: 'Office', description: 'Office support', starters: [] },
        instructions: {
            primary: 'primary',
            agents: [{ key: 'primary', name: 'office', title: 'Office', description: '', prompt: 'Full instructions' }]
        },
        runtime: { sandbox: false, middleware: [], connections: [] },
        definition: {}
    })
    const row = {
        id: '11111111-1111-4111-8111-111111111111',
        version: 'v1',
        contentHash: 'hash',
        releaseNotes: '',
        content
    }
    let store: TemplatePublicationStore
    const query = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(),
        getMany: jest.fn(),
        getOne: jest.fn()
    }
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        query.getRawMany.mockResolvedValue([{ ...row, content: undefined, presentation: content.presentation }])
        query.getMany.mockResolvedValue([row])
        query.getOne.mockResolvedValue(row)
        store = new TemplatePublicationStore({
            getRepository: () => ({ createQueryBuilder: () => query })
        } as unknown as DataSource)
    })
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('returns identical paginated summaries without selecting or serializing template instructions', async () => {
        const buildDraft = jest.spyOn(portableTemplates, 'portableDraft')
        const serialize = jest.mocked(yaml.stringify).mockClear()
        const summaries = await store.listSummaries()
        expect(buildDraft).not.toHaveBeenCalled()
        expect(serialize).not.toHaveBeenCalled()
        expect(query.getMany).not.toHaveBeenCalled()
        expect(query.addSelect).toHaveBeenCalledWith("publication.content -> 'presentation'", 'presentation')
        expect(query.select).not.toHaveBeenCalledWith('publication.content')
        expect(JSON.stringify(summaries)).not.toContain('Full instructions')
        expect(summaries[0].export_data).toBe('')
        const details = await store.list()
        expect(buildDraft).toHaveBeenCalledTimes(1)
        expect(serialize).toHaveBeenCalledTimes(1)
        expect(paginateTemplateCatalog(summaries)).toEqual(paginateTemplateCatalog(details))
        expect(details[0].export_data).toContain('Full instructions')
        expect((await store.get(`shared-${row.id}`)).export_data).toContain('Full instructions')
        expect(buildDraft).toHaveBeenCalledTimes(2)
        expect(serialize).toHaveBeenCalledTimes(2)
    })

    it('uses the same visibility predicate and current trusted scope as full publication reads', async () => {
        await store.listSummaries()
        expect(query.where).toHaveBeenCalledWith('publication.revoked = false')
        expect(query.andWhere).toHaveBeenCalledWith(
            '(publication.visibility = :public OR (publication."tenantId" = :tenant AND publication."organizationId" = :organization))',
            { public: 'public', tenant: 'tenant', organization: 'org' }
        )
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('other-org')
        await store.listSummaries()
        expect(query.andWhere).toHaveBeenLastCalledWith(expect.any(String), {
            public: 'public',
            tenant: 'tenant',
            organization: 'other-org'
        })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        query.getRawMany.mockClear()
        expect(await store.listSummaries()).toEqual([])
        expect(query.getRawMany).not.toHaveBeenCalled()
    })

    it('validates presentation read through the raw projection boundary', async () => {
        query.getRawMany.mockResolvedValue([{ ...row, presentation: { title: 42 } }])
        await expect(store.listSummaries()).rejects.toThrow()
    })
})
