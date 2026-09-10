jest.mock('../../knowledgebase.service', () => ({ KnowledgebaseService: class {} }))
jest.mock('@xpert-ai/server-core', () => ({ IntegrationService: class {} }))
import type { IntegrationService } from '@xpert-ai/server-core'
import type { KnowledgebaseService } from '../../knowledgebase.service'
import { GetKnowledgebaseProcessingOptionsHandler } from './knowledgebase-processing-options.handler'

function fixture(config = {}) {
    const knowledgebase = {
        findOneByIdString: jest.fn().mockResolvedValue({ id: 'kb', parserConfig: config }),
        getDocumentTransformerStrategies: jest
            .fn()
            .mockResolvedValue([
                { meta: { name: 'default', label: { en_US: 'Standard' } } },
                { meta: { name: 'pdf-visual', label: { en_US: 'PDF' } } },
                { meta: { name: 'ocr-a', label: { en_US: 'OCR A' } }, integration: { service: 'ocr-service' } },
                { meta: { name: 'ocr-b', label: { en_US: 'OCR B' } }, integration: { service: 'other-service' } }
            ])
    }
    const integrations = {
        findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({
            items: [
                { id: 'allowed', name: 'OCR connection', provider: 'ocr-service' },
                { id: 'wrong-provider', name: 'Different service', provider: 'other-service' }
            ]
        }),
        findAll: jest.fn()
    }
    return {
        knowledgebase,
        integrations,
        handler: new GetKnowledgebaseProcessingOptionsHandler(
            knowledgebase as unknown as KnowledgebaseService,
            integrations as unknown as IntegrationService
        )
    }
}

describe('Knowledge document processing choices', () => {
    it('uses the platform file-type default and preserves Knowledge chunk settings', async () => {
        const f = fixture({ chunkSize: 2000, chunkOverlap: 100 })
        const result = await f.handler.execute({ input: { knowledgebaseId: 'kb', fileName: 'AUTO-MOTOR.PDF' } })
        expect(result).toMatchObject({
            processor: 'pdf-visual',
            defaultSource: 'platform',
            integrationRequired: false,
            parserConfig: { transformerType: 'pdf-visual', chunkSize: 2000, chunkOverlap: 100 }
        })
        expect(f.integrations.findAllInOrganizationOrTenant).not.toHaveBeenCalled()
        expect(f.knowledgebase.findOneByIdString).toHaveBeenCalledWith('kb', {
            select: { id: true, parserConfig: true }
        })
    })
    it('reads existing explicit parser settings without creating a new settings store', async () => {
        const f = fixture({
            transformerType: 'ocr-a',
            transformerIntegration: 'allowed',
            transformer: { preserveRawOutput: true }
        })
        const result = await f.handler.execute({ input: { knowledgebaseId: 'kb', fileName: 'AUTO-MOTOR.pdf' } })
        expect(result).toMatchObject({
            processor: 'ocr-a',
            selectedIntegrationId: 'allowed',
            parserConfig: { transformer: { preserveRawOutput: true } }
        })
        expect(result.integrations).toEqual([{ id: 'allowed', name: 'OCR connection', provider: 'ocr-service' }])
    })
    it('uses registered integration services and selects a sole accessible connection', async () => {
        const f = fixture()
        const result = await f.handler.execute({
            input: { knowledgebaseId: 'kb', fileName: 'AUTO.pdf', processor: 'ocr-a' }
        })
        expect(result).toMatchObject({
            integrationRequired: true,
            selectedIntegrationId: 'allowed',
            parserConfig: { transformerIntegration: 'allowed' }
        })
        expect(f.integrations.findAllInOrganizationOrTenant).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { provider: 'ocr-service' },
                select: { id: true, name: true, provider: true }
            })
        )
    })
    it('never returns integration credentials or silently accepts an inaccessible connection', async () => {
        const f = fixture()
        await expect(
            f.handler.execute({
                input: {
                    knowledgebaseId: 'kb',
                    fileName: 'AUTO.pdf',
                    processor: 'ocr-a',
                    transformerIntegration: 'foreign'
                }
            })
        ).rejects.toThrow()
        f.integrations.findAllInOrganizationOrTenant.mockResolvedValue({ items: [] })
        const result = await f.handler.execute({
            input: { knowledgebaseId: 'kb', fileName: 'AUTO.pdf', processor: 'ocr-a' }
        })
        expect(result.selectedIntegrationId).toBeUndefined()
        expect(result.integrationRequired).toBe(true)
    })
    it('does not pick arbitrarily among multiple connections', async () => {
        const f = fixture()
        f.integrations.findAllInOrganizationOrTenant.mockResolvedValue({
            items: [
                { id: 'one', provider: 'ocr-service' },
                { id: 'two', provider: 'ocr-service' }
            ]
        })
        expect(
            (await f.handler.execute({ input: { knowledgebaseId: 'kb', fileName: 'AUTO.pdf', processor: 'ocr-a' } }))
                .selectedIntegrationId
        ).toBeUndefined()
    })
    it('clears incompatible integration settings after switching engines', async () => {
        const f = fixture({
            transformerType: 'ocr-a',
            transformerIntegration: 'allowed',
            transformer: { ocrSpecific: true }
        })
        const result = await f.handler.execute({
            input: { knowledgebaseId: 'kb', fileName: 'AUTO.docx', processor: 'default' }
        })
        expect(result.parserConfig.transformerIntegration).toBeUndefined()
        expect(result.parserConfig.transformer).toBeUndefined()
        expect(result.providers.some((item) => item.name === 'pdf-visual')).toBe(false)
    })
    it('rejects unregistered parsers and checks Knowledge scope before querying integrations', async () => {
        const f = fixture()
        await expect(
            f.handler.execute({ input: { knowledgebaseId: 'kb', fileName: 'AUTO.pdf', processor: 'unknown' } })
        ).rejects.toThrow()
        f.knowledgebase.findOneByIdString.mockRejectedValue(new Error('Forbidden'))
        await expect(
            f.handler.execute({ input: { knowledgebaseId: 'foreign', fileName: 'AUTO.pdf', processor: 'ocr-a' } })
        ).rejects.toThrow('Forbidden')
        expect(f.integrations.findAllInOrganizationOrTenant).not.toHaveBeenCalled()
    })
})
