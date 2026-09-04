jest.mock('./knowledge-faq.service', () => ({
    KnowledgeFAQService: class KnowledgeFAQService {}
}))

import { BadRequestException } from '@nestjs/common'
import { KnowledgeFAQController } from './knowledge-faq.controller'

describe('KnowledgeFAQController', () => {
    it('preserves an explicit false enabled filter and parses pagination', async () => {
        const service = {
            findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const controller = new KnowledgeFAQController(service as never)

        await controller.findAll('kb-1', 'password', 'false', '20', '10')

        expect(service.findAll).toHaveBeenCalledWith('kb-1', {
            search: 'password',
            enabled: false,
            skip: 20,
            take: 10
        })
    })

    it('rejects invalid enabled and version query values', async () => {
        const service = { findAll: jest.fn(), delete: jest.fn() }
        const controller = new KnowledgeFAQController(service as never)

        expect(() => controller.findAll('kb-1', undefined, 'yes')).toThrow(BadRequestException)
        await expect(controller.delete('kb-1', 'faq-1', '0')).rejects.toBeInstanceOf(BadRequestException)
        expect(service.delete).not.toHaveBeenCalled()
    })

    it('loads one FAQ by its canonical id for citation deep links', async () => {
        const service = {
            findOne: jest.fn().mockResolvedValue({ id: 'faq-1' })
        }
        const controller = new KnowledgeFAQController(service as never)

        await controller.findOne('kb-1', 'faq-1')

        expect(service.findOne).toHaveBeenCalledWith('kb-1', 'faq-1')
    })

    it('passes replace mode and selected UUIDs to import and export operations', async () => {
        const file = { originalname: 'faq.csv', buffer: Buffer.from('csv') } as Express.Multer.File
        const exported = {
            content: Buffer.from('csv'),
            contentType: 'text/csv; charset=utf-8',
            fileName: 'faq-export.csv'
        }
        const service = {
            importFile: jest.fn().mockResolvedValue({ total: 1, imported: 1, failed: [] }),
            exportFile: jest.fn().mockResolvedValue(exported)
        }
        const response = { setHeader: jest.fn() }
        const controller = new KnowledgeFAQController(service as never)
        const firstId = '123e4567-e89b-42d3-a456-426614174000'
        const secondId = '123e4567-e89b-42d3-a456-426614174001'

        await controller.importFile('kb-1', 'replace', file)
        await controller.exportFile('kb-1', 'json', `${firstId},${secondId}`, response as never)

        expect(service.importFile).toHaveBeenCalledWith('kb-1', file, 'replace')
        expect(service.exportFile).toHaveBeenCalledWith('kb-1', 'json', [firstId, secondId])
        expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="faq-export.csv"')
    })

    it('rejects invalid import modes and selected export ids', async () => {
        const file = { originalname: 'faq.csv', buffer: Buffer.from('csv') } as Express.Multer.File
        const service = { importFile: jest.fn(), exportFile: jest.fn() }
        const controller = new KnowledgeFAQController(service as never)

        expect(() => controller.importFile('kb-1', 'merge', file)).toThrow(BadRequestException)
        await expect(
            controller.exportFile('kb-1', 'csv', 'not-an-id', { setHeader: jest.fn() } as never)
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})
