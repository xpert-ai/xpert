import { CommandBus } from '@nestjs/cqrs'

jest.mock('../../xpert.service', () => ({
	XpertService: class XpertService {}
}))

jest.mock('../../../xpert-template/xpert-template.service', () => ({
	XpertTemplateService: class XpertTemplateService {}
}))

import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertService } from '../../xpert.service'
import { XpertExportCommand } from '../export.command'
import { XpertExportTemplateCommand } from '../export-template.command'
import { XpertExportTemplateHandler } from './export-template.handler'

describe('XpertExportTemplateHandler', () => {
	it('exports DSL, saves it as a template, and records the exported template on the xpert', async () => {
		const xpert = {
			id: 'xpert-1',
			name: 'Support Expert',
			title: 'Support'
		}
		const exportedTemplate = {
			id: 'xpert-xpert-1',
			filePath: 'templates/xpert-xpert-1.yaml',
			exportedAt: '2026-04-30T00:00:00.000Z',
			isDraft: true,
			includeMemory: true
		}
		const xpertService = {
			findOne: jest.fn().mockResolvedValue(xpert),
			update: jest.fn().mockResolvedValue(undefined)
		}
		const xpertTemplateService = {
			saveExportedXpertTemplate: jest.fn().mockResolvedValue(exportedTemplate)
		}
		const commandBus = {
			execute: jest.fn().mockResolvedValue({
				team: {
					name: 'Support Expert'
				},
				nodes: [],
				connections: []
			})
		}
		const handler = new XpertExportTemplateHandler(
			xpertService as unknown as XpertService,
			xpertTemplateService as unknown as XpertTemplateService,
			commandBus as unknown as CommandBus
		)

		await expect(handler.execute(new XpertExportTemplateCommand('xpert-1', true, true))).resolves.toEqual(
			exportedTemplate
		)

		expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(XpertExportCommand)
		expect(xpertTemplateService.saveExportedXpertTemplate).toHaveBeenCalledWith(
			expect.objectContaining({
				xpert,
				dslYaml: expect.stringContaining('team:'),
				isDraft: true,
				includeMemory: true
			})
		)
		expect(xpertService.update).toHaveBeenCalledWith('xpert-1', { exportedTemplate })
	})
})
