import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { TemplatePublicationService } from './template-publication.service'
import { TemplateAuthoring } from './template-authoring'
import { TemplatePublicationEntity } from '../../xpert-template/lifecycle/template-publication.entity'
import { portableDraft, portableTemplateSchema } from '../../xpert-template/lifecycle/portable-template'

const content = portableTemplateSchema.parse({
    presentation: { title: 'Shareable Office', description: '', starters: [] },
    instructions: {
        primary: 'primary',
        agents: [
            { key: 'primary', name: 'office', title: 'Office', description: '', prompt: 'Follow the supplied ledger.' }
        ]
    },
    runtime: { sandbox: false, middleware: [], connections: [] },
    definition: { metadata: { schemaVersion: 2 } }
})
describe('reviewed template publication', () => {
    let service: TemplatePublicationService, row: TemplatePublicationEntity | null
    const authoring = { load: jest.fn() }
    const repository = { findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() }
    const database = {
        getRepository: () => repository,
        transaction: async (run) => run({ query: jest.fn(), getRepository: () => repository })
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                TemplatePublicationService,
                { provide: TemplateAuthoring, useValue: authoring },
                { provide: DataSource, useValue: database }
            ]
        }).compile()
        service = module.get(TemplatePublicationService)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        row = null
        const draft = portableDraft(content)
        draft.team.copilotModel = { copilotId: 'private-model', model: 'local' }
        authoring.load.mockResolvedValue({ xpert: { tenantId: 'tenant', organizationId: 'org' }, draft, revision: 'r' })
        repository.findOne.mockImplementation(async () => row)
        repository.create.mockImplementation((value) => ({ ...value, id: 'publication' }))
        repository.save.mockImplementation(async (value) => {
            row = value
            return value
        })
    })
    it('publishes only the reviewed portable projection with a server-owned scope', async () => {
        const preview = await service.preview('assistant')
        expect(preview.content).not.toContain('private-model')
        await service.publish('assistant', {
            revision: preview.revision,
            contentHash: preview.contentHash,
            visibility: 'team',
            version: '1.0.0',
            releaseNotes: 'First'
        })
        expect(row).toMatchObject({
            tenantId: 'tenant',
            organizationId: 'org',
            assistantId: 'assistant',
            revoked: false,
            content
        })
        expect(JSON.stringify(row.content)).not.toContain('private-model')
    })
    it('rejects a changed source after preview and prevents version reuse', async () => {
        const preview = await service.preview('assistant')
        const input = {
            revision: preview.revision,
            contentHash: preview.contentHash,
            visibility: 'team' as const,
            version: '1.0.0',
            releaseNotes: ''
        }
        await expect(service.publish('assistant', { ...input, contentHash: 'stale' })).rejects.toMatchObject({
            status: 409
        })
        expect(repository.save).not.toHaveBeenCalled()
        await service.publish('assistant', input)
        await expect(service.publish('assistant', input)).rejects.toMatchObject({ status: 409 })
    })
    it('withdraws only the authorized organization publication', async () => {
        await service.revoke('assistant')
        expect(repository.update).toHaveBeenCalledWith(
            { tenantId: 'tenant', organizationId: 'org', assistantId: 'assistant' },
            { revoked: true }
        )
    })
    it('checks authoring access before reading or publishing portable content', async () => {
        authoring.load.mockRejectedValue(new Error('forbidden'))
        await expect(service.preview('assistant')).rejects.toThrow('forbidden')
        await expect(service.revoke('assistant')).rejects.toThrow('forbidden')
        expect(repository.findOne).not.toHaveBeenCalled()
        expect(repository.update).not.toHaveBeenCalled()
    })
})
