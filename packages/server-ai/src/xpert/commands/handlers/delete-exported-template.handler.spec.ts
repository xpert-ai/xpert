jest.mock('../../xpert.service', () => ({
	XpertService: class XpertService {}
}))

jest.mock('../../../xpert-template/xpert-template.service', () => ({
	XpertTemplateService: class XpertTemplateService {}
}))

import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertService } from '../../xpert.service'
import { XpertDeleteExportedTemplateCommand } from '../delete-exported-template.command'
import { XpertDeleteExportedTemplateHandler } from './delete-exported-template.handler'

describe('XpertDeleteExportedTemplateHandler', () => {
	it('deletes the exported template and clears the xpert record', async () => {
		const exportedTemplate = {
			id: 'xpert-xpert-1',
			filePath: 'templates/xpert-xpert-1.yaml'
		}
		const xpertService = {
			findOne: jest.fn().mockResolvedValue({ id: 'xpert-1', exportedTemplate }),
			update: jest.fn().mockResolvedValue(undefined)
		}
		const xpertTemplateService = {
			deleteExportedXpertTemplate: jest.fn().mockResolvedValue(undefined)
		}
		const handler = new XpertDeleteExportedTemplateHandler(
			xpertService as unknown as XpertService,
			xpertTemplateService as unknown as XpertTemplateService
		)

		await handler.execute(new XpertDeleteExportedTemplateCommand('xpert-1'))

		expect(xpertTemplateService.deleteExportedXpertTemplate).toHaveBeenCalledWith(exportedTemplate)
		expect(xpertService.update).toHaveBeenCalledWith('xpert-1', { exportedTemplate: null })
	})

	it('skips the xpert update when no exported template is recorded', async () => {
		const xpertService = {
			findOne: jest.fn().mockResolvedValue({ id: 'xpert-1', exportedTemplate: null }),
			update: jest.fn().mockResolvedValue(undefined)
		}
		const xpertTemplateService = {
			deleteExportedXpertTemplate: jest.fn().mockResolvedValue(undefined)
		}
		const handler = new XpertDeleteExportedTemplateHandler(
			xpertService as unknown as XpertService,
			xpertTemplateService as unknown as XpertTemplateService
		)

		await handler.execute(new XpertDeleteExportedTemplateCommand('xpert-1'))

		expect(xpertTemplateService.deleteExportedXpertTemplate).toHaveBeenCalledWith(null)
		expect(xpertService.update).not.toHaveBeenCalled()
	})
})
