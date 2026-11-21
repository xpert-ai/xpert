import { INestApplication, HttpException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { AddressInfo } from 'node:net'
import { FileUploadController } from './file-upload.controller'
import { UploadFileCommand } from './upload-file.command'
import { UploadFileService } from './upload-file.service'

jest.mock('../../core', () => ({
	RequestContext: {
		currentTenantId: () => 'tenant',
		getOrganizationId: () => 'org',
		currentUserId: () => 'user'
	}
}))
jest.mock('../../storage-file/storage-file.service', () => ({ StorageFileService: class {} }))
jest.mock('../file-storage', () => ({ FileStorage: class {} }))
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

describe('multipart upload HTTP failures', () => {
	let app: INestApplication
	let origin: string
	const upload = jest.fn()
	beforeAll(async () => {
		const service = new UploadFileService({} as never, { get: () => ({ upload }) } as never)
		const module = await Test.createTestingModule({
			controllers: [FileUploadController],
			providers: [
				{
					provide: CommandBus,
					useValue: { execute: (command: UploadFileCommand) => service.upload(command.input) }
				}
			]
		}).compile()
		app = module.createNestApplication({ logger: false })
		await app.listen(0, '127.0.0.1')
		origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`
	})
	afterAll(async () => {
		await app?.close()
	})
	beforeEach(() => upload.mockReset())

	const submit = () => {
		const form = new FormData()
		form.append('targets', JSON.stringify([{ kind: 'storage' }]))
		form.append('file', new Blob(['synthetic test data']), 'test.txt')
		return fetch(`${origin}/upload`, { method: 'POST', body: form })
	}

	it.each([403, 413, 429, 503])(
		'returns the original status %s, code and message through Nest',
		async (statusCode) => {
			const error = new HttpException(
				{ code: 'upload_denied', message: '上传被拒绝。', privateData: 'secret' },
				statusCode
			)
			error.message = 'internal-discriminator'
			upload.mockRejectedValueOnce(error)
			const response = await submit()
			expect(response.status).toBe(statusCode)
			expect(await response.json()).toEqual({ statusCode, code: 'upload_denied', message: '上传被拒绝。' })
		}
	)

	it('returns a safe 500 for an unexpected storage failure', async () => {
		upload.mockRejectedValueOnce(new Error('password=private'))
		const response = await submit()
		expect(response.status).toBe(500)
		expect(await response.json()).toEqual({ statusCode: 500, message: 'Failed to upload file.' })
	})

	it('preserves successful response data', async () => {
		upload.mockResolvedValueOnce({ kind: 'storage', status: 'success', path: 'stored.txt' })
		const response = await submit()
		expect(response.status).toBe(201)
		expect(await response.json()).toMatchObject({
			status: 'success',
			destinations: [{ kind: 'storage', status: 'success', path: 'stored.txt' }]
		})
	})
})
