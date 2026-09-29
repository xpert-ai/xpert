import { decodeMultipartFileName } from '@xpert-ai/server-common'
import { ApiKeyOrClientSecretAuthGuard } from '../shared/guards'
import { ViewExtensionController } from './view-extension.controller'
import { ViewExtensionService } from './view-extension.service'

// '张三-简历.pdf' as busboy reports it when the multipart header is parsed as latin1
const MOJIBAKE_NAME = Buffer.from('张三-简历.pdf', 'utf8').toString('latin1')

describe('ViewExtensionController authentication', () => {
	it('routes API keys and ChatKit client secrets through the mixed auth guard', () => {
		const guards = Reflect.getMetadata('__guards__', ViewExtensionController) as unknown[] | undefined

		expect(Reflect.getMetadata('isPublic', ViewExtensionController)).toBe(true)
		expect(guards).toContain(ApiKeyOrClientSecretAuthGuard)
	})
})

describe('ViewExtensionController slot view discovery', () => {
	it('forwards an explicit draft query without changing the default published request', async () => {
		const service = {
			listSlotViews: jest.fn().mockResolvedValue([])
		}
		const controller = new ViewExtensionController(service as unknown as ViewExtensionService)

		await controller.getSlotViews('agent', 'assistant-1', 'agent.workbench.fixed', 'true')
		await controller.getSlotViews('agent', 'assistant-1', 'agent.workbench.fixed', undefined)

		expect(service.listSlotViews).toHaveBeenNthCalledWith(1, 'agent', 'assistant-1', 'agent.workbench.fixed', {
			isDraft: true
		})
		expect(service.listSlotViews).toHaveBeenNthCalledWith(
			2,
			'agent',
			'assistant-1',
			'agent.workbench.fixed',
			undefined
		)
	})
})

describe('ViewExtensionController file upload file name decoding', () => {
	it('restores a latin1 double-encoded Chinese file name to UTF-8', () => {
		expect(decodeMultipartFileName(MOJIBAKE_NAME)).toBe('张三-简历.pdf')
	})

	it('keeps an already correct Chinese file name unchanged', () => {
		expect(decodeMultipartFileName('张三-简历.pdf')).toBe('张三-简历.pdf')
	})

	it('normalizes originalname before calling the view file action service', async () => {
		const service = {
			executeFileAction: jest.fn().mockResolvedValue({ ok: true })
		}
		const controller = new ViewExtensionController(service as unknown as ViewExtensionService)
		const file = {
			buffer: Buffer.from('resume-content'),
			originalname: MOJIBAKE_NAME,
			mimetype: 'application/pdf',
			size: 1024
		}

		await controller.executeFileAction('agent', 'assistant-1', 'resume.screen', 'upload', file, {})

		const forwardedFile = service.executeFileAction.mock.calls[0][5]
		expect(forwardedFile.originalname).toBe('张三-简历.pdf')
		expect(forwardedFile.buffer).toBe(file.buffer)
		expect(forwardedFile.mimetype).toBe('application/pdf')
		expect(forwardedFile.size).toBe(1024)
	})
})
