import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { AIV1Controller } from './ai-v1.controller'
import { KnowledgesController } from './knowledge.controller'

type KnowledgeApiController = Pick<
    KnowledgesController,
    'updateKnowledgebase' | 'deleteKnowledgebase' | 'createDocBulk' | 'start' | 'getStatus'
>

function createController(kind: 'legacy' | 'v1') {
    const kbService = {
        assertKnowledgebaseWriteAccess: jest.fn(),
        updateKnowledgebase: jest.fn().mockResolvedValue({ id: 'kb-owner' }),
        delete: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const docService = {
        createBulk: jest.fn().mockResolvedValue([]),
        assertOwnedStorageFiles: jest.fn(),
        prepareExternalDocumentInputs: jest.fn(),
        assertDocumentsWriteAccessInKnowledgebase: jest.fn(),
        assertDocumentsReadAccessInKnowledgebase: jest.fn(),
        startProcessing: jest.fn().mockResolvedValue(undefined),
        findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
    }
    const controller: KnowledgeApiController =
        kind === 'legacy'
            ? new KnowledgesController({} as never, {} as never, kbService as never, docService as never)
            : new AIV1Controller(
                  {} as never,
                  {} as never,
                  kbService as never,
                  docService as never,
                  {} as never,
                  {} as never
              )

    return { controller, kbService, docService }
}

describe.each(['legacy', 'v1'] as const)('%s knowledge API access', (kind) => {
    it('stops a victim knowledgebase update before mutation', async () => {
        const { controller, kbService } = createController(kind)
        kbService.assertKnowledgebaseWriteAccess.mockRejectedValue(new ForbiddenException())

        await expect(controller.updateKnowledgebase('kb-victim', {} as never)).rejects.toBeInstanceOf(
            ForbiddenException
        )

        expect(kbService.updateKnowledgebase).not.toHaveBeenCalled()
    })

    it('forces bulk-created documents into the authorized route knowledgebase', async () => {
        const { controller, kbService, docService } = createController(kind)

        await controller.createDocBulk('kb-owner', [
            { id: 'doc-1', knowledgebaseId: 'kb-victim', name: 'manual.pdf' } as never
        ])

        expect(kbService.assertKnowledgebaseWriteAccess).toHaveBeenCalledWith('kb-owner')
        expect(docService.assertOwnedStorageFiles).toHaveBeenCalled()
        expect(docService.prepareExternalDocumentInputs).toHaveBeenCalled()
        expect(docService.createBulk).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'doc-1', knowledgebaseId: 'kb-owner' })
        ])
    })

    it('stops a direct remote file URL before document creation', async () => {
        const { controller, docService } = createController(kind)
        docService.prepareExternalDocumentInputs.mockRejectedValue(new BadRequestException())

        await expect(
            controller.createDocBulk('kb-owner', [
                { knowledgebaseId: 'kb-owner', fileUrl: 'http://127.0.0.1/internal' } as never
            ])
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(docService.createBulk).not.toHaveBeenCalled()
    })

    it('rejects processing a document outside the route knowledgebase', async () => {
        const { controller, docService } = createController(kind)
        docService.assertDocumentsWriteAccessInKnowledgebase.mockRejectedValue(new NotFoundException())

        await expect(controller.start('kb-owner', ['doc-victim'])).rejects.toBeInstanceOf(NotFoundException)

        expect(docService.startProcessing).not.toHaveBeenCalled()
    })

    it('scopes status reads to the route knowledgebase', async () => {
        const { controller, docService } = createController(kind)

        await controller.getStatus('kb-owner', 'doc-1,doc-2')

        expect(docService.assertDocumentsReadAccessInKnowledgebase).toHaveBeenCalledWith(['doc-1', 'doc-2'], 'kb-owner')
        expect(docService.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ knowledgebaseId: 'kb-owner' })
            })
        )
    })
})
